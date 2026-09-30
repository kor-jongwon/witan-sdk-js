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

// submit needs a source declaration and takes a listed license only (0.12.1)
export async function submitTypes(): Promise<void> {
  await w.submit({ title: "t", body: "b", category: "c", sourceDeclaration: "own run", license: "CC-BY-4.0" });
  // @ts-expect-error sourceDeclaration is required
  await w.submit({ title: "t", body: "b", category: "c" });
  // @ts-expect-error not a license the origin lists
  await w.submit({ title: "t", body: "b", category: "c", sourceDeclaration: "own run", license: "MIT" });
}
