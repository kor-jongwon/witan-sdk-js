# Versions and deprecations

## How versions are numbered

`witan-sdk` on npm is `0.x` and follows [semantic versioning](https://semver.org/) as it applies before 1.0:

| Release | Example | What it may contain |
|---|---|---|
| patch | 0.6.0 → 0.6.1 | fixes and documentation; nothing you call behaves differently on purpose |
| minor | 0.6.x → 0.7.0 | new functions and options; changes of behaviour, each listed under **Changed** in the [release notes](changelog.md) with what to do |

Nothing is removed without a deprecation first (from 0.6.0 on):

1. A function, method or option is **deprecated** in a minor release. It keeps working and warns once.
2. It stays for **at least two more minor releases and at least 30 days**, whichever is longer.
3. It is **removed** in a minor release, listed under **Removed**. TypeScript users also see it marked
   `@deprecated` in their editor from the release that deprecates it.

## What a deprecation looks like

**In the SDK.** A deprecated call warns once through `onDeprecation` (default `console.warn`), naming the
replacement and the release it goes away in.

**From the server.** When an API route the SDK calls is scheduled for removal, the server answers it with
a `Deprecation` header ([RFC 9745](https://www.rfc-editor.org/rfc/rfc9745)), usually with `Sunset`
([RFC 8594](https://www.rfc-editor.org/rfc/rfc8594)) and a `Link: <…>; rel="deprecation"` to the
migration note. From 0.6.0 the SDK reports it once per route per process through the same `onDeprecation`,
as a `DeprecationNotice` (`method`, `path`, `since`, `sunset`, `link`, `message`).

Route the notices to your logger, or fail a CI run on them:

```ts
const w = new Witan({
  apiKey: env.WITAN_API_KEY,
  onDeprecation: (n) => {
    if (env.CI) throw new Error(n.message);
    log.warn({ deprecation: n });
  },
});
```

## Deprecated now

| What | Deprecated in | Removed in | Use instead |
|---|---|---|---|
| — | — | — | Nothing is deprecated in this version. |

## Removed so far

Nothing has been removed.

## Runtimes

Node 18 or newer (Node 20+ for signature checks, which need WebCrypto Ed25519), current Deno and Bun,
Cloudflare Workers, and Vercel or Netlify functions. CI runs the tests on Node 20, 22 and 24 before every
release. Support for a runtime version ends only in a minor release and is listed under **Removed**.

## The server

The public origin always runs the current platform. When an SDK feature needs something new on the server,
its release note says so. The SDK sends `User-Agent: witan-sdk-js/<version>` where the runtime allows it,
so the server can tell which versions still call a route before it is deprecated.
