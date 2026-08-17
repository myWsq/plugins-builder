# Plan 010: Fold the subagent-model plugin into dev

> This plan is an outcome contract, not a step-by-step script. Understand the
> requirement and the recorded decisions, then design the implementation
> yourself against the live code. Run milestone validations as you go only if
> you are also the verifier — a delegated executor implements only, and
> verification happens outside its session. Stop on any STOP condition. When
> complete, update this plan in `wiki/plans/README.md`.
>
> Drift check: `git diff --stat 3ad0c13..HEAD -- plugins/subagent-model plugins/dev catalog docs MARKET_README.md test/build.test.mjs`

## Status

- Priority: P2
- Effort: S
- Risk: LOW
- Depends on: none
- Category: refactor
- Execution: subagent dev:grok-executor
- Planned at: `3ad0c13`, 2026-08-18

## Requirement

`subagent-model` is the smallest plugin in the marketplace: one 20-line
SessionStart-injected rule plus one skill restating it, carrying a full
plugin's overhead (catalog entry, marketplace listing, doc page, independent
version). Its subject — choosing a model tier when delegating to subagents —
belongs to `dev`, the delegation plugin.

Once done: the marketplace ships 4 plugins instead of 5. `dev` 0.8.0 carries
the SessionStart hook and the `subagent-model` skill with identical content;
`plugins/subagent-model/`, `catalog/plugins/subagent-model.json`,
`docs/subagent-model.md`, the `marketplace.json` list entry, and the
`MARKET_README.md` line are all gone; `npm run verify` passes.

A correct solution is a pure relocation: the rule text and hook behavior are
byte-identical after the move. An adjacent wrong one rewrites the rule,
renames the skill, or leaves a dangling reference to the deleted plugin.

## Decisions & tradeoffs

- **Home**: fold into `dev`. Rejected: keep standalone — the granularity is
  wrong, one rule is not a plugin; rejected: `arch` — arch is
  technology-selection, consult-only, no hooks; rejected: demote to global
  CLAUDE.md — loses the marketplace's versioning and distribution.
  Based on: `dev` owns delegation (`catalog/plugins/dev.json:6` — "Explore,
  plan, delegate, execute…") and the skill's Precedence section already
  defers to dev-workflow rules
  (`plugins/subagent-model/skills/subagent-model/SKILL.md:39-45`).
- **Skill name**: keep `subagent-model`, becoming `dev:subagent-model`.
  Rejected: `dev-subagent-model` — the `dev-*` prefix marks the three
  workflow-phase skills; this is a cross-cutting framework, not a phase, and
  renaming breaks the established "Use subagent-model…" prompt wording.
- **Content is frozen**: `hooks/hooks.json`, `hooks/rules.md`, and `SKILL.md`
  move byte-identical. Rejected: editing the rule text during the move — this
  plan is a relocation; content changes are separate work.
  Note: `hooks.json` references its payload via
  `${CLAUDE_PLUGIN_ROOT}/hooks/rules.md`
  (`plugins/subagent-model/hooks/hooks.json:9`), which is plugin-root
  relative, so the move needs no content edit.
- **Test fixture retarget**: the two hook-compilation tests keep their
  assertions but point at `dev`: the ships-to-Claude-only test
  (`test/build.test.mjs:230-239`) and the invalid-hooks.json test
  (`test/build.test.mjs:262`). Rejected: pointing them at `coflux` — dev is
  the plugin this plan gives hooks, and its bundle also exercises hooks
  coexisting with `agents/` and `fragments/`.
- **dev catalog metadata** (decided while planning): version `0.8.0`;
  `capabilities` gains `"Hooks"`; `longDescription` mentions the fourth skill
  and the SessionStart hook; `defaultPrompt` gains the subagent-model prompts
  from `catalog/plugins/subagent-model.json:29-31`; merge meaningful keywords
  (e.g. `model-selection`). Exact wording is the executor's call.
  *Deviation during execution*: the compiler caps `defaultPrompt` at 3
  entries (`src/build.mjs`, `validatePluginDescriptor`), a constraint
  exploration missed — the two subagent-model prompts were dropped from
  `defaultPrompt` and remain as examples in `docs/dev.md` only.
- **Docs** (decided while planning): fold `docs/subagent-model.md`'s rule
  table and component description into `docs/dev.md` as a section (a fourth
  row in its Skills table plus a short hook note fits its structure); delete
  the standalone doc; drop the `subagent-model` line from
  `MARKET_README.md:10` and from the `plugins` array in
  `catalog/marketplace.json:14`.

## Direction

### Milestone 1: dev carries the hook and skill; subagent-model source is gone

`plugins/dev/hooks/{hooks.json,rules.md}` and
`plugins/dev/skills/subagent-model/SKILL.md` exist with content identical to
the old plugin; `plugins/subagent-model/`, `catalog/plugins/subagent-model.json`,
and `docs/subagent-model.md` are deleted; `catalog/marketplace.json`,
`catalog/plugins/dev.json`, `docs/dev.md`, and `MARKET_README.md` are updated
per the decisions. Validation: `npm run build` -> exit 0, and
`dist/claude-plugins/subagent-model` does not exist while
`dist/claude-plugins/dev/hooks/rules.md` does.

### Milestone 2: tests assert the new layout

`test/build.test.mjs` hook tests target `plugins/dev/hooks`. Validation:
`npm test` -> exit 0.

## Landmines

- `dist/` is git-ignored generated output; never edit it by hand — the build
  recreates it from scratch (`AGENTS.md`, "Generated content").
- Hooks are a per-plugin directory convention: `hooks/hooks.json` must exist
  and parse as JSON or the build fails (`test/build.test.mjs:258-275`), and
  the tree ships to the Claude bundle only — the Codex bundle must NOT
  contain `hooks/` (`test/build.test.mjs:237-239` asserts ENOENT).
- The Codex-bundle skill is expected: the old plugin already shipped its
  skill to both targets, so `dist/plugins/dev/skills/subagent-model/`
  appearing is correct, not a leak.

## Scope

In scope:

- `plugins/dev/hooks/` (new), `plugins/dev/skills/subagent-model/` (new)
- `plugins/subagent-model/` (delete)
- `catalog/plugins/dev.json`, `catalog/plugins/subagent-model.json` (delete),
  `catalog/marketplace.json`
- `docs/dev.md`, `docs/subagent-model.md` (delete), `MARKET_README.md`
- `test/build.test.mjs`
- `wiki/plans/README.md`, `wiki/plans/010-merge-subagent-model-into-dev.md`

Out of scope:

- `src/` — the compiler already supports per-plugin hooks; no references to
  the plugin name exist there.
- Content of the three existing dev skills and the moved rule/skill text —
  pure relocation, no rewording.
- Other plugins, `dist/`, release workflow files.

## Commands

| Purpose | Command | Expected result |
| --- | --- | --- |
| Unit tests | `npm test` | exit 0 |
| Build | `npm run build` | exit 0 |
| Full gate (acceptance) | `npm run verify` | exit 0 |

## Done criteria

- [ ] All listed commands pass.
- [ ] `plugins/subagent-model/` and its catalog entry, doc page, marketplace
      list entry, and MARKET_README line no longer exist; no
      `subagent-model` reference remains outside `plugins/dev/`, `docs/dev.md`,
      `test/build.test.mjs`, and `wiki/`.
- [ ] `hooks/rules.md`, `hooks/hooks.json`, and the skill body are
      byte-identical to their pre-move content.
- [ ] `catalog/plugins/dev.json` version is `0.8.0`.
- [ ] Implementation follows every entry in Decisions & tradeoffs.
- [ ] No out-of-scope files changed.
- [ ] `wiki/plans/README.md` status is updated.

## STOP conditions

- A fact cited under Decisions & tradeoffs no longer holds.
- The outcome requires out-of-scope files.
- A validation command fails twice after one reasonable fix.
- The build rejects a `dev` bundle carrying `hooks/` alongside `agents/` and
  `fragments/` — that would mean the compiler has a constraint exploration
  did not surface.

## Maintenance notes

- `dev` now owns an always-on SessionStart injection. Anyone installing `dev`
  for the workflow skills also gets the model-tiering rule in every session;
  if that coupling ever needs to be optional, that is a new decision, not a
  regression of this one.
- The rule text lives in two places by design: `hooks/rules.md` (compressed,
  injected) and `skills/subagent-model/SKILL.md` (full framework with
  reasons). Edit both when the rule changes.
