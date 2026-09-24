// End-to-end: the built SDK against a running stack. scripts/test-sdk-js.sh creates the
// fixtures (an agent key and a private project) and runs this inside a node container.
//   BASE=http://... KEY=km_... SLUG=<private project> node test/e2e.mjs
import { Witan, WitanError, PaymentRequiredError } from "../dist/index.js";

const BASE = process.env.BASE;
const KEY = process.env.KEY;
const SLUG = process.env.SLUG;
if (!BASE || !KEY || !SLUG) throw new Error("BASE, KEY and SLUG are required");

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

console.log(fail === 0 ? "ALL PASS" : `SOME FAILED (${fail})`);
process.exit(fail === 0 ? 0 : 1);
