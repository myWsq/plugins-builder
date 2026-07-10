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
plugins/<name>/skills/    Canonical skill source
src/                      Build and local-sync tooling
test/                     Determinism and safety tests
dist/                     Generated marketplace tree
```

The compiler emits separate Claude and Codex plugin bundles from the same canonical source so
platform-specific MCP, app, hook, and authentication configuration can evolve independently.

## Publishing

Pull requests and `main` pushes run verification only. A `vX.Y.Z` tag runs the release workflow:

1. The tag must equal `v<package.json.version>` and point to a commit on `main`.
2. Tests and a deterministic catalog build must pass.
3. Any changed plugin payload must carry a strictly greater plugin SemVer.
4. The generated tree is synchronized to `myWsq/plugins@main`.
5. The workflow creates the matching GitHub Release.

The target repository is written with a fine-grained `MARKETPLACE_REPO_TOKEN` secret scoped only
to `myWsq/plugins` with Contents read/write permission. See [AGENTS.md](AGENTS.md) for the full
source, version, bootstrap, and failure-handling contract.
