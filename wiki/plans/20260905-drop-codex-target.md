# Plan 20260905-drop-codex-target: the builder compiles one Claude Code bundle and carries no Codex support

> This plan is an outcome contract, not a step-by-step script. Understand the
> requirement and the recorded decisions, then design the implementation
> yourself against the live code. Run milestone validations as you go only if
> you are also the verifier — a delegated executor implements only, and
> verification happens outside its session. Stop on any STOP condition. When
> complete, update this plan in `wiki/plans/README.md`.
>
> Drift check: `git diff --stat 825bade..HEAD -- src/build.mjs src/check-release.mjs test/build.test.mjs catalog plugins/dev README.md AGENTS.md MARKET_README.md docs/dev.md docs/coflux.md`

## Status

- Priority: P1
- Effort: M
- Risk: MED
- Depends on: none
- Category: refactor
- Execution: self
- Planned at: `825bade`, 2026-09-05

## Requirement

plugins-builder compiles every plugin from one canonical source into two
bundles, a Claude Code bundle under `dist/claude-plugins/<name>/` and a Codex
bundle under `dist/plugins/<name>/`, plus two marketplace indexes
(`.claude-plugin/marketplace.json` and `.agents/plugins/marketplace.json`). The
owner has decided the marketplace supports Claude Code only, permanently. Codex
support is to be removed from the builder, not disabled or hidden: compiler,
release gate, tests, catalog schema, skill sources, and maintainer docs must
read as if Codex had never been a target.

Product conclusions, settled in exploration:

- The consumer is a Claude Code user installing from `myWsq/plugins`. They
  perceive nothing beyond a plugin version bump: the same skills, hooks, and
  agents, installed with the same two commands.
- The published marketplace loses `.agents/plugins/marketplace.json` and the
  Codex bundles on the next release. `sync-release.mjs` already replaces every
  entry outside `.git/`, so nothing extra is needed for the removal to reach
  the published repository.
- `MARKET_README.md` keeps only the Claude Code install section. There is no
  "Codex is no longer supported" note anywhere — a clean removal, not a
  deprecation.

When this plan is done: `npm run build` emits exactly one bundle per plugin at
`dist/plugins/<name>/` with `.claude-plugin/plugin.json`, one marketplace index
at `dist/.claude-plugin/marketplace.json` whose entries point at
`./plugins/<name>`, and no `.agents/`, `claude-plugins/`, or `.codex-plugin/`
anywhere under `dist/`. The catalog descriptors carry only fields the Claude
output consumes. Skill Markdown has no target blocks, and a leftover target
marker fails the build. The release gate reads the Claude index only and can
compare the currently published snapshot (whose entries still say
`./claude-plugins/<name>`) against the new layout without special-casing. A
recursive search for `codex` outside `dist/`, `wiki/`, `plans/`, `.git/`, and
`node_modules/` finds only the two deliberately kept lines named under Scope.

An adjacent wrong solution keeps the dual-target rendering machinery "in case
a target returns", keeps dead descriptor fields "for future use", or hardcodes
`./plugins/<name>` in the gate and thereby rejects the published snapshot on
the first release.

## Decisions & tradeoffs

- **Target-block mechanism is deleted, not neutralised**: `renderTargetMarkdown`
  and the `SKILL_TARGETS` / `TARGET_DIRECTIVE_PATTERN` / target parameter of
  `copySkillTree` go away; skill Markdown is copied with fragment expansion
  only. Rejected: keeping `<!-- claude -->` as a no-op block for a hypothetical
  future target — the owner ruled out further targets, and a single-target
  build with a target selector is dead code with a test surface. Based on:
  `src/build.mjs:12-14`, `src/build.mjs:110`, `src/build.mjs:210`.
- **A leftover target marker is a build error**: any skill Markdown or fragment
  containing `<!-- claude -->`, `<!-- /claude -->`, `<!-- codex -->`, or
  `<!-- /codex -->` (with the whitespace tolerance of the current
  `KNOWN_TARGET_DIRECTIVE_PATTERN`) fails the build with the source path in the
  message. Rejected: copying markers verbatim as harmless HTML comments — a
  stale `<!-- codex -->` block would then ship Codex-only prose to Claude
  users. The fragment loader's existing rejection of target and include
  directives (`src/build.mjs:203`) keeps both halves. Based on:
  `src/build.mjs:14`, `src/build.mjs:199-204`.
- **Skill sources lose every target block**: `<!-- codex -->` blocks and their
  contents are deleted; `<!-- claude -->` blocks are unwrapped in place.
  `plugins/dev/fragments/codex-request-user-input.md` is deleted, and with it
  the now-empty `plugins/dev/fragments/` directory. Byte-identity of the
  Claude rendering is not a goal: every plugin is version-bumped anyway (see
  below), so collapse the double blank lines that the lone codex blocks leave
  behind rather than preserving them. Based on:
  `plugins/dev/skills/dev-explore/SKILL.md:10-12,71-76,80-85`,
  `plugins/dev/skills/dev-write-plan/SKILL.md:12-14`,
  `plugins/dev/skills/dev-execute-plan/SKILL.md:12-14`,
  `plugins/dev/skills/dev-advisor/SKILL.md:8-13,108`.
- **Fragment/include mechanism stays as is**: `<!-- include <name> -->`,
  `plugins/<name>/fragments/`, and their validation are unchanged. Rejected:
  removing includes along with target blocks — the `commit` plugin's four
  skills share `commit-flow` through it. Based on:
  `plugins/commit/skills/commit/SKILL.md:12`,
  `plugins/commit/skills/commit-pr/SKILL.md:14`,
  `plugins/commit/skills/commit-push/SKILL.md:14`.
- **Catalog descriptors keep only Claude-consumed fields, with `category`
  hoisted to the top level**: `targets` is deleted from all four
  `catalog/plugins/<name>.json` and `targets.claude.category` becomes
  top-level `category`; `displayName`, `shortDescription`, `longDescription`,
  `capabilities`, `defaultPrompt`, `brandColor` and their validation are
  deleted; `catalog/marketplace.json.displayName` and its validation are
  deleted. Rejected: keeping the dead fields "for a future Claude marketplace
  extension" — nothing validates or consumes them, so they would drift
  silently; also rejected: keeping the `targets.claude` nesting — a single
  branch is noise the owner chose to drop. Based on: the Claude manifest and
  marketplace entry consume only name, version, description, author,
  homepage, repository, license, keywords, category
  (`src/build.mjs:233-244`, `src/build.mjs:379-387`); the deleted fields are
  read only by `codexPluginManifest` and the Codex index
  (`src/build.mjs:246-268`, `src/build.mjs:407-413`); validation at
  `src/build.mjs:68-85`, `src/build.mjs:305`.
- **The Claude bundle moves to `dist/plugins/<name>/`**: marketplace entries
  point at `./plugins/<name>`; `dist/claude-plugins/` no longer exists.
  `hooks/` and `agents/` are copied into the bundle whenever the source
  directory exists (the "Claude bundle only" branch collapses into a plain
  copy). Rejected: staying at `claude-plugins/` to avoid touching entry
  `source` values — the owner chose the shorter path and accepted the
  consequence that every plugin's marketplace entry changes. Based on:
  `src/build.mjs:350`, `src/build.mjs:368-372`, `src/build.mjs:379-387`.
- **The release gate derives each plugin's root from the marketplace entry's
  `source`, never from a hardcoded prefix**: `inspectMarketplace` reads
  `.claude-plugin/marketplace.json` only, requires each entry's `source` to be
  a relative path that resolves strictly inside the marketplace root
  (rejecting absolute paths, `..` escapes, and non-string sources), and reads
  the manifest and digests the tree at that resolved path. The fingerprint
  stays entry + tree digest. Every Codex read — the `.agents/` index, the
  `plugins/` directory enumeration, `.codex-plugin/plugin.json`, the Codex
  half of the fingerprint — is removed. Rejected: hardcoding `./plugins/<name>`
  — the published snapshot (fresh clone verified during exploration:
  `BUILD_INFO.builderVersion` 0.21.0, `sourceRevision` 825bade) still says
  `./claude-plugins/<name>`, so a hardcoded gate rejects its own first release;
  also rejected: a one-off tolerance for the old prefix — a transitional
  special case that would outlive the transition. Based on:
  `src/check-release.mjs:104-160`, published `.claude-plugin/marketplace.json`.
- **Every plugin gets a strictly greater version**: `dev` (0.15.0), `commit`
  (0.3.0), `arch` (0.3.1), `coflux` (0.2.0) each bump — patch is sufficient,
  the exact number is the executor's call. Rejected: bumping only `dev` — the
  `source` path change alters every plugin's marketplace entry, which is part
  of the gate fingerprint, so the gate would reject the release. `npm version`
  (the builder release version) is not run here; the owner runs it at release
  time. Based on: `src/check-release.mjs:151-160` (entry is fingerprinted),
  `AGENTS.md:129-138`.
- **Maintainer docs describe the single-target compiler as it actually is**:
  `README.md` loses its "Target-specific skill content" target-block section
  and dual-bundle phrasing but keeps the fragments/include documentation with
  a surviving fragment as its example; `AGENTS.md` loses every Codex mention,
  the dual-bundle layout tree, and — because the paragraph is being rewritten
  anyway — the stale MCP description (`mcpServers` descriptor, `mcp/` tree,
  `.mcp.json` rendering) and the MCP items under "Definition of done", which
  describe code removed in commit `5d92aa5`. `MARKET_README.md` loses the
  `## Codex` section. `docs/dev.md` and `docs/coflux.md` drop the
  "(Claude Code only …)" contrasts in favour of plain statements. Rejected:
  leaving the MCP paragraph because it is not about Codex — it describes
  nothing in the tree and its Codex half must go regardless. Based on:
  `README.md:34-71`, `AGENTS.md:11,21,25,44-75,77-97,106-113,136,163,232`,
  `MARKET_README.md:19-31`, `docs/dev.md:63`, `docs/coflux.md:10`,
  `git log -S mcpServers -- src/build.mjs`.
- **Tests are rewritten to the single target and gain one gate test**: every
  assertion about `.agents/`, `plugins/<name>` as the Codex bundle,
  `.codex-plugin/`, `renderTargetMarkdown`, or the deleted fragment goes; the
  target-block rendering test becomes "a leftover target marker fails the
  build"; the "directives inside fragments" test uses a fragment fixture that
  still exists or one the test creates. A new gate test proves `checkRelease`
  accepts a current snapshot whose entries say `./claude-plugins/<name>`
  against a next build whose entries say `./plugins/<name>` when versions are
  strictly greater, and rejects a `source` that escapes the root. Rejected:
  trusting the manual clone-and-check command alone for the layout transition
  — it runs once at release; the test guards the invariant permanently.
  Based on: `test/build.test.mjs:106,197,245,262,297,338,384,473,512`.

## Direction

One serial change to the compiler, the gate, the catalog, the skill sources,
the tests, and the docs. The order below keeps the tree green at each
milestone boundary when executing serially; nothing here prescribes edits.

### Milestone 1: the compiler and catalog are single-target

`npm run build` emits `dist/plugins/<name>/` with `.claude-plugin/plugin.json`,
copies `hooks/` and `agents/` when present, writes a single
`dist/.claude-plugin/marketplace.json` with `source: ./plugins/<name>`, and
emits nothing under `dist/.agents/`, `dist/claude-plugins/`, or any
`.codex-plugin/`. Descriptors are reshaped per Decisions; validation rejects
a missing top-level `category`. Skill Markdown is copied with fragment
expansion only, and a leftover target marker fails the build. Skill sources
and the codex fragment are cleaned per Decisions. Every plugin version is
bumped. Validation: `npm run build` -> exit 0;
`test ! -e dist/.agents && test ! -e dist/claude-plugins && test -f dist/plugins/dev/.claude-plugin/plugin.json && test -d dist/plugins/coflux/hooks && test -d dist/plugins/dev/agents` -> exit 0;
`grep -rlE '<!-- /?(claude|codex) -->' dist/plugins` -> no output.

### Milestone 2: the release gate reads the Claude index only and resolves roots from `source`

`checkRelease` inspects `.claude-plugin/marketplace.json`, resolves each
plugin root from the entry's `source` inside the root, and compares
fingerprints of entry + tree. It accepts the published snapshot as
`--current` against the new `dist/` as `--next`. Validation:
`git clone --depth 1 https://github.com/myWsq/plugins.git /tmp/published && npm run check:release -- --current /tmp/published --next dist` -> exit 0,
"Release check passed for 4 plugin(s)".

### Milestone 3: tests cover the single-target build and the layout transition

The suite is rewritten per Decisions, including the new gate test.
Validation: `npm test` -> exit 0, no test references `.agents`,
`.codex-plugin`, `renderTargetMarkdown`, or `codex-request-user-input`.

### Milestone 4: maintainer and marketplace docs match the code

`README.md`, `AGENTS.md`, `MARKET_README.md`, `docs/dev.md`, `docs/coflux.md`
are rewritten per Decisions. Validation:
`grep -rniE 'codex' --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=wiki --exclude-dir=plans .`
-> exactly two hits, both listed under Scope as kept;
`grep -niE 'mcp' AGENTS.md README.md` -> no output.

## Landmines

- The published snapshot at `myWsq/plugins@main` contains `.agents/` and
  `plugins/<name>` (Codex bundles) alongside `claude-plugins/`. A gate that
  enumerates a fixed `plugins/` directory and compares names to the index
  would pass on the old snapshot by coincidence — the Codex directories share
  the plugin names — while checking the wrong trees. Resolve from `source`.
- Removing a lone `<!-- codex -->` block that sits between two blank lines
  (`plugins/dev/skills/dev-explore/SKILL.md:9-13`,
  `plugins/dev/skills/dev-write-plan/SKILL.md:11-15`,
  `plugins/dev/skills/dev-execute-plan/SKILL.md:11-15`) leaves a double blank
  line; the Claude rendering already had it. Collapse it — byte-identity is
  not a goal here.
- `plugins/dev/skills/dev-advisor/SKILL.md:13-108`: the `<!-- claude -->`
  block wraps the whole body; unwrap, do not delete.
- `test/build.test.mjs:130-137` reads
  `plugins/dev/fragments/codex-request-user-input.md` directly and
  `test/build.test.mjs:384-396` writes into it; both go with the fragment.
- `README.md:66` uses `codex-request-user-input` as the include example; the
  surviving fragment is `commit-flow`.
- `test/build.test.mjs:473-510` bumps versions by editing
  `.codex-plugin/plugin.json` in the fixture; after the change only the Claude
  manifest and the index entry exist to edit.
- `AGENTS.md` uses the word "target" both for Codex/Claude targets and for the
  sync target repository (`AGENTS.md:38-40,196-207,217-219`); only the former
  meaning goes.

## Scope

In scope:
- `src/build.mjs`
- `src/check-release.mjs`
- `test/build.test.mjs`
- `catalog/marketplace.json`
- `catalog/plugins/dev.json`, `catalog/plugins/commit.json`,
  `catalog/plugins/arch.json`, `catalog/plugins/coflux.json`
- `plugins/dev/skills/dev-explore/SKILL.md`,
  `plugins/dev/skills/dev-write-plan/SKILL.md`,
  `plugins/dev/skills/dev-execute-plan/SKILL.md`,
  `plugins/dev/skills/dev-advisor/SKILL.md`
- `plugins/dev/fragments/codex-request-user-input.md` (deleted)
- `README.md`, `AGENTS.md`, `MARKET_README.md`, `docs/dev.md`, `docs/coflux.md`
- `wiki/plans/README.md` (status only)

Out of scope:
- `plugins/dev/skills/dev-execute-plan/SKILL.md:46`, the clause treating a
  legacy bare `codex` execution value as `subagent` — a legacy plan-file
  value, not Codex host support; the owner confirmed keeping it. The file is
  in scope only for its lines 12-14.
- `plugins/coflux/skills/coflux/SKILL.md:9` "Claude Code / Codex sessions" —
  describes the external coflux daemon, not this builder.
- `plugins/arch/skills/arch-monorepo/SKILL.md`, `docs/arch.md`,
  `catalog/plugins/arch.json` `longDescription` mentions of `.agents/skills/`
  — the arch skill's own repository-layout opinion. (`arch.json` is in scope
  for the schema reshape and version bump only; the `longDescription` field
  is deleted along with the others, which removes that mention as a side
  effect, not as a goal.)
- `wiki/plans/*.md` other than this plan and the index, `plans/` — archives.
- `.github/workflows/*` — no Codex references.
- `src/check-tag.mjs`, `src/sync-release.mjs`, `package.json` — untouched;
  `npm version` is the owner's release step.
- `dist/` — gitignored, rebuilt.

## Commands

| Purpose | Command | Expected result |
| --- | --- | --- |
| Unit tests | `npm test` | exit 0 |
| Build | `npm run build` | exit 0 |
| Verify (tests + real build) | `npm run verify` | exit 0 |
| Output layout | `test ! -e dist/.agents && test ! -e dist/claude-plugins && test -f dist/plugins/dev/.claude-plugin/plugin.json && test -d dist/plugins/coflux/hooks && test -d dist/plugins/dev/agents` | exit 0 |
| No markers shipped | `grep -rlE '<!-- /?(claude\|codex) -->' dist/plugins` | no output, exit 1 |
| Codex residue | `grep -rniE 'codex' --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=wiki --exclude-dir=plans .` | exactly `plugins/coflux/skills/coflux/SKILL.md:9` and `plugins/dev/skills/dev-execute-plan/SKILL.md:46` |
| Stale MCP docs | `grep -niE 'mcp' AGENTS.md README.md` | no output, exit 1 |
| Gate vs published (acceptance) | `rm -rf /tmp/published && git clone --depth 1 https://github.com/myWsq/plugins.git /tmp/published && npm run check:release -- --current /tmp/published --next dist` | exit 0, "Release check passed for 4 plugin(s)" |

## Done criteria

- [ ] All listed commands pass.
- [ ] `dist/` contains one bundle per plugin at `dist/plugins/<name>/` and one index at `dist/.claude-plugin/marketplace.json` with `source: ./plugins/<name>`; nothing under `dist/.agents/`, `dist/claude-plugins/`, or any `.codex-plugin/`.
- [ ] `catalog/plugins/*.json` carry top-level `category` and none of `targets`, `displayName`, `shortDescription`, `longDescription`, `capabilities`, `defaultPrompt`, `brandColor`; `catalog/marketplace.json` has no `displayName`.
- [ ] A skill Markdown file containing `<!-- codex -->` fails `npm run build` with the source path in the error.
- [ ] `checkRelease` accepts the published snapshot (`./claude-plugins/<name>` entries) as current against the new layout as next, and a test asserts this.
- [ ] All four plugin versions are strictly greater than 0.15.0 / 0.3.0 / 0.3.1 / 0.2.0 respectively.
- [ ] Required tests exist and assert meaningful behavior.
- [ ] Implementation follows every entry in Decisions & tradeoffs.
- [ ] No out-of-scope files changed.
- [ ] `wiki/plans/README.md` status is updated.

## STOP conditions

- A fact cited under Decisions & tradeoffs no longer holds.
- The outcome requires out-of-scope files.
- A validation command fails twice after one reasonable fix.
- The published snapshot's `.claude-plugin/marketplace.json` no longer matches the shape observed at planning (entries with string `source`, `version`, `name`), or the clone fails — the acceptance check cannot run; report rather than guess.
- A named assumption is false.

## Maintenance notes

- The gate's `source`-resolution is the only thing that makes layout moves
  safe; if the bundle directory ever moves again, bump every plugin version
  and rely on the gate, do not add path special-cases.
- With one target, "a plugin version bump is required" now means: any change
  under `plugins/<name>/`, the descriptor fields the manifest or index
  consumes, or the entry's `source`. Docs and `MARKET_README.md` remain
  outside the contract.
- The next `npm version` after this plan publishes the removal; the first
  release replaces the Codex directories in `myWsq/plugins` because
  `sync-release.mjs` wipes everything outside `.git/`.
