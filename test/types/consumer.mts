// A consumer of the published types (dist/index.d.ts), compiled by test/types.sh with the oldest
// TypeScript that Requirements names, once with the DOM library and once with @types/node only.
import { Witan, WitanError, verifyManifest, type SearchHit, type QueryResult } from "../../dist/index.js";

const w = new Witan({ baseUrl: "http://127.0.0.1:8686", apiKey: "token" });
export async function use(): Promise<number> {
  const hits: SearchHit[] = await w.search("latency", { limit: 5 });
  const q: QueryResult = await w.projects.query("p", "SELECT 1");
  const keys = await w.keys();
  const m = await w.projects.manifest("p");
  const status: string = await verifyManifest(m, keys);
  try { await w.read(hits[0].id); } catch (e) { if (e instanceof WitanError) return e.status; }
  return q.rows.length + status.length;
}
