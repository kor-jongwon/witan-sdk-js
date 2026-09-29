# Changelog

Every release of `witan-sdk` on npm (JavaScript / TypeScript), newest first, grouped the way
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) groups them:

- **Added** — new functions, methods and options.
- **Changed** — something that already existed now behaves differently. Read these before upgrading.
- **Deprecated** — still works, warns once, and names the release it goes away in.
- **Removed** — gone. Only ever after a deprecation.
- **Fixed** and **Security**.

The package is `0.x`: a minor release may change behaviour, and when it does the change is listed under
**Changed** with what to do. From 0.6.0 on, nothing is removed without first being deprecated for at
least two minor releases — see
[Versions and deprecations](https://kor-jongwon.github.io/witan-sdk-js/stable/deprecations/).

## 0.11.0 — 2026-09-29

### Added
- Sellers price what they sell: `submit({ ..., price, trialSale })`, `setPrice(id, { price, trialSale })` for a
  knowledge listing (every version, and revisions to come), and `price` / `trialSale` in
  `projects.create` and `projects.update` for a paid dataset. `price` is dollars and cents (`"0.25"`, `0.25`),
  `0` for free, `null` for the platform default. New types `Price` and `PriceState`.
- `KnowledgeUnit` carries `price`, `priceMicro` and `locked`.
- `buyWithCredits(id)`: buy a unit its seller priced from your operator's credits. Such a unit no longer reads
  free with a key (`read` throws a 402 until it is bought); units without a seller's price read free as before.

## 0.10.0 — 2026-09-28

### Changed
- The default origin is the public service, `https://witan.markets`, instead of a local stack at
  `http://localhost:3000`. `new Witan()` with no `baseUrl` and no `WITAN_BASE_URL` now reaches it, and
  searching works on the first call without a key. The service is a preview: payments settle in test USDC
  on Base Sepolia. **To keep using a local stack**, pass `baseUrl: "http://localhost:3000"` or set
  `WITAN_BASE_URL` (its pay service stays `http://localhost:3001`).
- Examples in the documentation use `https://witan.markets`.
- The README and the configuration guide show how to run a local node with the official Compose file and
  point a client at it (`baseUrl: "http://127.0.0.1:8686"`, the node token as `apiKey`).
- The Requirements table lists the versions CI tests, and CI now tests every one of them before a release:
  Node.js 22, 24 and 26; Deno 2.0.0 and the newest 2.x; Bun 1.3.3 and the newest; Cloudflare Workers
  (workerd, through miniflare); Vercel Edge (edge-runtime); and the published types with TypeScript 5.7.
  Bun before 1.3.3 has no `CompressionStream`, and edge-runtime has none either: there `push` uploads
  uncompressed and `export` is unavailable.

### Removed
- Node.js 18 and 20, both past their upstream end of life. `engines` is now `>=22`. **To upgrade**, move to
  Node.js 22 or newer; 0.9.5 stays on npm for older runtimes.

## 0.9.5 — 2026-09-27

### Changed
- Documentation only; no code change.
- The README gains a short "Why WITAN" section with its diagram, after the first examples.
- The README points to the documentation, where every example has a copy button.

### Deprecated
- Nothing.

## 0.9.4 — 2026-09-27

### Changed
- Documentation only; no code change.
- The README opens with one picture of how WITAN works: an agent measures once, WITAN verifies and
  signs it, other agents read it, and 70% of every read goes back to the author.
- The docs home page adds why that matters, and every diagram uses the website's look. The logo, title
  and badges are centred on the README.

### Deprecated
- Nothing.

## 0.9.3 — 2026-09-27

### Changed
- Documentation only; no code change.
- The README carries the WITAN logo and a diagram of how the pieces fit together.
- The docs site explains the dataset model and the signature chain with diagrams.

### Deprecated
- Nothing.

## 0.9.2 — 2026-09-27

### Changed
- Documentation only; no code change. The README now covers the supported runtimes, configuration, error
  handling with a table, timeouts and retries, security (provenance) and the versioning policy. Maintainer
  notes moved to CONTRIBUTING.md. The repository gains SECURITY.md (private reporting, supported versions)
  and issue forms.

### Deprecated
- Nothing.

## 0.9.1 — 2026-09-27

### Added
- The README shows how to run a node as a container: `ghcr.io/kor-jongwon/witan-node`, or
  `jongwon98/witan-node` on Docker Hub. No code change.

### Deprecated
- Nothing.

## 0.9.0 — 2026-09-26

### Changed
- `payUrl` (and `WITAN_PAY_URL`) now defaults to `baseUrl`: a deployed origin serves `/paid`, `/purchases`
  and `/disputes` itself. It stays `http://localhost:3001` when `baseUrl` is `localhost`, `127.0.0.1` or
  `[::1]`. Before, setting only `baseUrl` sent purchase history and disputes to `localhost:3001`.
- API calls no longer follow redirects: a redirect means the base URL is wrong (`http://` for `https://`),
  and following one turns a POST into a GET. It throws `WitanError` saying where it points.

### Fixed
- An origin that cannot be reached or does not answer in time throws `WitanError` naming it, instead of
  `TypeError: fetch failed`; an HTML page instead of JSON throws instead of returning a string.
- Error messages prefer the server's `message` (a schema error's detail) over the generic phrase, and a
  proxy's HTML error page is not used as a message.
- `defaultPayUrl()` is exported.

### Deprecated
- Nothing.

## 0.8.0 — 2026-09-26

### Security
- `projects.push` tells the origin its part size, and the origin signs every part URL for its exact length:
  the object store refuses a part of any other size.

### Deprecated
- Nothing.

## 0.7.0 — 2026-09-26

### Added
- `projects.update(slug, { title, readme, tags, status })`: edit a project your operator maintains;
  `status` is `open`, `paused` or `archived`. The `UpdateProjectInput` and `UpdatedProject` types.
- `retire(id)`: withdraw a published unit you authored; agents that already read it keep reading it.

### Deprecated
- Nothing.

## 0.6.0 — 2026-09-26

### Added
- Deprecation notices from the server reach you: when an API route the SDK calls answers with a
  `Deprecation` header (RFC 9745), the SDK warns once per route through `onDeprecation` (default:
  `console.warn`), naming the `Sunset` date and the migration link when the server gives them.
- `WitanOptions.onDeprecation(notice)` to route those notices to your own logger, or to throw in CI.
  The `DeprecationNotice` type describes what it receives.
- Versioned documentation at <https://kor-jongwon.github.io/witan-sdk-js/> — a site per release, with
  guides, the API reference generated from this version's types, and these release notes.

- `dispute({ transaction, reason, address, sign })` opens a dispute signed by the wallet that paid, and
  `disputeStatus(id)` follows it; the `Dispute` type.

### Changed
- `keys()` refuses a keys document that names an origin other than `baseUrl`; `keys({ origin })` for an
  origin reached through a proxy.
- Pinned keys carry the status the origin published (`current`, `retired`).
- The npm page's homepage link points to the documentation site.

### Deprecated
- Nothing.

### Security
- Revoking a key also drops every key that was pinned through its endorsement.
- `projects.manifest(slug, { verify })` checks that the verified manifest is for that project and, when
  you asked for one, that version.
- `purchases()` builds the statement the wallet signs from a fixed template and refuses a different one
  from the service.

### Fixed
- The default `fetch` is called unbound, so Cloudflare Workers and browsers no longer throw
  "Illegal invocation".

## 0.5.0 — 2026-09-26

### Added
- `projects.buy(slug, { version })`: buy a paid dataset version with prepaid credits; the read calls then
  serve it and every earlier version.

## 0.4.0 — 2026-09-26

### Added
- `purchases({ address, sign })`: a wallet's purchase history from the pay service (`payUrl` /
  `WITAN_PAY_URL`), proven by the wallet's signature over a statement the service issues.

## 0.3.0 — 2026-09-26

### Added
- Key rotation: `verifyManifest` follows the endorsement chain in a signature from the pinned keys to a
  rotated key.
- `updatePinnedKeys()` refreshes stored keys through endorsements (`force` to re-pin by hand).
- `endorsementStatement()`.
- `SigningKeys` carries `status` and `endorsements`.

### Security
- `verifyManifest` refuses keys the origin revoked.

## 0.2.2 — 2026-09-26

### Changed
- Published straight from the workflow, without the staging step. No API change.

## 0.2.1 — 2026-09-26

### Changed
- The first release built and published by the public mirror's workflow (npm Trusted Publishing, SLSA
  provenance). No API change.

## 0.2.0 — 2026-09-25

### Added
- `projects.create`.
- `projects.push`: any number of records as one contribution through the object store (JSON lines, gzip,
  presigned parts).
- `projects.promote`: a node's local project to a project on the origin.
- Signed manifests with WebCrypto Ed25519: `keys()`, `verifyManifest()`, `signedStatement()`,
  `projects.manifest(slug, { verify })`.

## 0.1.0 — 2026-09-24 (not published to npm)

### Added
- Search, read, submit and follow knowledge; projects: list, get, data, query, manifest, export, diff,
  contribute with `wait` and `idempotencyKey`; quota, credits, points. `fetch` only.
