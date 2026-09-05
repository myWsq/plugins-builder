# plugins-builder

Engineering source for the personal [plugins](https://github.com/myWsq/plugins) marketplace.
This repository owns the catalog, plugin source, deterministic build, tests, and release workflow.
The sibling `plugins` repository is generated output and must not be edited by hand.

## Commands

```bash
npm ci --ignore-scripts
npm test
npm run build
npm run verify
```

- `npm run build` rebuilds `dist/` from scratch.
- `npm run verify` runs tests and a real catalog build.

Publishing to the sibling `plugins` repository happens only in the release workflow. There is no
local sync path: to try a change before releasing, install the plugin from `dist/` directly.

## Source layout

```text
catalog/                  Marketplace and plugin metadata
docs/                     Free-form marketplace documentation
MARKET_README.md           Source for the generated marketplace README
plugins/<name>/skills/    Canonical skill source
plugins/<name>/fragments/ Reusable skill Markdown, inserted by include
plugins/<name>/hooks/     Optional hooks tree, shipped verbatim
plugins/<name>/agents/    Optional agent definitions, shipped verbatim
src/                      Build and release tooling
test/                     Determinism and safety tests
dist/                     Generated marketplace tree
```

The compiler emits one Claude Code bundle per plugin at `dist/plugins/<name>/` and the marketplace
index at `dist/.claude-plugin/marketplace.json`. `MARKET_README.md` and `docs/` are copied verbatim
to the generated marketplace root. They are not duplicated inside installable plugin bundles.

## Reusable skill content

Reusable Markdown lives in flat, kebab-case files under `plugins/<name>/fragments/` and is inserted
into skill Markdown with an include on its own line:

```markdown
<!-- include commit-flow -->
```

Fragment files are source-only and are not copied into the plugin bundle. They must end with a
newline and may not contain other includes; missing, inline, or nested references fail the build.
Non-Markdown files under `skills/` are copied byte-for-byte.

Skill Markdown is shared by every consumer of the bundle. The compiler no longer renders per-target
blocks, and a leftover HTML-comment target marker in a skill or fragment fails the build rather than
shipping. Adding or changing rendered content changes installed plugin payload and therefore
requires a plugin version bump.

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
