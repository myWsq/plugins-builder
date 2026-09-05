# plugins-builder maintenance contract

## Purpose and repository ownership

This repository is the only source of truth for the personal `myWsq/plugins` marketplace.
It owns plugin source, plugin metadata, the compiler, validation, and release automation.

The repositories have deliberately different roles:

- `myWsq/plugins-builder`: human- and agent-maintained source.
- `myWsq/plugins`: generated release snapshots consumed by Claude Code.

Never fix a release by editing `myWsq/plugins`. Fix the source or compiler here, create a new
verified release tag, and let GitHub Actions replace the generated snapshot.

## Source and generated boundaries

Authoritative source:

- `catalog/marketplace.json`: marketplace identity, ordered plugin list, and declared removals.
- `catalog/plugins/<name>.json`: plugin metadata — version, description, author, keywords,
  marketplace category — and origin.
- `docs/`: free-form marketplace documentation copied verbatim to the release.
- `MARKET_README.md`: hand-maintained source for the published marketplace `README.md`.
- `plugins/<name>/`: canonical plugin content: skills, fragments, optional hooks and agents.
- `src/`: build, release-gate, tag, and release-sync tooling.
- `test/`: deterministic-build and safety tests.
- `.github/workflows/`: verification and release automation.

Generated content:

- `dist/`: disposable local build output; ignored by Git.
- `dist/docs/`: copied marketplace documentation, emitted once rather than bundled in each plugin.
- `dist/README.md`: byte-for-byte copy of `MARKET_README.md`.
- `myWsq/plugins@main`: published generated snapshot; the release workflow owns it.

`npm run build` recreates `dist/` from scratch. `sync-release.mjs` removes old generated target
content but preserves the target repository's `.git/`; it runs only inside the release workflow,
against a fresh checkout, and requires an explicit `--target`. Never point the build command
directly at a Git repository root, and do not keep a sibling `../plugins` checkout for syncing —
a stale one silently weakens the version gate.

The compiler ships `skills/` with fragment includes expanded, and copies the optional `hooks/` and
`agents/` directories verbatim, into one Claude Code bundle per plugin. Hooks follow a directory
convention instead of a descriptor field: `hooks/hooks.json` must exist and parse as JSON, and the
tree is copied verbatim because it is already Claude's native format; `agents/` is copied the same
way. The compiler then copies `docs/` plus `MARKET_README.md` to the release root. Documentation
has no catalog schema or required per-plugin layout. Adding commands or other new components is
compiler work: extend the descriptor when generated files need rendering, use a directory
convention when a native format ships verbatim, and add tests before expecting those files to
appear in a release.

Skill Markdown is rendered once, for the single bundle. The compiler no longer renders per-target
blocks; a leftover HTML-comment target marker in a skill or fragment is a build error, so retired
content is removed from the source rather than shipped. Do not introduce a general template
language for skill content.

Reusable skill Markdown belongs in flat, kebab-case `plugins/<name>/fragments/<fragment>.md` files.
Reference one on its own line with `<!-- include <fragment> -->`. Fragments are source-only rather
than shipped as separate files. A fragment must end with a newline and cannot contain include or
target directives. Missing, inline, nested, or malformed includes are build errors. Keep fragments
small and literal; do not turn this mechanism into recursive templating.

## Generated layout

Each source plugin produces one bundle:

```text
dist/
├── .claude-plugin/marketplace.json
├── docs/...
├── README.md
└── plugins/<name>/
    ├── .claude-plugin/plugin.json
    ├── LICENSE
    ├── agents/
    ├── hooks/
    └── skills/
```

The marketplace index points at each bundle through the entry's `source` (`./plugins/<name>`).
Do not use symlinks in source or output.

## Adding or updating a plugin

1. Choose a kebab-case plugin name. The catalog name, descriptor `name`, and directory name must
   match exactly.
2. Add or update canonical content under `plugins/<name>/`.
3. Add or update `catalog/plugins/<name>.json` with the fields the manifest and marketplace entry
   consume: `name`, `version`, `description`, `author`, `homepage`, `repository`, `license`,
   `keywords`, and `category`. The build rejects unknown shapes only through the fields it requires,
   so do not park unused metadata there.
4. Update `docs/` and `MARKET_README.md` when marketplace-facing documentation changes.
5. Add a new plugin name to `catalog/marketplace.json.plugins` in desired display order.
6. Bump that plugin's strict-semver descriptor `version` whenever its shipped payload, generated
   manifest metadata, or marketplace entry (including `category` and `source`) changes.
7. Keep origin/provenance metadata accurate when importing content from another repository.
8. Run `npm run verify` and inspect the generated bundle plus `dist/docs/`.
9. For a smoke test, install the plugin from `dist/` directly; do not sync into another checkout.

A rename is a removal plus an addition. Plugin removal must be declared: list the withdrawn name in
`catalog/marketplace.json.removed`. The build validates the list (kebab-case, no duplicates, never
overlapping active plugins) and emits it as `.removed-plugins.json` in the generated root; the
release gate rejects any published plugin that disappears from the candidate without appearing in
that declaration. The declaration is reviewed like any other catalog change; entries may be pruned
once the published snapshot no longer contains the plugin.

Plugin source must contain real files, not symlinks. Keep secrets out of source and generated
output. Configuration may name environment variables, but must never contain their values.

## Version and tag contract

There are two version layers:

- `catalog/plugins/<name>.json.version`: the installed plugin version. A changed plugin release
  requires a strictly greater SemVer version.
- `package.json.version`: the plugins-builder marketplace release version.

A release tag must be exactly `v<package.json.version>` and point to a commit on `main`.
GitHub Actions rejects a mismatch or a tag created from another branch.
The release gate compares the currently published and candidate bundles plus their marketplace
entries. It locates each bundle through the entry's `source`, never through an assumed directory
prefix, so the bundle directory can move as long as every affected plugin version is bumped.
Changed payload with an unchanged or lower plugin version fails. SemVer parsing and precedence use
the npm `semver` package; build metadata alone is not an upgrade. Marketplace documents under
`docs/` and `MARKET_README.md` are not installed plugin payload and therefore do not require a
plugin version bump.

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
git clone --depth 1 https://github.com/myWsq/plugins.git /tmp/published
npm run check:release -- --current /tmp/published --next dist
```

- `npm test`: deterministic-build, source validation, stale-file, sync-safety, version, and
  release-gate tests.
- `npm run build`: rebuild `dist/`; local `sourceRevision` defaults to `working-tree`.
- `npm run verify`: run tests, then build the real catalog.
- `npm run check:tag`: require the release tag to match `package.json.version`.
- `npm run check:release`: enforce installed plugin version monotonicity against a generated
  baseline. The baseline must be a fresh clone of the published snapshot — never a long-lived
  sibling checkout, which drifts behind and turns the gate into a false pass.

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

- Create `myWsq/plugins` with a `main` branch. Bootstrap it by running
  `node src/sync-release.mjs --target <checkout>` once against a verified `npm run build`; the
  result must contain `.generated-by-plugins-builder`. After that the release workflow owns it.
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
- Every changed plugin has a strictly greater version.
- `npm run verify` passes.
- The generated bundle contains the intended real files.
- Release-gate tests cover any new component or policy behavior.
- No credentials, symlinks, stale files, or machine-specific absolute paths enter the output.
- Official publication happens from an immutable, correctly versioned tag.
