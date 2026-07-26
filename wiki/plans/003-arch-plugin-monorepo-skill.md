# Plan 003: arch plugin ships arch-monorepo; dev retires dev-setup

> This plan is an outcome contract, not a step-by-step script. Understand the
> requirement and the recorded decisions, then design the implementation
> yourself against the live code. Run milestone validations as you go only if
> you are also the verifier — a delegated executor implements only, and
> verification happens outside its session. Stop on any STOP condition. When
> complete, update this plan in `wiki/plans/README.md`.
>
> Drift check: `git diff --stat 5426c51..HEAD -- plugins catalog docs MARKET_README.md`

## Status

- Priority: P2
- Effort: M
- Risk: LOW
- Depends on: none
- Category: feature
- Execution: self
- Planned at: `5426c51`, 2026-07-26

## Requirement

The marketplace gains a new native plugin `arch` — the owner's technology-selection
knowledge base, one skill per domain, growing over time (`arch-web`, `arch-server`
later). Its first skill `arch-monorepo` merges two bodies of knowledge into one
document: the repository baseline previously carried by `dev-setup`, and the owner's
monorepo decision framework captured in the 2026-07-26 interview (recorded verbatim
under Decisions & tradeoffs).

At the same time `dev-setup` is removed from the `dev` plugin: its skill directory is
deleted, and every reference to it in the dev plugin's catalog metadata and
marketplace docs is rewritten so the dev plugin describes only the
explore → plan → execute chain.

Done means: both generated bundles contain the `arch` plugin with `arch-monorepo`,
neither contains `dev-setup`, no stale reference to `dev-setup` survives outside
`wiki/plans/`, and `npm run verify` passes. A correct solution preserves the meaning
of the migrated baseline content; an adjacent wrong one would keep `dev-setup`
alongside the new skill, or turn the decision framework into a rigid scaffold script
that re-litigates settled choices.

## Decisions & tradeoffs

- **Plugin placement**: new native plugin `arch` in this repository. Rejected:
  adding skills to `dev` — dev is workflow-scoped and its provenance metadata points
  at an archived upstream; one plugin per domain — catalog/version overhead ×N for a
  personal knowledge base. Based on: `commit` is precedent for a native plugin with
  no `origin` block (`catalog/plugins/commit.json`).
- **Skill shape**: a single skill `arch-monorepo` containing both the repo baseline
  and the monorepo decision framework. Rejected: separate `arch-setup` +
  `arch-monorepo` — user explicitly chose the merged single skill and this name.
- **Content stance**: decision framework, not a fixed prescription — the skill
  records *how to choose* and the reasoning, so the agent can apply judgment; the
  baseline portion stays executable (audit / create / migrate behavior as in the old
  `dev-setup` "New project" / "Existing project" sections,
  `plugins/dev/skills/dev-setup/SKILL.md:26-41`).
- **Framework content (settled by interview, do not re-derive)**:
  - Default to monorepo. Independent projects/contexts consolidate into one
    repository so agents maintain them without context switching. No known
    exceptions yet — the skill says exceptions will be recorded when first
    encountered, and must not invent exception lists.
  - Toolchain: pnpm + turborepo. Rejected: nx and friends — nothing unsupported by
    the default pick, no alternative has proven better in use.
  - Layout: `packages/` holds dependable packages — published or internal, the
    boundary expressed by `package.json` `private`, not by directory; `apps/` holds
    applications (web, mobile, …). Rejected: a third top-level dir for internal
    packages — needless concept.
  - Versioning: changesets in fixed mode — every package in the repo shares one
    version number. Rejected: independent versions; manual version scripts.
  - Baseline (migrated from `dev-setup`, meaning preserved): README.md for humans,
    AGENTS.md for agents, CLAUDE.md as a one-line pointer, `wiki/` knowledge base,
    MIT LICENSE, stack-matched `.gitignore`, oxfmt + oxlint with `fmt`/`lint`
    scripts for TypeScript projects.
  - New baseline item: `.agents/skills/` is the real directory for project-local
    skills; `.claude/skills` is a symlink to it — same source-vs-entry logic as
    AGENTS.md vs CLAUDE.md. This instructs *user projects*; plugin **source** in
    this repo must still contain zero symlinks (AGENTS.md "Plugin source must
    contain real files, not symlinks").
- **dev-setup removal**: delete `plugins/dev/skills/dev-setup/` entirely and rewrite
  dev's self-description — `catalog/plugins/dev.json` `description`,
  `longDescription`, `defaultPrompt[0]`, and `docs/dev.md` (intro, skills table row,
  example prompts) all currently name dev-setup. `MARKET_README.md`'s dev line
  ("Project setup and plan-driven…") also needs the setup wording dropped.
- **dev version bump**: `0.3.0` → `0.4.0`. Payload changes with an unchanged version
  fail the release gate (AGENTS.md "Version and tag contract"). Rejected: patch —
  a removed skill is a feature-level change by this repo's own history (minor bumps
  for skill additions, `git log`).
- **Drop dev's `origin` block** *(decided while planning)*: upstream
  `myWsq/dev-skills` is archived ("archive notice — moved to myWsq/plugins-builder",
  commit `84a0489` there) and never contained dev-setup; after this change its
  `workingTreePatchSha256` would assert a false provenance. `origin` is optional
  metadata: `commit.json` has none and `src/build.mjs` never reads it.
- **arch catalog descriptor**: `catalog/plugins/arch.json` version `0.1.0`, no
  `mcpServers`, no `origin`; `targets` mirror `commit.json` (claude category
  `development`; codex category `Developer Tools`, policy AVAILABLE +
  ON_INSTALL). Marketplace entry appended at the end of
  `catalog/marketplace.json.plugins`. Keywords/descriptions must present arch as a
  technology-selection knowledge base, not a workflow.
- **Skill trigger surface**: `arch-monorepo`'s frontmatter `description` must cover
  both entry paths — project setup/alignment ("set up this project", "初始化项目")
  and selection questions ("该不该用 monorepo", "monorepo 选型") — following the
  trigger-phrase style of the old dev-setup description
  (`plugins/dev/skills/dev-setup/SKILL.md:3`).
- **Plan numbering**: `wiki/plans/` starts at 003 to continue (not collide with) the
  legacy root `plans/` series (001–002, both DONE). Root `plans/` stays untouched.

## Direction

The compiler already handles everything this plan needs (skills are rendered from
`plugins/<name>/skills/`, docs copied verbatim); no `src/` or `test/` changes are
expected. Work is content + catalog only.

### Milestone 1: arch plugin exists and builds

`plugins/arch/skills/arch-monorepo/SKILL.md` written from the settled decisions,
`catalog/plugins/arch.json` added, `arch` appended to `catalog/marketplace.json`.
Validation: `npm run verify` → exit 0; `dist/claude-plugins/arch/skills/arch-monorepo/SKILL.md`
and `dist/plugins/arch/skills/arch-monorepo/SKILL.md` both exist.

### Milestone 2: dev-setup retired

`plugins/dev/skills/dev-setup/` deleted; `catalog/plugins/dev.json` reworded, bumped
to 0.4.0, `origin` removed; `docs/dev.md` rewritten around the three-skill chain.
Validation: `npm run verify` → exit 0; `grep -rn "dev-setup" catalog docs plugins MARKET_README.md README.md` → no matches.

### Milestone 3: marketplace docs cover arch

`docs/arch.md` added (structure mirroring `docs/commit.md`/`docs/dev.md`: intro,
skills table, example prompts); `MARKET_README.md` plugin list updated (dev line
reworded, arch line added).
Validation: `npm run verify` → exit 0; `dist/docs/arch.md` and updated
`dist/README.md` present.

## Landmines

- Release gate compares published vs candidate bundles: changed dev payload with an
  unchanged version is a hard failure — the 0.4.0 bump is not optional
  (AGENTS.md "Version and tag contract").
- `test/build.test.mjs:105` snapshots `plugins/dev/skills` dynamically and compares
  with output — deleting dev-setup needs no test edits, but any leftover file in the
  skill directory would ship; delete the whole directory.
- Catalog name, descriptor `name`, and directory name must match exactly
  (AGENTS.md "Adding or updating a plugin", step 1); a mismatch is a build error.
- `dist/` is generated and git-ignored — never hand-edit it to make a check pass.

## Scope

In scope:

- `plugins/arch/**` (new)
- `plugins/dev/skills/dev-setup/` (delete)
- `catalog/plugins/arch.json` (new), `catalog/plugins/dev.json`, `catalog/marketplace.json`
- `docs/arch.md` (new), `docs/dev.md`, `MARKET_README.md`
- `wiki/plans/**` (this plan and its index)

Out of scope:

- `src/`, `test/` — no compiler or test behavior changes; if one turns out to be
  required, that is a STOP.
- Root `plans/` — legacy plan archive, migration is a separate decision.
- `package.json` version, tags, pushing, releasing — release preparation is
  user-initiated (AGENTS.md release flow).
- Upstream `myWsq/dev-skills` — archived; not touched.
- Future skills `arch-web`, `arch-server` — separate interviews, separate plans.

## Commands

| Purpose | Command | Expected result |
| --- | --- | --- |
| Tests | `npm test` | exit 0 |
| Full verify (tests + real catalog build) | `npm run verify` | exit 0 |
| Stale-reference check | `grep -rn "dev-setup" catalog docs plugins MARKET_README.md README.md` | no matches |

## Done criteria

- [ ] All listed commands pass.
- [ ] Both `dist/claude-plugins/arch/` and `dist/plugins/arch/` contain
      `skills/arch-monorepo/SKILL.md`; neither target contains a `dev-setup` skill.
- [ ] `arch-monorepo` SKILL.md carries every settled framework decision (default-to-
      monorepo rationale, pnpm+turborepo, packages/apps with `private` boundary,
      changesets fixed, full baseline, `.agents/skills` real + `.claude/skills`
      symlink) without inventing exceptions or extra tooling choices.
- [ ] `catalog/plugins/dev.json` is version 0.4.0, has no `origin` block, and no
      longer mentions setup; `catalog/plugins/arch.json` is 0.1.0.
- [ ] Implementation follows every entry in Decisions & tradeoffs.
- [ ] No out-of-scope files changed.
- [ ] `wiki/plans/README.md` status is updated.

## STOP conditions

- A fact cited under Decisions & tradeoffs no longer holds.
- The outcome requires out-of-scope files (notably `src/` or `test/`).
- A validation command fails twice after one reasonable fix.
- The release-gate test rejects the dev change for a reason other than the version
  bump handled here.

## Execution notes

- **Reported deviation**: `test/build.test.mjs` (out of scope) hardcoded the live
  dev version twice — `"0.3.0"` as the expected marketplace version and `"0.3.1"`
  as the release-gate bump fixture — so the 0.4.0 bump broke both. Fixed minimally,
  preserving each test's semantics: the expectation now reads the version from
  `catalog/plugins/dev.json`, and the fixture uses an always-greater `"999.0.0"`.
  Any future plugin version bump would have hit the same wall.

## Maintenance notes

- `arch` is the sedimentation point for future selection frameworks: one skill per
  domain, content produced by interview, exceptions added only when actually
  encountered. Keep the framework/prescription boundary — settled defaults are
  stated as defaults with reasons, not as inviolable rules.
- Anyone re-adding provenance to dev.json should first check whether
  `myWsq/dev-skills` is still archived.
- The legacy root `plans/` (001–002) predates `wiki/plans/`; migrating it is an
  open follow-up, ideally by running the new arch-monorepo skill against this repo.
