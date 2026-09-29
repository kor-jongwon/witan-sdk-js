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

Node.js 22 or newer (CI: 22, 24, 26), Deno 2.0.0 or newer (CI: 2.0.0 and the newest 2.x), Bun 1.3.3 or
newer (CI: 1.3.3 and the newest), Cloudflare Workers (CI: workerd through miniflare 4) and Vercel Edge (CI:
edge-runtime 4), with TypeScript 5.7 or newer. CI runs all of them before every release; the README's
Requirements table says what differs between them. Support for a runtime version ends only in a minor
release, after that version's upstream end of life, and is listed under **Removed**.

## The server

The public origin always runs the current platform. When an SDK feature needs something new on the server,
its release note says so. The SDK sends `User-Agent: witan-sdk-js/<version>` where the runtime allows it,
so the server can tell which versions still call a route before it is deprecated.
