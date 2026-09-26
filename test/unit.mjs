// Unit tests: the built SDK against a mock fetch — no network, no stack. CI runs these on every
// push and before every publish; test/e2e.mjs (scripts/test-sdk-js.sh) covers a live origin.
//   npm run build && npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PaymentRequiredError, SignatureError, Witan, WitanError, endorsementStatement, signedStatement, updatePinnedKeys, verifyManifest,
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

test("keys() reads /.well-known/witan-keys without a key", async () => {
  const { keys } = await signer();
  const m = mock([["GET /.well-known/witan-keys", () => json(200, keys)]]);
  const anon = new Witan({ baseUrl: BASE, fetch: m.fetch });
  assert.deepEqual(await anon.keys(), keys);
  assert.equal(m.calls[0].headers.authorization, undefined);
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

test("updatePinnedKeys adds what pinned keys endorse, refuses the rest, marks revocations", async () => {
  const [k0, k1, k2, k3] = await Promise.all([keyPair(), keyPair(), keyPair(), keyPair()]);
  const r1 = await updatePinnedKeys(pins(k0), published(k2, { retired: [k0, k1], endorsements: [await endorse(k0, k1), await endorse(k1, k2)] }));
  assert.deepEqual(r1.added.sort(), [k1.ref.kid, k2.ref.kid].sort());
  assert.deepEqual(r1.refused, []);
  assert.equal(await verifyManifest(await signedBy(k2), r1.keys), "verified"); // no chain needed any more
  const r2 = await updatePinnedKeys(r1.keys, published(k3, { revoked: [k2] }));
  assert.deepEqual(r2.revoked, [k2.ref.kid]);
  assert.deepEqual(r2.refused, [k3.ref.kid]);
  await assert.rejects(verifyManifest(await signedBy(k2), r2.keys), /revoked/);
  const r3 = await updatePinnedKeys(r2.keys, published(k3, { revoked: [k2] }), { force: true });
  assert.deepEqual(r3.added, [k3.ref.kid]);
  assert.equal(await verifyManifest(await signedBy(k3), r3.keys), "verified");
  await assert.rejects(updatePinnedKeys(pins(k0), { ...published(k1), origin: "https://elsewhere.test" }), SignatureError);
});

// ---- purchases ------------------------------------------------------------------------------
test("purchases: the wallet signs the statement the pay service issues; no API key goes there", async () => {
  const wallet = "0xAbCdEf0000000000000000000000000000000001";
  const issued = `WITAN purchase history\nwallet: ${wallet.toLowerCase()}\norigin: http://pay.test\ntime: 1000`;
  const m = mock([
    ["GET /purchases/statement", (c) => json(200, { statement: issued, wallet: c.url.searchParams.get("wallet"), time: 1000, expiresIn: 300 })],
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
  assert.equal(listCall.headers["x-witan-time"], "1000");
  assert.equal(listCall.headers["x-witan-signature"], "0x" + "cd".repeat(65));
  assert.equal(listCall.url.searchParams.get("limit"), "5");
  for (const c of m.calls) assert.equal(c.headers.authorization, undefined);
});

test("purchases: a refused signature throws WitanError(401)", async () => {
  const m = mock([
    ["GET /purchases/statement", () => json(200, { statement: "s", time: 1 })],
    ["GET /purchases", () => json(401, { error: "the signature is not this wallet's" })],
  ]);
  const w = new Witan({ baseUrl: BASE, payUrl: "http://pay.test", fetch: m.fetch });
  await assert.rejects(w.purchases({ address: "0x" + "00".repeat(20), sign: async () => "0x00" }),
    (e) => e instanceof WitanError && e.status === 401 && /not this wallet/.test(e.message));
});
