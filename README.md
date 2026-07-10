# plugins-builder

Engineering source for the personal [plugins](https://github.com/myWsq/plugins) marketplace.
This repository owns the catalog, plugin source, deterministic build, tests, and release workflow.
The sibling `plugins` repository is generated output and must not be edited by hand.

## Commands

```bash
npm ci --ignore-scripts
npm test
npm run build
npm run sync:local
```

- `npm run build` rebuilds `dist/` from scratch.
- `npm run sync:local` builds and safely syncs `dist/` into `../plugins`, preserving its `.git/`.
- `npm run verify` runs tests and a real catalog build.

## Source layout

```text
catalog/                  Marketplace and plugin metadata
docs/                     Free-form marketplace documentation
MARKET_README.md           Source for the generated marketplace README
plugins/<name>/skills/    Canonical skill source
src/                      Build and local-sync tooling
test/                     Determinism and safety tests
dist/                     Generated marketplace tree
```

The compiler emits separate Claude and Codex plugin bundles from the same canonical source so
platform-specific MCP, app, hook, and authentication configuration can evolve independently.
`MARKET_README.md` and `docs/` are copied verbatim to the generated marketplace root. They are not
duplicated inside installable plugin bundles.

## Publishing

Pull requests and `main` pushes run verification only. A `vX.Y.Z` tag runs the release workflow:

1. The tag must equal `v<package.json.version>` and point to a commit on `main`.
2. Tests and a deterministic catalog build must pass.
3. Any changed plugin payload must carry a strictly greater plugin SemVer.
4. The generated tree is synchronized to `myWsq/plugins@main`.
5. The workflow creates the matching GitHub Release.

The target repository is written with a dedicated SSH deploy key. Its public key is a write-enabled
deploy key on `myWsq/plugins`; its private key is stored in the builder's
`MARKETPLACE_REPO_SSH_KEY` Actions secret. See [AGENTS.md](AGENTS.md) for the full source, version,
bootstrap, and failure-handling contract.
