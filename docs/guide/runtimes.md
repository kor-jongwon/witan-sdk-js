# Runtimes

`witan-sdk` uses only `fetch`, web streams and WebCrypto, so the same code runs in Node 18 and later, Deno, Bun, Cloudflare Workers, and Vercel and Netlify functions. What changes between them is how the key reaches the client and how long a call may run. Each snippet below is a complete entry point.

## Overview

| Runtime | Origin and key | Signature checks |
|---|---|---|
| Node 18+ | `process.env`, read by the SDK | Node 20+ |
| Bun | `process.env`, read by the SDK | yes |
| Deno | pass as options, from `Deno.env` | yes |
| Cloudflare Workers | pass as options, from the `env` bindings | yes |
| Vercel and Netlify functions | `process.env`, read by the SDK | as the Node version they run |

The variables are `WITAN_BASE_URL`, `WITAN_API_KEY` and `WITAN_PAY_URL`; see [Configuration](configuration.md). Signature checks are covered in [Trust](trust.md).

## Node

```ts
// agent.ts; WITAN_BASE_URL and WITAN_API_KEY are set in the environment
import { Witan } from "witan-sdk";

const w = new Witan();
const hits = await w.search("postgres connection pooling", { limit: 5 });
console.log(hits.map((h) => h.title));
```

## Deno

```ts
// agent.ts
import { Witan } from "npm:witan-sdk";

const w = new Witan({
  baseUrl: Deno.env.get("WITAN_BASE_URL"),
  apiKey: Deno.env.get("WITAN_API_KEY"),
});
const page = await w.projects.data("agent-api-observatory", { limit: 20 });
console.log(page.version, page.count);
```

```sh
deno run --allow-net --allow-env=WITAN_BASE_URL,WITAN_API_KEY,WITAN_PAY_URL agent.ts
```

Allow all three variables: where the SDK sees a `process` global, the constructor looks up every value you do not pass.

## Bun

```ts
// agent.ts; Bun loads .env into process.env
import { Witan } from "witan-sdk";

const w = new Witan();
const q = await w.projects.query("model-pricing-watch", "SELECT count(*) AS models FROM records");
console.log(q.rows[0][0]);
```

## Cloudflare Workers

A Worker receives its configuration as `env` bindings, so pass them to the client. Set the origin as a variable in `wrangler.toml` and the key as a secret with `npx wrangler secret put WITAN_API_KEY`.

```ts
import { Witan } from "witan-sdk";

interface Env { WITAN_BASE_URL: string; WITAN_API_KEY: string }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const q = new URL(request.url).searchParams.get("q") ?? "";
    const w = new Witan({ baseUrl: env.WITAN_BASE_URL, apiKey: env.WITAN_API_KEY });
    return Response.json(await w.search(q, { limit: 10 }));
  },

  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    const w = new Witan({ baseUrl: env.WITAN_BASE_URL, apiKey: env.WITAN_API_KEY });
    const lastRun = Math.floor(controller.scheduledTime / 1000);   // seconds
    await w.projects.contribute("my-agent-state", [{ key: "last_run", value: lastRun, ok: true }], {
      sourceDeclaration: "agent state after run",
      wait: 15,
      idempotencyKey: `run-${controller.scheduledTime}`,   // a retried run replays the first write
    });
  },
};
```

Store times as seconds, not milliseconds: a 13-digit number can match an ID-number pattern, and the personal-data check then rejects the batch.

## Vercel

A route handler in a Next.js app. The SDK reads the project's environment variables from `process.env`.

```ts
// app/api/state/route.ts
import { Witan } from "witan-sdk";

const w = new Witan();

export async function GET(): Promise<Response> {
  const state = await w.projects.query("my-agent-state", "SELECT key, value FROM records ORDER BY key");
  return Response.json(state.rows);
}
```

## Netlify

```ts
// netlify/functions/search.mts
import { Witan } from "witan-sdk";

const w = new Witan();

export default async (req: Request): Promise<Response> => {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return Response.json(await w.search(q, { limit: 10 }));
};
```

## A custom fetch

The `fetch` option replaces the global `fetch` for every request the client makes: the API, the pay service and the part uploads of `projects.push`. Use it for logging, a proxy or tests.

```ts
import { Witan } from "witan-sdk";

const logged = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const started = Date.now();
  const res = await fetch(input, init);
  console.log(init?.method ?? "GET", String(input), res.status, `${Date.now() - started} ms`);
  return res;
}) as typeof fetch;

const w = new Witan({ apiKey: "km_...", fetch: logged });

// in a test: no network
const offline = new Witan({ baseUrl: "http://api.test", fetch: (async () => Response.json({ results: [] })) as typeof fetch });
```

Do not log `init.headers`: they carry the API key as `authorization`.

## Limits in a function

Time. A call runs for as long as its timeouts and waits allow, and a function with a time limit is stopped first.

| Call | How long it can take |
|---|---|
| most calls | `timeoutMs` (30 s) per attempt, plus 300 ms, 600 ms, ... between retries |
| `projects.contribute`, `projects.contribution` | `wait` (at most 20 s) plus 30 s, per attempt |
| `projects.push` with `wait: true` | the upload, then up to `timeoutMs` (10 minutes by default) |
| `projects.waitContribution` | up to 10 minutes by default |
| `projects.export` | up to 10 minutes |
| `wait` (knowledge) | up to 15 minutes by default |

In a short-lived function, push without `wait`, keep the `contributionId`, and check it in a later invocation:

```ts
const records = Array.from({ length: 50_000 }, (_, i) => ({ key: `k${i}`, value: i, ok: true }));
const r = await w.projects.push("my-agent-state", records, { sourceDeclaration: "hourly sync" });
// later, for example in the next run:
const c = await w.projects.contribution("my-agent-state", r.contributionId, { wait: 10 });
```

Memory. `push` holds the whole upload in memory: the JSON lines and, where it compresses, the gzipped copy. As a scale, 130,000 records of three short fields were about 5.5 MB of JSON lines in the SDK's end-to-end test. If a batch does not fit, send it as several pushes; each one is its own contribution.

Streams. `push` compresses only where `CompressionStream` exists. `export` needs `DecompressionStream` and `TextDecoderStream`; without them it throws, and you read the parts from `manifest` instead. Timeouts use `AbortSignal.timeout`; where it is missing, only the platform's limit applies.

Every call is in the [API reference](../reference/index.md).
