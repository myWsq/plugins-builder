# plugins-builder maintenance contract

## Purpose and repository ownership

This repository is the only source of truth for the personal `myWsq/plugins` marketplace.
It owns plugin source, neutral metadata, the compiler, validation, and release automation.

The repositories have deliberately different roles:

- `myWsq/plugins-builder`: human- and agent-maintained source.
- `myWsq/plugins`: generated release snapshots consumed by Claude Code and Codex.

Never fix a release by editing `myWsq/plugins`. Fix the source or compiler here, create a new
verified release tag, and let GitHub Actions replace the generated snapshot.

## Source and generated boundaries

Authoritative source:

- `catalog/marketplace.json`: marketplace identity and ordered plugin list.
- `catalog/plugins/<name>.json`: neutral plugin metadata, plugin version, target policy, MCP server
  descriptors, and origin.
- `docs/`: free-form marketplace documentation copied verbatim to the release.
- `MARKET_README.md`: hand-maintained source for the published marketplace `README.md`.
- `plugins/<name>/`: canonical plugin content, including skills and MCP runtime source.
- `src/`: build, release-gate, tag, and local-sync tooling.
- `test/`: deterministic-build and safety tests.
- `.github/workflows/`: verification and release automation.

Generated content:

- `dist/`: disposable local build output; ignored by Git.
- `dist/docs/`: copied marketplace documentation, emitted once rather than bundled in each target
  plugin.
- `dist/README.md`: byte-for-byte copy of `MARKET_README.md`.
- `../plugins/`: local checkout of the generated marketplace; everything except `.git/` is owned
  by this builder.
- `myWsq/plugins@main`: published generated snapshot; the release workflow owns it.

`npm run build` recreates `dist/` from scratch. `sync-local.mjs` removes old generated target
content but preserves the target repository's `.git/`. Never point the build command directly at
a Git repository root.

The current compiler ships `skills/` and descriptor-declared `mcp/` runtime files in both plugin
targets, then copies `docs/` plus `MARKET_README.md` to the release root. Documentation has no
catalog schema or required per-plugin layout. Adding apps, hooks, commands, agents, or other new
components is compiler work: extend the neutral descriptor, render the platform-specific files,
and add tests before expecting those files to appear in a release.

Skill Markdown may select content for one generated target without changing its canonical filename.
Use paired `<!-- codex -->`/`<!-- /codex -->` or `<!-- claude -->`/`<!-- /claude -->` markers on
their own lines. Content outside target blocks is shared. The compiler renders every Markdown file
beneath `skills/`, strips the markers and nonmatching blocks, and copies non-Markdown files
verbatim. Target blocks cannot nest; orphaned, mismatched, inline, or unclosed known markers are
build errors. Do not introduce a general template language or target-specific source copies for
this use case. Adding or changing rendered content changes shipped payload, so bump the plugin
version.

`mcpServers` is target-neutral catalog data. Each server has a kebab-case name, a safe executable
name in `command`, and a portable `entry` path beneath `mcp/`. The entry must resolve to a real file
in the canonical plugin source. The compiler copies the complete `mcp/` tree, renders Claude's
direct server map with `${CLAUDE_PLUGIN_ROOT}`, and renders Codex's `mcpServers` wrapper with an
entry relative to plugin root and `cwd` set to `.`. Keep target-specific paths and wrapper shapes
out of the catalog descriptor.

## Target layout

Each source plugin produces two real bundles:

```text
dist/
├── .claude-plugin/marketplace.json
├── .agents/plugins/marketplace.json
├── docs/...
├── claude-plugins/<name>/
│   ├── .mcp.json
│   ├── .claude-plugin/plugin.json
│   ├── mcp/
│   └── skills/
└── plugins/<name>/
    ├── .mcp.json
    ├── .codex-plugin/plugin.json
    ├── mcp/
    └── skills/
```

The two bundles are generated from one canonical source. Do not use symlinks in source or output.

## Adding or updating a plugin

1. Choose a kebab-case plugin name. The catalog name, descriptor `name`, and directory name must
   match exactly.
2. Add or update canonical content under `plugins/<name>/`.
3. Add or update `catalog/plugins/<name>.json`. For MCP servers, declare only the neutral
   `command` and `entry`; do not hand-author target `.mcp.json` files.
4. Update `docs/` and `MARKET_README.md` when marketplace-facing documentation changes.
5. Add a new plugin name to `catalog/marketplace.json.plugins` in desired display order.
6. Bump that plugin's strict-semver descriptor `version` whenever its shipped payload, generated
   manifest metadata, marketplace policy, or category changes.
7. Keep origin/provenance metadata accurate when importing content from another repository.
8. Run `npm run verify` and inspect both target bundles plus `dist/docs/`.
9. Optionally run `npm run sync:local` for a local install smoke test.

A rename is a removal plus an addition. Plugin removal is blocked by the release gate; implement an
explicit, reviewed removal mechanism before intentionally withdrawing a plugin.

Plugin source must contain real files, not symlinks. Keep secrets out of source and generated
output. Configuration may name environment variables, but must never contain their values.

## Version and tag contract

There are two version layers:

- `catalog/plugins/<name>.json.version`: the installed plugin version. A changed plugin release
  requires a strictly greater SemVer version.
- `package.json.version`: the plugins-builder marketplace release version.

A release tag must be exactly `v<package.json.version>` and point to a commit on `main`.
GitHub Actions rejects a mismatch or a tag created from another branch.
The release gate compares the currently published and candidate Claude/Codex bundles plus their
marketplace entries. Changed payload with an unchanged or lower plugin version fails. SemVer
parsing and precedence use the npm `semver` package; build metadata alone is not an upgrade.
Marketplace documents under `docs/` and `MARKET_README.md` are not installed plugin payload and
therefore do not require a plugin version bump.

Normal release preparation:

1. Update source and bump every changed plugin version.
2. Run `npm run verify`.
3. Commit the plugin changes.
4. Run `npm version patch`, `npm version minor`, or `npm version major` as appropriate. This
   updates the builder version, creates the release commit, and creates `vX.Y.Z`.
5. Push the branch and tag with `git push origin main --follow-tags`.

## Commands

```bash
npm ci --ignore-scripts
npm test
npm run build
npm run verify
npm run check:tag -- v0.2.1
npm run check:release -- --current ../plugins --next dist
npm run sync:local
```

- `npm test`: deterministic-build, MCP rendering/source validation, stale-file, sync-safety,
  version, and release-gate tests.
- `npm run build`: rebuild `dist/`; local `sourceRevision` defaults to `working-tree`.
- `npm run verify`: run tests, then build the real catalog.
- `npm run check:tag`: require the release tag to match `package.json.version`.
- `npm run check:release`: enforce installed plugin version monotonicity against a generated
  baseline.
- `npm run sync:local`: build and replace the sibling generated checkout while preserving
  `.git/`. It is for local preview, not the official release path.

For a traceable local build, set `SOURCE_REVISION=<git-sha>`.

## GitHub Actions

`verify.yml` runs on pull requests and pushes to `main`. It installs exactly
`package-lock.json`, runs tests, and builds the real catalog. It never writes another repository.

`release.yml` runs only when a `v*` tag is pushed:

1. Check out the tagged builder commit.
2. Install locked dependencies.
3. Require `GITHUB_REF_NAME === v<package.json.version>` and require the tagged commit on `main`.
4. Run tests and build with the tagged commit SHA in `BUILD_INFO.json`.
5. Check out `myWsq/plugins@main`.
6. Compare the candidate against the currently published plugin versions.
7. Safely replace the generated tree while preserving `.git/`.
8. Create and fast-forward push a bot commit to `myWsq/plugins@main`.
9. Create the matching GitHub Release in `plugins-builder`.

The release job is serialized and never force-pushes.

## GitHub setup and first release

- Create `myWsq/plugins` with a `main` branch and bootstrap it from a verified local
  `npm run sync:local` result. It must contain `.generated-by-plugins-builder`.
- Add a dedicated SSH public key to `myWsq/plugins` as a write-enabled deploy key, and store its
  private key in the `myWsq/plugins-builder` Actions secret `MARKETPLACE_REPO_SSH_KEY`.
- Use this key only for `myWsq/plugins`; never reuse a personal SSH key or share it with another
  repository.
- If the target branch has protection rules, allow deploy-key pushes or replace the key with a
  repository-scoped GitHub App that has the required bypass.
- Protect release tags so only trusted maintainers can create `v*` tags.

Do not initialize the target with hand-maintained README, workflows, CODEOWNERS, or other files.
Every target file outside `.git/` must be generated here.

## Failure handling

- Descriptor/name/SemVer errors: fix source metadata; do not weaken validation.
- Symlink error: replace the link with real files.
- Changed payload without version bump: bump the affected plugin version and create a new builder
  release version/tag.
- Tag mismatch: delete the incorrect local tag if it was not published, correct
  `package.json.version`, and create the right tag. Never move a published release tag.
- Target checkout or push failure: verify the deploy key, Actions secret, target `main`, and branch
  rules.
- Sync reports an unmanaged target: stop and verify the path. Never forge the generated marker or
  delete an unknown repository to bypass the guard.
- No generated diff: treat the publish step as a successful no-op.
- Bad published snapshot: fix and release from a new version. Do not edit or force-push target
  history.

## Definition of done

- Catalog, descriptor, directory name, and generated manifest names agree.
- Descriptor-declared MCP entries exist, and both target bundles contain the runtime plus their
  target-specific `.mcp.json` configuration.
- Every changed plugin has a strictly greater version.
- `npm run verify` passes.
- Both Claude and Codex bundles contain the intended real files.
- Release-gate tests cover any new component or policy behavior.
- No credentials, symlinks, stale files, or machine-specific absolute paths enter the output.
- Official publication happens from an immutable, correctly versioned tag.
