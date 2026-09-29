// The checks a runtime must pass to be listed under Requirements, using only what a Worker or an
// Edge function has: fetch, web streams, WebCrypto. test/edge.mjs bundles this with the SDK and runs it
// in workerd (Cloudflare Workers) and in edge-runtime (Vercel Edge); Deno, Bun and Node run the unit tests.
import { Witan, signedStatement, verifyManifest } from "../dist/index.js";

const ORIGIN = "https://origin.test";
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const json = (data) => new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });

export async function run() {
  const out = {};
  // a search through the client, against a stub origin
  const w = new Witan({ baseUrl: "https://api.test", fetch: async (u) =>
    new URL(String(u)).pathname === "/search" ? json({ results: [{ id: "u1", title: "t", score: 1 }] }) : new Response("{}", { status: 404 }) });
  out.search = (await w.search("latency")).length === 1;
  // a manifest signed with Ed25519 verifies, and a changed one does not (WebCrypto Ed25519)
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const keys = { origin: ORIGIN, keys: [{ kid: "k1", alg: "Ed25519", publicKey: b64(raw) }] };
  const m = { format: "witan-dataset-manifest/1", project: "p", version: 1, createdAt: "2026-09-29T00:00:00Z",
    parts: [{ sha256: "a".repeat(64), bytes: 1, records: 1, url: "https://store.test/a" }],
    totals: { records: 1, bytes: 1, parts: 1, contributions: 1 }, urlExpiresAt: "2026-09-29T00:15:00Z" };
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, pair.privateKey, new TextEncoder().encode(signedStatement(m, ORIGIN))));
  const signed = { ...m, signature: { alg: "Ed25519", kid: "k1", origin: ORIGIN, sig: b64(sig) } };
  out.verify = (await verifyManifest(signed, keys)) === "verified";
  out.tamper = await verifyManifest({ ...signed, version: 2 }, keys).then(() => false, () => true);
  // gzip both ways where the runtime has the streams (push compresses, export reads .jsonl.gz)
  if (typeof CompressionStream === "undefined" || typeof DecompressionStream === "undefined") out.gzip = "absent";
  else {
    const gz = await new Response(new Blob(["x".repeat(100)]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
    out.gzip = (await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream("gzip"))).text()) === "x".repeat(100);
  }
  return out;
}
