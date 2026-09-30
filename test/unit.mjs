// Unit tests: the built SDK against a mock fetch — no network, no stack. CI runs these on every
// push and before every publish; test/e2e.mjs (scripts/test-sdk-js.sh) covers a live origin.
//   npm run build && npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LICENSES, PaymentRequiredError, SignatureError, Witan, WitanError, defaultPayUrl, deprecationNotice, endorsementStatement, signedStatement, updatePinnedKeys, verifyManifest,
} from "../dist/index.js";

const BASE = "http://api.test";
const ORIGIN = "https://origin.test";

// ---- a mock fetch: route table + call log ------------------------------------------------
function mock(routes) {
  const calls = [];
  const fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const body = init.body;
    const call = { method: init.method ?? "GET", url, headers: init.headers ?? {}, body };
    calls.push(call);
    for (const [pattern, handler] of routes) {
      const [method, path] = pattern.split(" ");
      if (method === call.method && (path === url.pathname || (path.endsWith("*") && url.pathname.startsWith(path.slice(0, -1))) || path === url.host)) {
        return handler(call);
      }
    }
    return json(404, { error: `no route for ${call.method} ${url.pathname}` });
  };
  return { fetch, calls };
}
const json = (status, data, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...headers } });
const client = (routes, opts = {}) => {
  const m = mock(routes);
  return { w: new Witan({ baseUrl: BASE, apiKey: "km_test", fetch: m.fetch, retries: 2, ...opts }), calls: m.calls };
};
async function bytesOf(body) {
  if (body instanceof Uint8Array) return body;
  return new Uint8Array(await new Response(body).arrayBuffer());
}
async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}
async function gzip(text) {
  const stream = new Blob([new TextEncoder().encode(text)]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ---- a test-only origin signer (WebCrypto Ed25519) ---------------------------------------
const b64 = (u8) => btoa(String.fromCharCode(...u8));
async function signer() {
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const kid = [...new Uint8Array(await crypto.subtle.digest("SHA-256", raw))].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
  const keys = { origin: ORIGIN, keys: [{ kid, alg: "Ed25519", publicKey: b64(raw) }] };
  const sign = async (manifest, origin = ORIGIN) => {
    const sig = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, pair.privateKey, new TextEncoder().encode(signedStatement(manifest, origin))));
    return { ...manifest, signature: { alg: "Ed25519", kid, origin, sig: b64(sig) } };
  };
  return { keys, sign };
}
const manifest = () => ({
  format: "witan-dataset-manifest/1", project: "p", version: 3, createdAt: "2026-09-25T00:00:00Z",
  parts: [{ sha256: "a".repeat(64), bytes: 10, records: 2, url: "http://store.test/a" },
          { sha256: "b".repeat(64), bytes: 5, records: 1, url: "http://store.test/b" }],
  totals: { records: 3, bytes: 15, parts: 2, contributions: 2 }, urlExpiresAt: "2026-09-25T00:15:00Z",
});

// ---- signatures ---------------------------------------------------------------------------
test("the signed statement is the origin's: stable JSON of the manifest without URLs", () => {
  const s = signedStatement({ project: "p", version: 1, format: "witan-dataset-manifest/1", urlExpiresAt: "t", paid: true,
    parts: [{ sha256: "ab", bytes: 1, url: "http://x" }], signature: { sig: "..." } }, "https://o");
  assert.equal(s, '{"manifest":{"format":"witan-dataset-manifest/1","parts":[{"bytes":1,"sha256":"ab"}],"project":"p","version":1},"origin":"https://o","v":1}');
});

test("verifyManifest accepts the origin's signature, also with fresh URLs", async () => {
  const { keys, sign } = await signer();
  const m = await sign(manifest());
  assert.equal(await verifyManifest(m, keys), "verified");
  const fresh = { ...m, urlExpiresAt: "2030-01-01T00:00:00Z", parts: m.parts.map((p) => ({ ...p, url: "http://mirror.test/x" })) };
  assert.equal(await verifyManifest(fresh, keys, { require: true }), "verified");
});

test("verifyManifest refuses any change, other origins and unpinned keys", async () => {
  const { keys, sign } = await signer();
  const other = await signer();
  const m = await sign(manifest());
  const bad = [
    { ...m, totals: { ...m.totals, records: 4 } },
    { ...m, version: 4 },
    { ...m, parts: m.parts.slice(1) },
    { ...m, parts: [{ ...m.parts[0], sha256: "c".repeat(64) }, m.parts[1]] },
    { ...m, signature: { ...m.signature, sig: b64(new Uint8Array(64)) } },
  ];
  for (const changed of bad) await assert.rejects(verifyManifest(changed, keys), SignatureError);
  await assert.rejects(verifyManifest(m, { ...keys, origin: "https://elsewhere.test" }), SignatureError);
  await assert.rejects(verifyManifest(await other.sign(manifest()), keys), SignatureError); // a kid not pinned
  const forged = await other.sign(manifest());
  await assert.rejects(verifyManifest({ ...forged, signature: { ...forged.signature, kid: keys.keys[0].kid } }, keys), SignatureError);
});

test("unsigned manifests are reported, and refused with require", async () => {
  const { keys } = await signer();
  assert.equal(await verifyManifest(manifest(), keys), "unsigned");
  await assert.rejects(verifyManifest(manifest(), keys, { require: true }), SignatureError);
});

test("manifest({ verify }) checks before returning", async () => {
  const { keys, sign } = await signer();
  const good = await sign(manifest());
  let serve = good;
  const { w } = client([["GET /projects/p/manifest", () => json(200, serve)]]);
  assert.equal((await w.projects.manifest("p", { verify: keys })).version, 3);
  serve = { ...good, totals: { ...good.totals, records: 99 } };
  await assert.rejects(w.projects.manifest("p", { verify: keys }), SignatureError);
});

test("manifest({ verify }) refuses a validly signed manifest of another project or version", async () => {
  const { keys, sign } = await signer();
  const m = await sign(manifest()); // project p, version 3
  const { w } = client([["GET /projects/*", () => json(200, m)]]);
  await assert.rejects(w.projects.manifest("q", { verify: keys }), (e) => e instanceof SignatureError && /got a manifest of p v3/.test(e.message));
  await assert.rejects(w.projects.manifest("p", { version: 2, verify: keys }), SignatureError);
  assert.equal((await w.projects.manifest("p", { version: 3, verify: keys })).version, 3);
});

test("the signed statement leaves out an attached x402 receipt, as it does paid", async () => {
  const { keys, sign } = await signer();
  const m = await sign(manifest());
  assert.equal(await verifyManifest({ ...m, paid: true, x402: { success: true, transaction: "0x" + "ab".repeat(32) } }, keys), "verified");
});

test("keys() reads /.well-known/witan-keys without a key", async () => {
  const { keys } = await signer();
  const m = mock([["GET /.well-known/witan-keys", () => json(200, keys)]]);
  const anon = new Witan({ baseUrl: ORIGIN, fetch: m.fetch });
  assert.deepEqual(await anon.keys(), keys);
  assert.equal(m.calls[0].headers.authorization, undefined);
  for (const same of ["https://ORIGIN.test", "https://origin.test:443/"]) {
    assert.deepEqual(await new Witan({ baseUrl: same, fetch: m.fetch }).keys(), keys);
  }
});

test("keys() refuses a document for another origin unless told whom the server speaks for", async () => {
  const { keys } = await signer(); // origin https://origin.test
  const m = mock([["GET /.well-known/witan-keys", () => json(200, keys)]]);
  for (const base of [BASE, "http://origin.test", "https://origin.test:8443", "https://origin.test.evil"]) {
    await assert.rejects(new Witan({ baseUrl: base, fetch: m.fetch }).keys(), SignatureError, base);
  }
  const proxied = new Witan({ baseUrl: BASE, fetch: m.fetch });
  assert.deepEqual(await proxied.keys({ origin: ORIGIN + "/" }), keys); // a proxy for the origin
  await assert.rejects(proxied.keys({ origin: "https://elsewhere.test" }), SignatureError);
  const bare = mock([["GET /.well-known/witan-keys", () => json(200, { keys: keys.keys })]]);
  await assert.rejects(new Witan({ baseUrl: ORIGIN, fetch: bare.fetch }).keys(), SignatureError); // no origin at all
});

// ---- transport ----------------------------------------------------------------------------
test("errors: 404 is WitanError, 402 is PaymentRequiredError with the pay URL", async () => {
  const { w } = client([
    ["GET /projects/missing", () => json(404, { error: "project not found" })],
    ["GET /projects/paid/data", () => json(402, { error: "payment required", price: "$0.10", pay: "http://pay.test/x" })],
  ]);
  await assert.rejects(w.projects.get("missing"), (e) => e instanceof WitanError && e.status === 404 && e.message === "project not found");
  await assert.rejects(w.projects.data("paid"), (e) => e instanceof PaymentRequiredError && e.pay === "http://pay.test/x" && e.price === "$0.10");
});

test("the pay URL follows the base URL; a local stack keeps its own pay port", () => {
  assert.equal(defaultPayUrl("https://witan.example"), "https://witan.example");
  for (const local of ["http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000"]) {
    assert.equal(defaultPayUrl(local), "http://localhost:3001");
  }
  const f = async () => json(200, {});
  assert.equal(new Witan({ baseUrl: "https://witan.example/", fetch: f }).payUrl, "https://witan.example");
  assert.equal(new Witan({ baseUrl: "https://witan.example", payUrl: "https://pay.example/", fetch: f }).payUrl, "https://pay.example");
});

test("with nothing set, the client reaches the public service", async () => {
  const saved = { base: process.env.WITAN_BASE_URL, pay: process.env.WITAN_PAY_URL };
  delete process.env.WITAN_BASE_URL;
  delete process.env.WITAN_PAY_URL;
  try {
    const seen = [];
    const w = new Witan({ fetch: async (url) => { seen.push(String(url)); return json(200, []); } });
    assert.equal(w.baseUrl, "https://witan.markets");
    assert.equal(w.payUrl, "https://witan.markets");
    await w.search("redis");
    assert.ok(seen[0].startsWith("https://witan.markets/search"), seen[0]);
  } finally {
    if (saved.base !== undefined) process.env.WITAN_BASE_URL = saved.base;
    if (saved.pay !== undefined) process.env.WITAN_PAY_URL = saved.pay;
  }
});

test("an unreachable origin, a redirect and a web page are named, not thrown raw", async () => {
  const refused = new Witan({ baseUrl: BASE, fetch: async () => { throw new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } }); }, retries: 0 });
  await assert.rejects(refused.projects.list(), (e) => e instanceof WitanError && e.message.startsWith("cannot reach http://api.test: ECONNREFUSED"));
  const slow = new Witan({ baseUrl: BASE, fetch: async () => { throw Object.assign(new Error("aborted"), { name: "TimeoutError" }); }, retries: 0, timeoutMs: 5000 });
  await assert.rejects(slow.projects.list(), (e) => e instanceof WitanError && e.message === "http://api.test did not answer within 5s");
  const seen = [];
  const moved = new Witan({ baseUrl: "http://witan.example", fetch: async (u, init) => { seen.push(init.redirect); return new Response(null, { status: 301, headers: { location: "https://witan.example/projects" } }); } });
  await assert.rejects(moved.projects.list(), (e) => e instanceof WitanError && e.status === 301 && e.message.includes("redirected to https://witan.example/projects"));
  assert.deepEqual(seen, ["manual"]); // not followed: a POST would silently turn into a GET
  const parked = new Witan({ baseUrl: BASE, fetch: async () => new Response("<!doctype html><p>parked", { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }) });
  await assert.rejects(parked.projects.list(), (e) => e instanceof WitanError && e.message.includes("answered with text/html, not JSON"));
  const payDown = new Witan({ baseUrl: "https://witan.example", fetch: async () => { throw new TypeError("fetch failed", { cause: { code: "ENOTFOUND" } }); } });
  await assert.rejects(payDown.purchases({ address: "0x" + "00".repeat(20), sign: async () => "0x" }), (e) => e instanceof WitanError && e.message.startsWith("cannot reach https://witan.example: ENOTFOUND"));
});

test("error messages: the schema detail over the phrase, never a proxy's HTML page", async () => {
  const { w } = client([
    ["POST /projects/p/contribute", () => json(400, { statusCode: 400, error: "Bad Request", message: "body/records must NOT have fewer than 1 items" })],
    ["GET /projects/down", () => new Response("<!doctype html><html>" + "cloudflare ".repeat(500) + "</html>", { status: 502, statusText: "Bad Gateway", headers: { "content-type": "text/html" } })],
  ], { retries: 0 });
  await assert.rejects(w.projects.contribute("p", [{ k: 1 }]), (e) => e.status === 400 && e.message === "body/records must NOT have fewer than 1 items");
  await assert.rejects(w.projects.get("down"), (e) => e.status === 502 && e.message === "502 Bad Gateway" && e.body.length <= 500);
});

test("fetch is called unbound: Workers and browsers refuse another `this`", async () => {
  const m = mock([["GET /projects", () => json(200, { projects: [] })], ["GET /purchases/statement", () => json(500, {})]]);
  function strictFetch(input, init) {
    if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
    return m.fetch(input, init);
  }
  const w = new Witan({ baseUrl: BASE, payUrl: "http://pay.test", fetch: strictFetch, retries: 0 });
  assert.deepEqual(await w.projects.list(), []);
  await assert.rejects(w.purchases({ address: "0x" + "00".repeat(20), sign: async () => "0x" }), (e) => e instanceof WitanError && e.status === 500);
});

test("a call that needs a key throws before any request", async () => {
  const m = mock([]);
  const anon = new Witan({ baseUrl: BASE, fetch: m.fetch });
  await assert.rejects(anon.projects.data("p"), (e) => e instanceof WitanError && e.status === 401);
  assert.equal(m.calls.length, 0);
});

test("reads retry 503 and 429; writes without an idempotency key do not", async () => {
  let n = 0;
  const { w, calls } = client([
    ["GET /projects", () => (++n < 3 ? json(503, { error: "busy" }) : json(200, { projects: [] }))],
    ["POST /projects/p/contribute", () => json(503, { error: "busy" })],
  ]);
  assert.deepEqual(await w.projects.list(), []);
  assert.equal(n, 3);
  await assert.rejects(w.projects.contribute("p", [{ k: 1 }]), (e) => e.status === 503);
  assert.equal(calls.filter((c) => c.method === "POST").length, 1);
});

test("contribute sends the idempotency key, retries under it and reports replays", async () => {
  let n = 0;
  const { w, calls } = client([
    ["POST /projects/p/contribute", () => (++n === 1 ? json(502, {}) : json(200, { id: "c1", status: "merged", mergedVersion: 4 }, { "idempotent-replayed": "true" }))],
  ]);
  const c = await w.projects.contribute("p", [{ k: 1 }], { wait: 5, idempotencyKey: "run-1", sourceDeclaration: "test" });
  assert.equal(c.status, "merged");
  assert.equal(c.replayed, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].headers["idempotency-key"], "run-1");
  assert.equal(calls[1].url.searchParams.get("wait"), "5");
  assert.deepEqual(JSON.parse(calls[1].body), { records: [{ k: 1 }], sourceDeclaration: "test" });
});

// ---- push ---------------------------------------------------------------------------------
function uploadRoutes(state) {
  return [
    ["POST /projects/p/uploads", (c) => {
      state.init = JSON.parse(c.body);
      return json(200, { uploadId: "u1", parts: Array.from({ length: state.init.parts }, (_, i) => ({ n: i + 1, url: `http://store.test/put/${i + 1}` })) });
    }],
    ["PUT store.test", async (c) => {
      const n = Number(c.url.pathname.split("/").pop());
      state.puts[n] = { bytes: await bytesOf(c.body), headers: c.headers };
      if (state.failPart === n) return new Response("InternalError", { status: 400 });
      return new Response(null, { status: 200, headers: { etag: `"e${n}"` } });
    }],
    ["POST /projects/p/uploads/u1/complete", (c) => { state.complete = JSON.parse(c.body); return json(200, { contributionId: "c9", status: "submitted" }); }],
    ["GET /projects/p/contributions/c9", () => json(200, { id: "c9", status: "merged", acceptedCount: state.records, mergedVersion: 7 })],
  ];
}

test("push: jsonl in 5 MiB parts straight to the store, without the API key", async () => {
  const state = { puts: {}, records: 0 };
  const { w } = client(uploadRoutes(state));
  const N = 140_000;
  function* rows() { for (let i = 0; i < N; i++) yield { key: `k${i}`, value: i, ok: i % 2 === 0 }; }
  state.records = N;
  const r = await w.projects.push("p", rows(), { compress: false, partSize: 5 * 1024 * 1024, wait: true, sourceDeclaration: "unit" });
  assert.equal(state.init.compression, "none");
  assert.equal(state.init.parts, 2);
  assert.equal(state.init.partSize, 5 * 1024 * 1024);   // the origin signs each part for this length
  assert.equal(state.init.sourceDeclaration, "unit");
  assert.equal(state.puts[1].bytes.length, 5 * 1024 * 1024);
  assert.equal(state.puts[1].bytes.length + state.puts[2].bytes.length, state.init.bytes);
  for (const p of Object.values(state.puts)) assert.equal(p.headers.authorization, undefined);
  const text = new TextDecoder().decode(new Uint8Array([...state.puts[1].bytes, ...state.puts[2].bytes]));
  const lines = text.trimEnd().split("\n");
  assert.equal(lines.length, N);
  assert.deepEqual(JSON.parse(lines[N - 1]), { key: `k${N - 1}`, value: N - 1, ok: false });
  assert.deepEqual(state.complete.etags, [{ n: 1, etag: "e1" }, { n: 2, etag: "e2" }]);
  assert.equal(r.status, "merged");
  assert.equal(r.records, N);
  assert.equal(r.parts, 2);
});

test("push: gzip where CompressionStream exists, one part for a small batch", async () => {
  const state = { puts: {}, records: 3 };
  const { w } = client(uploadRoutes(state));
  const rows = [{ a: 1 }, { a: 2 }, { a: "ü" }];
  const r = await w.projects.push("p", rows);
  assert.equal(state.init.compression, "gzip");
  assert.equal(state.init.parts, 1);
  assert.equal(await gunzip(state.puts[1].bytes), '{"a":1}\n{"a":2}\n{"a":"ü"}\n');
  assert.equal(r.contributionId, "c9");
  assert.equal(r.status, "submitted"); // no wait: the completion as returned
});

test("push: a failed part stops the upload before completion", async () => {
  const state = { puts: {}, failPart: 1 }; // 400: not retried
  const { w } = client(uploadRoutes(state));
  function* rows() { for (let i = 0; i < 140_000; i++) yield { key: `k${i}`, value: i, ok: true }; }
  await assert.rejects(w.projects.push("p", rows(), { compress: false, partSize: 5 * 1024 * 1024, concurrency: 1 }),
    (e) => e instanceof WitanError && e.status === 400);
  assert.equal(state.complete, undefined);
  assert.equal(state.puts[2], undefined); // concurrency 1: the second part never started
});

test("push refuses an empty batch", async () => {
  const { w, calls } = client([]);
  await assert.rejects(w.projects.push("p", []), WitanError);
  assert.equal(calls.length, 0);
});

// ---- export / promote -----------------------------------------------------------------------
test("export streams every record of a jsonl.gz", async () => {
  const gz = await gzip('{"k":1}\n{"k":2}\n\n{"k":3}');
  const { w } = client([["GET /projects/p/export", () => new Response(gz, { status: 200 })]]);
  const got = [];
  for await (const r of w.projects.export("p", 2)) got.push(r.k);
  assert.deepEqual(got, [1, 2, 3]);
});

test("promote: a node's local project, latest version, as one push here", async () => {
  const state = { puts: {}, records: 2 };
  const gz = await gzip('{"key":"n1","value":1,"ok":true}\n{"key":"n2","value":2,"ok":false}\n');
  const node = mock([
    ["GET /projects/scratch", () => json(200, { slug: "scratch", local: true, latestVersion: 2 })],
    ["GET /projects/scratch/export", (c) => { state.exportVersion = c.url.searchParams.get("version"); return new Response(gz, { status: 200 }); }],
  ]);
  const nodeClient = new Witan({ baseUrl: "http://node.test", apiKey: "node", fetch: node.fetch });
  const { w } = client(uploadRoutes(state));
  const r = await w.projects.promote("scratch", { from: nodeClient, to: "p" });
  assert.equal(state.exportVersion, "2");
  assert.equal(await gunzip(state.puts[1].bytes), '{"key":"n1","value":1,"ok":true}\n{"key":"n2","value":2,"ok":false}\n');
  assert.match(state.init.sourceDeclaration, /local project scratch v2/);
  assert.deepEqual(r.promoted, { from: "scratch", version: 2, to: "p", node: "http://node.test" });
  assert.equal(r.status, "merged"); // wait defaults to true
});

test("promote refuses projects that are not local to the node", async () => {
  const node = mock([["GET /projects/obs", () => json(200, { slug: "obs", latestVersion: 9 })]]);
  const { w } = client([]);
  await assert.rejects(w.projects.promote("obs", { from: new Witan({ baseUrl: "http://node.test", apiKey: "node", fetch: node.fetch }) }),
    (e) => e instanceof WitanError && /not a local project/.test(e.message));
});

// ---- key rotation ---------------------------------------------------------------------------
async function keyPair() {
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const kid = [...new Uint8Array(await crypto.subtle.digest("SHA-256", raw))].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
  const ref = { kid, alg: "Ed25519", publicKey: b64(raw) };
  const signText = async (text) => b64(new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, pair.privateKey, new TextEncoder().encode(text))));
  return { ref, signText };
}
const endorse = async (by, key, origin = ORIGIN) => ({ ...key.ref, by: by.ref.kid, sig: await by.signText(endorsementStatement(origin, key.ref)) });
async function signedBy(key, chain) {
  const m = manifest();
  return { ...m, signature: { alg: "Ed25519", kid: key.ref.kid, origin: ORIGIN, sig: await key.signText(signedStatement(m, ORIGIN)), ...(chain ? { chain } : {}) } };
}
const pins = (...keys) => ({ origin: ORIGIN, keys: keys.map((k) => k.ref) });
const published = (current, { retired = [], revoked = [], endorsements = [] } = {}) => ({
  origin: ORIGIN,
  keys: [{ ...current.ref, status: "current" }, ...retired.map((k) => ({ ...k.ref, status: "retired" })), ...revoked.map((k) => ({ ...k.ref, status: "revoked" }))],
  endorsements: endorsements.map(({ kid, by, sig }) => ({ kid, by, sig })),
});

test("the endorsement statement is the origin's (and Python's)", () => {
  assert.equal(endorsementStatement("https://o", { kid: "k", alg: "Ed25519", publicKey: "P" }),
    '{"key":{"alg":"Ed25519","kid":"k","publicKey":"P"},"origin":"https://o","type":"witan-key-endorsement","v":1}');
});

test("verifyManifest follows a rotation through the signature's chain", async () => {
  const [k0, k1, k2] = await Promise.all([keyPair(), keyPair(), keyPair()]);
  const m = await signedBy(k2, [await endorse(k0, k1), await endorse(k1, k2)]);
  assert.equal(await verifyManifest(m, pins(k0)), "verified");
  const reversed = { ...m, signature: { ...m.signature, chain: [...m.signature.chain].reverse() } };
  assert.equal(await verifyManifest(reversed, pins(k0)), "verified");
});

test("a chain no pinned key starts, or with an altered link, is refused", async () => {
  const [k0, k1, k3] = await Promise.all([keyPair(), keyPair(), keyPair()]);
  await assert.rejects(verifyManifest(await signedBy(k1, [await endorse(k3, k1)]), pins(k0)), /no endorsement leads/);
  await assert.rejects(verifyManifest(await signedBy(k1), pins(k0)), /no endorsement leads/);
  const forged = { ...(await endorse(k0, k1)), sig: (await endorse(k3, k1)).sig };
  await assert.rejects(verifyManifest(await signedBy(k1, [forged]), pins(k0)), /does not verify/);
  const elsewhere = await endorse(k0, k1, "https://elsewhere.test");
  await assert.rejects(verifyManifest(await signedBy(k1, [elsewhere]), pins(k0)), /does not verify/);
  const swapped = { ...(await endorse(k0, k1)), publicKey: k3.ref.publicKey };
  await assert.rejects(verifyManifest(await signedBy(k1, [swapped]), pins(k0)), /malformed/);
});

test("revoked keys are refused, and so is what they vouched for", async () => {
  const [k0, k1, k2] = await Promise.all([keyPair(), keyPair(), keyPair()]);
  const keys = { origin: ORIGIN, keys: [k0.ref, { ...k1.ref, status: "revoked" }] };
  await assert.rejects(verifyManifest(await signedBy(k1), keys), /revoked/);
  await assert.rejects(verifyManifest(await signedBy(k2, [await endorse(k1, k2)]), keys), /no endorsement leads/);
  assert.equal(await verifyManifest(await signedBy(k0), keys), "verified");
});

test("a key pinned through a revoked key is refused too", async () => {
  const [k0, k1] = await Promise.all([keyPair(), keyPair()]);
  const keys = { origin: ORIGIN, keys: [{ ...k0.ref, status: "revoked" }, { ...k1.ref, endorsedBy: k0.ref.kid }] };
  await assert.rejects(verifyManifest(await signedBy(k1), keys), /pinned through a key/);
});

test("retired keys still verify what they signed, and vouch for their successor", async () => {
  const [k0, k1] = await Promise.all([keyPair(), keyPair()]);
  const keys = { origin: ORIGIN, keys: [{ ...k0.ref, status: "retired" }] };
  assert.equal(await verifyManifest(await signedBy(k0), keys), "verified"); // a copy from before the rotation
  assert.equal(await verifyManifest(await signedBy(k1, [await endorse(k0, k1)]), keys), "verified");
});

test("updatePinnedKeys adds what pinned keys endorse, refuses the rest, marks revocations and retirements", async () => {
  const [k0, k1, k2, k3] = await Promise.all([keyPair(), keyPair(), keyPair(), keyPair()]);
  const r1 = await updatePinnedKeys(pins(k0), published(k2, { retired: [k0, k1], endorsements: [await endorse(k0, k1), await endorse(k1, k2)] }));
  assert.deepEqual(r1.added.sort(), [k1.ref.kid, k2.ref.kid].sort());
  assert.deepEqual(r1.refused, []);
  assert.equal("ignored" in r1, false);
  assert.equal(r1.keys.keys.find((k) => k.kid === k0.ref.kid).status, "retired");
  assert.equal(await verifyManifest(await signedBy(k2), r1.keys), "verified"); // no chain needed any more
  assert.equal(await verifyManifest(await signedBy(k0), r1.keys), "verified"); // retired: what it signed still verifies
  const r2 = await updatePinnedKeys(r1.keys, published(k3, { revoked: [k2] }));
  assert.deepEqual(r2.revoked, [k2.ref.kid]);
  assert.deepEqual(r2.refused, [k3.ref.kid]);
  await assert.rejects(verifyManifest(await signedBy(k2), r2.keys), /revoked/);
  const r3 = await updatePinnedKeys(r2.keys, published(k3, { revoked: [k2] }), { force: true });
  assert.deepEqual(r3.added, [k3.ref.kid]);
  assert.equal(await verifyManifest(await signedBy(k3), r3.keys), "verified");
  await assert.rejects(updatePinnedKeys(pins(k0), { ...published(k1), origin: "https://elsewhere.test" }), SignatureError);
});

test("updatePinnedKeys: an emergency revocation of the current key applies at once", async () => {
  const [k0, k1, k2] = await Promise.all([keyPair(), keyPair(), keyPair()]);
  const r1 = await updatePinnedKeys(pins(k0), published(k1, { retired: [k0], endorsements: [await endorse(k0, k1)] }));
  // k1 leaked: the origin revokes it and signs with k2, which nothing still trusted endorses
  const r2 = await updatePinnedKeys(r1.keys, published(k2, { retired: [k0], revoked: [k1] }));
  assert.deepEqual(r2.revoked, [k1.ref.kid]);
  assert.deepEqual(r2.refused, [k2.ref.kid]);
  await assert.rejects(verifyManifest(await signedBy(k1), r2.keys), /revoked/);
  await assert.rejects(verifyManifest(await signedBy(k2, [await endorse(k1, k2)]), r2.keys), /no endorsement leads/);
  assert.equal(await verifyManifest(await signedBy(k0), r2.keys), "verified");
});

test("updatePinnedKeys: a revocation reaches the keys pinned through the revoked key", async () => {
  const [k0, k1, k2, k3] = await Promise.all([keyPair(), keyPair(), keyPair(), keyPair()]);
  const r1 = await updatePinnedKeys(pins(k0, k3), published(k1, { retired: [k0, k3], endorsements: [await endorse(k0, k1)] }));
  assert.equal(r1.keys.keys.find((k) => k.kid === k1.ref.kid).endorsedBy, k0.ref.kid);
  const r2 = await updatePinnedKeys(r1.keys, published(k2, { retired: [k3], revoked: [k0], endorsements: [await endorse(k3, k2)] }));
  assert.deepEqual(r2.revoked, [k0.ref.kid]);
  assert.deepEqual(r2.added, [k2.ref.kid]);
  await assert.rejects(verifyManifest(await signedBy(k1), r2.keys), /pinned through a key/);
  assert.equal(await verifyManifest(await signedBy(k2), r2.keys), "verified");
});

// ---- purchases ------------------------------------------------------------------------------
const NOW = Math.floor(Date.now() / 1000);

test("purchases: the wallet signs the statement the pay service issues; no API key goes there", async () => {
  const wallet = "0xAbCdEf0000000000000000000000000000000001";
  const issued = `WITAN purchase history\nwallet: ${wallet.toLowerCase()}\norigin: http://pay.test\ntime: ${NOW}`;
  const m = mock([
    ["GET /purchases/statement", (c) => json(200, { statement: issued, wallet: c.url.searchParams.get("wallet"), time: NOW, expiresIn: 300 })],
    ["GET /purchases", (c) => json(200, { wallet: c.headers["x-witan-wallet"], purchases: [{ id: "4", kind: "unit", unit: { id: "u", title: "t" } }], next: null })],
  ]);
  const w = new Witan({ baseUrl: BASE, apiKey: "km_test", payUrl: "http://pay.test", fetch: m.fetch });
  const signed = [];
  const r = await w.purchases({ address: wallet, sign: async (text) => { signed.push(text); return "0x" + "cd".repeat(65); }, limit: 5 });
  assert.deepEqual(signed, [issued]);
  assert.equal(r.wallet, wallet.toLowerCase());
  assert.equal(r.purchases[0].unit.title, "t");
  const [statementCall, listCall] = m.calls;
  assert.equal(statementCall.url.host, "pay.test");
  assert.equal(statementCall.url.searchParams.get("wallet"), wallet.toLowerCase());
  assert.equal(listCall.headers["x-witan-time"], String(NOW));
  assert.equal(listCall.headers["x-witan-signature"], "0x" + "cd".repeat(65));
  assert.equal(listCall.url.searchParams.get("limit"), "5");
  for (const c of m.calls) assert.equal(c.headers.authorization, undefined);
});

test("purchases: a refused signature throws WitanError(401)", async () => {
  const wallet = "0x" + "00".repeat(20);
  const m = mock([
    ["GET /purchases/statement", () => json(200, { statement: `WITAN purchase history\nwallet: ${wallet}\norigin: http://pay.test\ntime: ${NOW}`, time: NOW })],
    ["GET /purchases", () => json(401, { error: "the signature is not this wallet's" })],
  ]);
  const w = new Witan({ baseUrl: BASE, payUrl: "http://pay.test", fetch: m.fetch });
  await assert.rejects(w.purchases({ address: wallet, sign: async () => "0x00" }),
    (e) => e instanceof WitanError && e.status === 401 && /not this wallet/.test(e.message));
});

test("purchases: the wallet signs nothing but WITAN's statement, and only a fresh one", async () => {
  const wallet = "0x" + "00".repeat(20);
  const text = (t, origin = "http://pay.test") => `WITAN purchase history\nwallet: ${wallet}\norigin: ${origin}\ntime: ${t}`;
  const cases = [
    [{ statement: "Transfer all funds to 0xbad", time: NOW }, /something other/],
    [{ statement: text(NOW, "http://evil.test"), time: NOW }, /something other/],
    [{ statement: text(NOW - 3600), time: NOW - 3600 }, /clock/],
    [{ statement: text(NOW), time: String(NOW) }, /without a time/],
  ];
  for (const [issued, why] of cases) {
    const m = mock([["GET /purchases/statement", () => json(200, issued)], ["GET /purchases", () => json(200, {})]]);
    const w = new Witan({ baseUrl: BASE, payUrl: "http://pay.test", fetch: m.fetch });
    const signed = [];
    await assert.rejects(w.purchases({ address: wallet, sign: async (t) => { signed.push(t); return "0x00"; } }), why);
    assert.deepEqual(signed, []);
    assert.equal(m.calls.length, 1);
  }
});

// ---- disputes -------------------------------------------------------------------------------
test("dispute: signed by the paying wallet over WITAN's statement, posted to the pay service", async () => {
  const wallet = "0x" + "12".repeat(20);
  const tx = "0x" + "ab".repeat(32);
  const statement = `WITAN dispute\ntransaction: ${tx}\nwallet: ${wallet}\norigin: http://pay.test\ntime: ${NOW}`;
  const m = mock([
    ["GET /disputes/statement", (c) => json(200, { statement, time: NOW, expiresIn: 300, asked: Object.fromEntries(c.url.searchParams) })],
    ["POST /disputes", () => json(201, { id: "d-1", status: "open", kind: "dataset", amountMicro: 100000 })],
    ["GET /disputes/d-1", () => json(200, { id: "d-1", status: "refunded", refundTx: "0x" + "cd".repeat(32) })],
  ]);
  const w = new Witan({ baseUrl: BASE, apiKey: "km_test", payUrl: "http://pay.test/", fetch: m.fetch });
  const signed = [];
  const d = await w.dispute({ transaction: tx.toUpperCase().replace("0X", "0x"), reason: "parts were corrupt", address: wallet.toUpperCase().replace("0X", "0x"),
    sign: async (text) => { signed.push(text); return "0x" + "ef".repeat(65); } });
  assert.equal(d.id, "d-1");
  assert.deepEqual(signed, [statement]);
  const [asked, posted] = m.calls;
  assert.deepEqual(Object.fromEntries(asked.url.searchParams), { transaction: tx, wallet });
  assert.equal(posted.method, "POST");
  assert.equal(posted.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(posted.body), { transaction: tx, reason: "parts were corrupt", wallet, time: NOW, signature: "0x" + "ef".repeat(65) });
  for (const c of m.calls) assert.equal(c.headers.authorization, undefined);
  assert.equal((await w.disputeStatus("d-1")).status, "refunded");
});

test("dispute: a statement for another transaction is not signed; a bad hash is refused before any request", async () => {
  const wallet = "0x" + "12".repeat(20);
  const other = `WITAN dispute\ntransaction: 0x${"cd".repeat(32)}\nwallet: ${wallet}\norigin: http://pay.test\ntime: ${NOW}`;
  const m = mock([["GET /disputes/statement", () => json(200, { statement: other, time: NOW })], ["POST /disputes", () => json(201, {})]]);
  const w = new Witan({ baseUrl: BASE, payUrl: "http://pay.test", fetch: m.fetch });
  const sign = async () => { throw new Error("must not sign"); };
  await assert.rejects(w.dispute({ transaction: "0x" + "ab".repeat(32), reason: "x", address: wallet, sign }), /something other/);
  assert.equal(m.calls.filter((c) => c.method === "POST").length, 0);
  await assert.rejects(w.dispute({ transaction: "not-a-tx", reason: "x", address: wallet, sign }), /settlement tx hash/);
  assert.equal(m.calls.length, 1);
});

test("projects.buy posts the version with the key; short of credits it is a PaymentRequiredError", async () => {
  const { w, calls } = client([
    ["POST /projects/paid-one/buy", (c) => JSON.parse(c.body).version === 3
      ? json(200, { project: "paid-one", version: 3, already: false, chargedMicro: 100000, balanceMicro: 900000 })
      : json(402, { error: "not enough credits: v4 of paid-one costs $0.10", topup: "http://pay.test/x" })],
  ]);
  const r = await w.projects.buy("paid-one", { version: 3 });
  assert.equal(r.chargedMicro, 100000);
  assert.equal(calls[0].headers.authorization, "Bearer km_test");
  await assert.rejects(w.projects.buy("paid-one", { version: 4 }), (e) => e instanceof PaymentRequiredError && /not enough credits/.test(e.message));
});

test("a deprecated route is reported once, with its sunset and migration link", async () => {
  const notices = [];
  const headers = {
    deprecation: "@1790812800",
    sunset: "Wed, 30 Jun 2027 00:00:00 GMT",
    link: '<https://witan.example/docs/points>; rel="deprecation"; type="text/html"',
  };
  const { w } = client([["GET /points", () => json(200, { points: 1 }, headers)]], { onDeprecation: (n) => notices.push(n) });
  await w.points();
  await w.points();
  assert.equal(notices.length, 1);
  assert.equal(notices[0].method, "GET");
  assert.equal(notices[0].path, "/points");
  assert.equal(notices[0].since, "2026-10-01");
  assert.equal(notices[0].sunset, "2027-06-30");
  assert.equal(notices[0].link, "https://witan.example/docs/points");
  assert.match(notices[0].message, /GET \/points is deprecated since 2026-10-01 and stops working on 2027-06-30/);
});

test("deprecationNotice: absent, false and bare true", () => {
  const u = "http://api.test/search?q=x";
  assert.equal(deprecationNotice("GET", u, new Headers()), undefined);
  assert.equal(deprecationNotice("GET", u, new Headers({ deprecation: "false" })), undefined);
  const n = deprecationNotice("GET", u, new Headers({ deprecation: "true" }));
  assert.equal(n.path, "/search");
  assert.equal(n.since, undefined);
  assert.match(n.message, /GET \/search is deprecated\./);
});

test("onDeprecation can fail the call (CI mode)", async () => {
  const { w } = client([["GET /quota", () => json(200, { storage: {} }, { deprecation: "@1790812800" })]],
    { onDeprecation: (n) => { throw new Error(n.message); } });
  await assert.rejects(w.quota(), /GET \/quota is deprecated/);
});

test("projects.update sends only the changes; retire posts to the unit", async () => {
  const { w, calls } = client([
    ["PATCH /projects/agent-state", (c) => json(200, { slug: "agent-state", ...JSON.parse(c.body) })],
    ["POST /knowledge/u-1/retire", () => json(200, { id: "u-1", status: "retired", retiredAt: "2026-09-26T00:00:00Z" })],
  ]);
  const p = await w.projects.update("agent-state", { status: "archived", title: undefined });
  assert.equal(p.status, "archived");
  assert.deepEqual(JSON.parse(calls[0].body), { status: "archived" });
  await assert.rejects(w.projects.update("agent-state", {}), (e) => e instanceof WitanError && e.status === 400);
  const r = await w.retire("u-1");
  assert.equal(r.status, "retired");
  assert.equal(calls.at(-1).headers.authorization, "Bearer km_test");
});

// ---- pricing what you sell ---------------------------------------------------------------
test("setPrice sends only what changes; null asks for the default", async () => {
  const U = "5e5fc8dd-af67-4f34-839b-b366ef05d43d";
  const { w, calls } = client([
    [`PUT /knowledge/${U}/price`, (c) => {
      const b = JSON.parse(c.body);
      return json(200, { id: U, groupId: U, price: b.price === null ? "$0.01" : "$0.25", priceMicro: 250000,
        default: b.price === null, trialSale: b.trialSale ?? false, changed: "price" in b });
    }],
    ["PATCH /projects/probe-latency", (c) => json(200, { slug: "probe-latency", ...JSON.parse(c.body), changed: true })],
  ]);
  const r = await w.setPrice(U, { price: "0.25", trialSale: true });
  assert.equal(r.price, "$0.25");
  await w.setPrice(U, { price: null });
  await w.setPrice(U, { trialSale: false, price: undefined });
  await w.projects.update("probe-latency", { price: null });
  assert.deepEqual(calls.map((c) => JSON.parse(c.body)), [{ price: "0.25", trialSale: true }, { price: null }, { trialSale: false }, { price: null }]);
  await assert.rejects(w.setPrice(U, {}), WitanError);
});

test("buyWithCredits posts to the unit's buy route with the key", async () => {
  const U = "5e5fc8dd-af67-4f34-839b-b366ef05d43d";
  const { w, calls } = client([[`POST /knowledge/${U}/buy`, () => json(200, { id: U, groupId: U, already: false, chargedMicro: 250000, balanceMicro: 750000 })]]);
  const r = await w.buyWithCredits(U);
  assert.equal(r.chargedMicro, 250000);
  assert.equal(calls[0].headers.authorization ?? calls[0].headers.Authorization, "Bearer km_test");
});

test("submit refuses a missing or bad sourceDeclaration and an unlisted license before sending", async () => {
  const { w, calls } = client([["POST /knowledge", () => json(201, { id: "u1", status: "submitted" })]]);
  const unit = { title: "t", body: "b", category: "infra-measurement" };
  for (const sourceDeclaration of [undefined, "", "abc", "   \n ", "x".repeat(2001)]) {
    await assert.rejects(w.submit({ ...unit, sourceDeclaration }), (e) => e instanceof WitanError && e.status === 400 && /sourceDeclaration/.test(e.message));
  }
  for (const license of ["MIT", "cc-by", "free text", ""]) {
    await assert.rejects(w.submit({ ...unit, sourceDeclaration: "own run", license }), (e) => e instanceof WitanError && /license must be one of/.test(e.message));
    await assert.rejects(w.projects.create({ slug: "p", title: "P", readme: "r", schemaDef: { fields: [] }, license }), /license must be one of/);
  }
  assert.equal(calls.filter((c) => c.method === "POST").length, 0);
  calls.length = 0;
  await w.submit({ ...unit, sourceDeclaration: "own run, 2026-09-30", license: "cc-by-sa-4.0" });
  await w.submit({ ...unit, sourceDeclaration: "x".repeat(2000) });
  const [first, second] = calls.map((c) => JSON.parse(c.body));
  assert.equal(first.sourceDeclaration, "own run, 2026-09-30");
  assert.equal(first.license, "CC-BY-SA-4.0");
  assert.equal("license" in second, false);
});

test("the license list is the origin's, and projects.create sends it as listed", async () => {
  assert.deepEqual([...LICENSES], ["platform-standard", "CC0-1.0", "CC-BY-4.0", "CC-BY-SA-4.0", "ODbL-1.0", "PDDL-1.0", "CDLA-Permissive-2.0"]);
  const { w, calls } = client([["POST /projects", (c) => json(201, JSON.parse(c.body))]]);
  await w.projects.create({ slug: "p", title: "P", readme: "r", schemaDef: { fields: [] }, license: "PDDL-1.0" });
  await w.projects.create({ slug: "q", title: "Q", readme: "r", schemaDef: { fields: [] } });
  assert.equal(JSON.parse(calls[0].body).license, "PDDL-1.0");
  assert.equal("license" in JSON.parse(calls[1].body), false);
});

test("a node takes any project license as given; the origin is asked only for an unlisted one", async () => {
  const origin = client([["GET /healthz", () => json(200, { ok: true })], ["POST /projects", (c) => json(201, JSON.parse(c.body))]]);
  await origin.w.projects.create({ slug: "p", title: "P", readme: "r", schemaDef: { fields: [] }, license: "CC0-1.0" });
  assert.deepEqual(origin.calls.map((c) => c.url.pathname), ["/projects"]);
  await origin.w.projects.create({ slug: "q", title: "Q", readme: "r", schemaDef: { fields: [] }, license: "cc0-1.0" });
  assert.equal(JSON.parse(origin.calls.at(-1).body).license, "CC0-1.0");
  const node = client([["GET /healthz", () => json(200, { ok: true, node: true })], ["POST /projects", (c) => json(201, { ...JSON.parse(c.body), local: true })]]);
  await node.w.projects.create({ slug: "p", title: "P", readme: "r", schemaDef: { fields: [] }, license: "MIT" });
  await node.w.projects.create({ slug: "q", title: "Q", readme: "r", schemaDef: { fields: [] }, license: "cc-by-4.0" });
  const posted = node.calls.filter((c) => c.method === "POST").map((c) => JSON.parse(c.body).license);
  assert.deepEqual(posted, ["MIT", "cc-by-4.0"]);
  assert.equal(node.calls.filter((c) => c.url.pathname === "/healthz").length, 1);
});
