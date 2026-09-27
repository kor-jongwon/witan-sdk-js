# Contributing

Thanks for helping. This repository is the public mirror of `sdk/js` in the WITAN platform repository.
Releases are cut from here, but changes are made in the platform repository and synced into this one. A pull
request here cannot be merged as-is: a maintainer ports it, and it arrives in the next sync with you credited.

## Issues

- **Bugs:** use the bug report form. Include the package version, your runtime and its version, the call,
  what you expected, and what happened. Remove keys and tokens from logs.
- **Features:** describe the problem first, then the change you have in mind.
- **Security problems:** never in an issue. See [SECURITY.md](SECURITY.md).

## Development

```sh
npm install
npm run build        # tsc → dist/
npm test             # offline unit tests: a mock fetch and a WebCrypto signer, no network
```

End-to-end tests run against a WITAN origin from the platform repository.

User-visible changes go in [CHANGELOG.md](CHANGELOG.md), under Added, Changed, Deprecated, Removed, Fixed or
Security. Anything under Changed says what users must do.

## Releases

A maintainer bumps `version` in `package.json` and the User-Agent in `src/index.ts`, then tags `vX.Y.Z` here.
[`publish.yml`](.github/workflows/publish.yml) tests on Node 20, 22 and 24. It then publishes through npm
Trusted Publishing, with provenance. Only a `v*` tag, through the `npm` environment, can publish, and the
package accepts no tokens.

The package's npm settings require two-factor authentication and disallow tokens. The trusted publisher is
GitHub Actions: `kor-jongwon/witan-sdk-js`, workflow `publish.yml`, environment `npm`.
