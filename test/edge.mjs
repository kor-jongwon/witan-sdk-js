// test/runtime-smoke.mjs in the edge runtimes named under Requirements (npm run test:edge, after build):
//   workerd       the runtime Cloudflare Workers run, through miniflare
//   edge-runtime  Vercel's Edge runtime
// Each gets the SDK and the checks bundled into one file, with no Node APIs available.
import { build } from "esbuild";
import { Miniflare } from "miniflare";
import { EdgeRuntime } from "edge-runtime";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
const version = (pkg) => JSON.parse(readFileSync(new URL(`../node_modules/${pkg}/package.json`, import.meta.url), "utf8")).version;

const entry = fileURLToPath(new URL("./runtime-smoke.mjs", import.meta.url));
const bundle = async (format, footer) => (await build({
  entryPoints: [entry], bundle: true, format, platform: "neutral", write: false, ...(footer ? { globalName: "smoke" } : {}),
})).outputFiles[0].text;
let failed = false;
// gzip: workerd has the compression streams; edge-runtime does not, so there push sends plain JSONL and
// export() refuses (README, Requirements) — what is checked is that this stays true
const report = (name, out, gzip = true) => {
  const bad = ["search", "verify", "tamper"].filter((k) => out[k] !== true).concat(out.gzip === gzip ? [] : ["gzip"]);
  console.log(`${name}: ${bad.length ? `FAIL ${bad.join(", ")}` : "ok"} ${JSON.stringify(out)}`);
  if (bad.length) failed = true;
};

// workerd: the checks run inside a Worker's fetch handler
const esm = await bundle("esm");
const mf = new Miniflare({
  modules: true, compatibilityDate: "2026-08-01",
  script: `${esm}\nexport default { async fetch() { return Response.json(await run()); } };`,
});
try { report(`workerd (miniflare ${version("miniflare")})`, await (await mf.dispatchFetch("http://worker.test/")).json()); }
finally { await mf.dispose(); }

// edge-runtime: an isolated VM with the Edge globals only
const iife = await bundle("iife", true);
const rt = new EdgeRuntime();
rt.evaluate(iife);
report(`edge-runtime ${version("edge-runtime")}`, await rt.evaluate("smoke.run()"), "absent");

if (failed) { console.log("EDGE FAILED"); process.exit(1); }
console.log("EDGE PASS");
