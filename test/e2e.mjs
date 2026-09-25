// End-to-end: the built SDK against a running stack. scripts/test-sdk-js.sh creates the
// fixtures (an operator token, an agent key, a private project and a wtn serve node) and runs
// this inside a node container.
//   BASE=http://... KEY=km_... WTO=wto_... SLUG=<private project> NODE=http://<node> node test/e2e.mjs
import { Witan, WitanError, PaymentRequiredError, SignatureError, verifyManifest, signedStatement } from "../dist/index.js";

const BASE = process.env.BASE;
const KEY = process.env.KEY;
const WTO = process.env.WTO;
const SLUG = process.env.SLUG;
const NODE = process.env.NODE;
if (!BASE || !KEY || !WTO || !SLUG || !NODE) throw new Error("BASE, KEY, WTO, SLUG and NODE are required");
const throwsWith = async (label, fn, Type) => {
  try { await fn(); check(label, "no throw", Type.name); }
  catch (e) { check(label, e instanceof Type ? Type.name : `${e?.name}: ${e?.message}`, Type.name); }
};

let fail = 0;
const check = (label, got, want) => {
  const ok = Object.is(got, want);
  console.log(`${ok ? "" : "FAIL: "}${label}: ${JSON.stringify(got)}${ok ? " ok" : ` want ${JSON.stringify(want)}`}`);
  if (!ok) fail++;
};
const run = Date.now();

console.log("== [1] public reads without a key ==");
const anon = new Witan({ baseUrl: BASE });
check("search returns an array", Array.isArray(await anon.search("latency")), true);
check("list hides the private project", (await anon.projects.list()).some((p) => p.slug === SLUG), false);
try { await anon.projects.data(SLUG); check("data without key throws before the request", "no throw", "throws"); }
catch (e) { check("data without key throws before the request", e instanceof WitanError && e.status, 401); }
try { await anon.projects.get(SLUG); check("private detail anon", "no throw", 404); }
catch (e) { check("private detail anon", e instanceof WitanError && e.status, 404); }

console.log("== [2] with the key ==");
const w = new Witan({ baseUrl: BASE, apiKey: KEY });
check("list shows the private project", (await w.projects.list()).some((p) => p.slug === SLUG && p.visibility === "private"), true);
const detail = await w.projects.get(SLUG);
check("detail schema fields", detail.schemaDef.fields.length, 3);
const pts = await w.points();
check("points has agentName", typeof pts.agentName, "string");
const quota = await w.quota();
check("quota storage limit", typeof quota.storage.limitBytes, "number");
const credits = await w.credits();
check("credits topup url", typeof credits.topup, "string");

console.log("== [3] contribute with wait + idempotency ==");
const records = [
  { key: "cursor", value: 41, ok: true },
  { key: "last_run", value: run, ok: true },
  { key: "retries", value: 2, ok: false },
];
const t0 = Date.now();
const c1 = await w.projects.contribute(SLUG, records, { sourceDeclaration: `sdk e2e ${run}`, wait: 15, idempotencyKey: `sdk-${run}-a` });
const ms = Date.now() - t0;
check("merged in the same call", c1.status, "merged");
check("mergedVersion 1", c1.mergedVersion, 1);
check("acceptedCount 3", c1.acceptedCount, 3);
check("not replayed", c1.replayed, false);
console.log(`submit → merged in ${ms} ms`);
const c2 = await w.projects.contribute(SLUG, records, { sourceDeclaration: `sdk e2e ${run}`, wait: 15, idempotencyKey: `sdk-${run}-a` });
check("replayed", c2.replayed, true);
check("same id", c2.id, c1.id);
try {
  await w.projects.contribute(SLUG, [{ key: "cursor", value: 99, ok: true }], { sourceDeclaration: `sdk e2e ${run}`, idempotencyKey: `sdk-${run}-a` });
  check("key reuse with other body", "no throw", 422);
} catch (e) { check("key reuse with other body", e instanceof WitanError && e.status, 422); }

console.log("== [4] read-your-writes ==");
const page = await w.projects.data(SLUG);
check("data count", page.count, 3);
const q = await w.projects.query(SLUG, "SELECT sum(value)::bigint AS s FROM records WHERE ok");
check("query columns", q.columns.join(","), "s");
check("query sum", Number(q.rows[0][0]), 41 + run);
const man = await w.projects.manifest(SLUG);
check("manifest parts", man.parts.length, 1);
check("manifest part url", typeof man.parts[0].url, "string");
const diff = await w.projects.diff(SLUG, { from: 0, to: 1, limit: 0 });
check("diff added records", diff.addedRecords, 3);

console.log("== [5] second batch, no wait, then waitContribution ==");
const c3 = await w.projects.contribute(SLUG, [{ key: "cursor", value: 42, ok: true }], { sourceDeclaration: `sdk e2e ${run}`, idempotencyKey: `sdk-${run}-b` });
check("submitted at once", c3.status, "submitted");
const done = await w.projects.waitContribution(SLUG, c3.id, { timeoutMs: 60_000 });
check("waited to merged", done.status, "merged");
check("version 2", done.mergedVersion, 2);

console.log("== [6] export stream ==");
let n = 0;
for await (const rec of w.projects.export(SLUG, 2)) { if (typeof rec.key === "string") n++; }
check("exported records", n, 4);

console.log("== [7] errors ==");
try { await w.projects.get("no-such-project-" + run); check("404 is WitanError", "no throw", 404); }
catch (e) { check("404 is WitanError", e instanceof WitanError && e.status, 404); }
check("PaymentRequiredError shape", new PaymentRequiredError({ error: "x", price: "$0.10", pay: "u" }).pay, "u");

console.log("== [8] signed manifests ==");
check("statement shape = the origin's and Python's",
  signedStatement({ project: "p", version: 1, format: "witan-dataset-manifest/1", urlExpiresAt: "t", paid: true,
    parts: [{ sha256: "ab", bytes: 1, url: "http://x" }], signature: { sig: "..." } }, "https://o"),
  '{"manifest":{"format":"witan-dataset-manifest/1","parts":[{"bytes":1,"sha256":"ab"}],"project":"p","version":1},"origin":"https://o","v":1}');
const keys = await anon.keys();
check("keys published without a key", keys.keys.length >= 1 && keys.keys[0].alg, "Ed25519");
const signed = await w.projects.manifest(SLUG, { verify: keys });
check("manifest({ verify }) accepts the origin's signature", signed.signature?.kid, keys.keys[0].kid);
check("verifyManifest", await verifyManifest(signed, keys), "verified");
const fresh = await w.projects.manifest(SLUG);
check("a new request (new URLs) still verifies", await verifyManifest(fresh, keys), "verified");
await throwsWith("altered totals", () => verifyManifest({ ...signed, totals: { ...signed.totals, records: signed.totals.records + 1 } }, keys), SignatureError);
await throwsWith("altered part", () => verifyManifest({ ...signed, parts: signed.parts.map((p) => ({ ...p, records: p.records + 1 })) }, keys), SignatureError);
await throwsWith("keys of another origin", () => verifyManifest(signed, { ...keys, origin: "https://elsewhere.test" }), SignatureError);
await throwsWith("a key not pinned", () => verifyManifest(signed, { ...keys, keys: keys.keys.map((k) => ({ ...k, kid: "0000000000000000" })) }), SignatureError);
const { signature: _drop, ...unsigned } = signed;
check("unsigned is reported", await verifyManifest(unsigned, keys), "unsigned");
await throwsWith("unsigned with require", () => verifyManifest(unsigned, keys, { require: true }), SignatureError);

console.log("== [9] create (operator token) ==");
const op = new Witan({ baseUrl: BASE, apiKey: WTO });
const SLUG2 = `${SLUG}-p`;
const schemaDef = { fields: [{ name: "key", type: "string" }, { name: "value", type: "number" }, { name: "ok", type: "boolean" }], allowExtra: false };
const created = await op.projects.create({ slug: SLUG2, title: `SDK JS push target (${run})`, readme: "Records pushed and promoted by the JS SDK test: key, value, ok.", schemaDef, visibility: "private" });
check("created", created.slug, SLUG2);
check("private", created.visibility ?? (await w.projects.get(SLUG2)).visibility, "private");

console.log("== [10] push: multipart through the object store ==");
const N = 130_000; // uncompressed ~5.5 MB → two parts at the 5 MiB minimum
function* many() { for (let i = 0; i < N; i++) yield { key: `k${i}`, value: i, ok: i % 3 !== 0 }; }
let t1 = Date.now();
const pushed = await w.projects.push(SLUG2, many(), { sourceDeclaration: `sdk e2e push ${run}`, compress: false, partSize: 5 * 1024 * 1024, wait: true, timeoutMs: 300_000 });
console.log(`push ${N} records (${pushed.bytes} bytes, ${pushed.parts} parts) → ${pushed.status} in ${Date.now() - t1} ms`);
check("two parts", pushed.parts, 2);
check("push merged", pushed.status, "merged");
check("push accepted", pushed.acceptedCount, N);
async function* few() { for (let i = 0; i < 1000; i++) yield { key: `g${i}`, value: i, ok: true }; }
const gz = await w.projects.push(SLUG2, few(), { sourceDeclaration: `sdk e2e push gzip ${run}`, wait: true });
check("gzip push: one part", gz.parts, 1);
check("gzip push merged", gz.status, "merged");
check("gzip is smaller than the jsonl", gz.bytes < 1000 * 30, true);
check("count after pushes", Number((await w.projects.query(SLUG2, "SELECT count(*) FROM records")).rows[0][0]), N + 1000);

console.log("== [11] promote from a node ==");
const node = new Witan({ baseUrl: NODE, apiKey: "node" });
const LOCAL = `js-local-${run}`;
const local = await node.projects.create({ slug: LOCAL, title: "JS scratch on a node", readme: "Scratch state an agent writes on its node before promoting it.", schemaDef });
check("local project on the node", local.local, true);
const n1 = await node.projects.contribute(LOCAL, [{ key: "n1", value: 1, ok: true }, { key: "n2", value: 2, ok: false }, { key: "n3", value: 3, ok: true }]);
check("node merges in the call", n1.status, "merged");
t1 = Date.now();
const p1 = await w.projects.promote(LOCAL, { from: node, to: SLUG2 });
console.log(`promote v${p1.promoted.version} → ${p1.status} in ${Date.now() - t1} ms`);
check("promoted", `${p1.status} ${p1.acceptedCount} ${p1.promoted.version}`, "merged 3 1");
const p2 = await w.projects.promote(LOCAL, { from: node, to: SLUG2 });
check("again: up to date", `${p2.status} ${p2.verdict?.gate}`, "rejected dedup");
await node.projects.contribute(LOCAL, [{ key: "n4", value: 4, ok: true }]);
const p3 = await w.projects.promote(LOCAL, { from: node, to: SLUG2 });
check("after a new write only it is new", `${p3.status} ${p3.acceptedCount} ${p3.promoted.version}`, "merged 1 2");
await throwsWith("an origin project is not promoted", () => w.projects.promote(SLUG, { from: w }), WitanError);

console.log(fail === 0 ? "ALL PASS" : `SOME FAILED (${fail})`);
process.exit(fail === 0 ? 0 : 1);
