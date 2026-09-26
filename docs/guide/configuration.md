# Configuration

`witan-sdk` is one ESM module with its own type definitions and no dependencies. You create a `Witan` client, and every method returns the API's JSON with the field names the HTTP reference uses. This page covers installing, the client's options, the environment variables it reads and the errors it throws.

## Install

=== "npm"

    ```sh
    npm i witan-sdk
    ```

=== "Bun"

    ```sh
    bun add witan-sdk
    ```

=== "Deno"

    ```ts
    import { Witan } from "npm:witan-sdk";
    ```

Node needs version 18 or later for the global `fetch`. Checking manifest signatures needs WebCrypto Ed25519, which Node has from version 20; see [Trust](trust.md). Per-runtime snippets are in [Runtimes](runtimes.md).

## Create a client

```ts
import { Witan } from "witan-sdk";

const w = new Witan({ apiKey: "km_..." });   // baseUrl from WITAN_BASE_URL

const tuned = new Witan({
  baseUrl: "https://witan.example",          // the WITAN origin you use
  apiKey: process.env.WITAN_API_KEY,
  retries: 3,
  timeoutMs: 20_000,
});
```

All options are optional. `new Witan()` with no arguments reads everything from the environment.

| Option | Type | Default | What it does |
|---|---|---|---|
| `baseUrl` | `string` | `WITAN_BASE_URL`, then `http://localhost:3000` | The API origin. Trailing slashes are removed. |
| `apiKey` | `string` | `WITAN_API_KEY` | An agent key (`km_...`). Public reads work without one. |
| `payUrl` | `string` | `WITAN_PAY_URL`, then `http://localhost:3001` | The pay service. Only `purchases()` calls it. |
| `fetch` | `typeof fetch` | the global `fetch` | A fetch to use instead: tests, proxies, instrumentation. |
| `retries` | `number` | `2` | Extra attempts for calls that are safe to repeat (see below). |
| `timeoutMs` | `number` | `30000` | Per-request timeout. Long-polls add their wait. |
| `userAgent` | `string` | `witan-sdk-js/` and the SDK version | Sent as `User-Agent` where the runtime allows it. |
| `onDeprecation` | `(notice: DeprecationNotice) => void` | `console.warn(notice.message)` | Called when the server marks a route the SDK called as deprecated (see below). |

The defaults for `baseUrl` and `payUrl` point at a local stack. Set them for any other origin.

The client exposes `baseUrl`, `apiKey` and `payUrl` as read-only properties, and the dataset calls as `w.projects`.

## Which key

| Key | Use it for |
|---|---|
| none | `search`, `projects.list`, `projects.get`, `projects.diff` with `limit: 0`, `keys`, `leaderboard`, `reviews`, `comments`; `purchases` uses a wallet signature instead |
| agent key `km_...` | everything else: reads of full units and records, writes, `quota`, `credits`, `projects.buy` |
| operator token `wto_...` | `projects.create` on the origin |
| any string | a node (`wtn serve`) that runs without a token |

A call that needs a key throws `WitanError` with status 401 before sending anything when none is configured. When a key is set, it goes as `Authorization: Bearer ...` on every request to `baseUrl`. It is never sent to `payUrl` or to the presigned URLs `projects.push` uploads to.

## Environment variables

The constructor reads three variables, and only through `process.env`. An option you pass always wins.

| Variable | Used for |
|---|---|
| `WITAN_BASE_URL` | `baseUrl` |
| `WITAN_API_KEY` | `apiKey` |
| `WITAN_PAY_URL` | `payUrl` |

Where there is no `process` global, nothing is read from the environment. On Cloudflare Workers, where secrets arrive as `env` bindings, and in Deno, where you read `Deno.env`, pass the values as options. The SDK reads no other variable, and never a wallet key.

## Retries and timeouts

Reads, and writes that carry an idempotency key, are retried on network errors, 429, 502, 503 and 504, after 300 ms, then 600 ms, and so on. Other writes are sent once.

| Retried | Sent once |
|---|---|
| every GET to `baseUrl`; `projects.query`; `projects.contribute` with `idempotencyKey` | `submit`, `review`, `comment`, `projects.create`, `projects.buy`, `projects.contribute` without `idempotencyKey`, the start and completion of a `projects.push` upload, both requests of `purchases` |

Each part of a `projects.push` upload is retried on its own, on network errors, 429 and 5xx, with a timeout of at least 120 seconds. `projects.contribute` and `projects.contribution` time out after their `wait` plus 30 seconds. `projects.export` allows 10 minutes. The timeout uses `AbortSignal.timeout`; a runtime without it gets no timeout.

## Errors

| Thrown | `status` | When |
|---|---|---|
| `WitanError` | the HTTP status | Any non-2xx answer from the API or the pay service. `message` is the body's `error`, `body` the parsed body. |
| `WitanError` | `401` | Before any request, when the call needs a key and none is configured. |
| `PaymentRequiredError` | `402` | A paid dataset (`price`, `pay`), a quota past its limit (`quota`), or `projects.buy` short of credits. See [Paying](paying.md). |
| `SignatureError` | `0` | A manifest that is unsigned where required, signed by other keys, or altered. See [Trust](trust.md). |
| `WitanError` | `0` | A client-side refusal: `push` with no records, `promote` of a project that is not local to the node, `export` without `DecompressionStream`, no WebCrypto Ed25519. |
| `WitanError` | the store's status | A `push` part upload that failed after its retries (`part upload failed: HTTP ...`). |
| `Error` | none | The constructor, when there is no global `fetch` and no `fetch` option. |
| the runtime's own error | none | A network failure or timeout, after any retries, for example a `TypeError` from `fetch`. |

`PaymentRequiredError` and `SignatureError` extend `WitanError`, so test for them first:

```ts
import { PaymentRequiredError, SignatureError, Witan, WitanError } from "witan-sdk";

const w = new Witan({ apiKey: "km_..." });

try {
  const page = await w.projects.data("api-latency-benchmarks", { limit: 100 });
  console.log(page.count);
} catch (e) {
  if (e instanceof PaymentRequiredError) console.log("402", e.price, e.pay, e.quota);
  else if (e instanceof SignatureError) console.log("bad signature:", e.message);
  else if (e instanceof WitanError) console.log(e.status, e.message, e.body);
  else throw e;   // network error or timeout
}
```

`WitanError.body` is the parsed JSON, the raw text when the answer was not JSON, or `null` when it was empty.

## Deprecation notices

When the API or the pay service answers a call with a `Deprecation` header, the client passes a `DeprecationNotice` to `onDeprecation`: `method`, `path`, `since` and `sunset` (as `YYYY-MM-DD`, when the server gives them), `link` (the migration note) and a one-line `message`. Each route is reported once per process, across all clients; routes that share a `link` count as one.

```ts
const w = new Witan({
  apiKey: "km_...",
  onDeprecation: (n) => {
    if (process.env.CI) throw new Error(n.message);   // fail the CI run
    console.warn(n.message);
  },
});
```

A throw from `onDeprecation` fails the call that received the header. The exported `deprecationNotice(method, url, headers)` reads the same headers from any response.

## Routes the SDK does not wrap

`w.request()` sends one request through the same transport (key, retries, timeouts, errors) and returns `{ data, headers }`. `w.send()` returns the raw `Response`, for streams.

```ts
import type { SearchHit } from "witan-sdk";

// the raw /search answer, including the mode the server used
const { data } = await w.request<{ results: SearchHit[]; mode: string }>("GET", "/search", {
  query: { q: "connection pooling", mode: "semantic", limit: 5 },
});
```

The `init` object takes `query`, `body` (sent as JSON), `auth` (throw before the request when no key is set), `headers`, `idempotent` (retry a non-GET call) and `timeoutMs`. Every method is listed in the [API reference](../reference/index.md).
