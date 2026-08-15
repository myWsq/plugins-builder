# Plan 009: Ship model-pinned executor agents inside the dev plugin

> This plan is an outcome contract, not a step-by-step script. Understand the
> requirement and the recorded decisions, then design the implementation
> yourself against the live code. Run milestone validations as you go only if
> you are also the verifier. Stop on any STOP condition. When complete, update
> this plan in `wiki/plans/README.md`.
>
> Drift check: `git diff --stat 85ec0de..HEAD -- plugins/dev src/build.mjs test catalog/plugins/dev.json docs/dev.md`

## Status

- Priority: P2
- Effort: S
- Risk: LOW
- Depends on: wiki/plans/008-remove-dev-agents-broker.md
- Category: feature
- Execution: self
- Planned at: `85ec0de`, 2026-08-15

## Requirement

Plan 008 left non-Claude delegation as guidance only: the user pre-creates a
model-pinned executor agent in `.claude/agents/`. The owner has reversed that
decision for this personal marketplace: since the only consumer is the owner,
relay-specific model names may be hardcoded, and shipping the executors inside
the dev plugin versions them and syncs them across machines with a normal
plugin install. This supersedes plan 008's "Rejected: plugin-shipped executor
agent" entry; its premise (unknown third-party relays) does not apply here.

After this plan: the dev plugin ships two Claude Code subagent definitions —
`gpt-executor` pinned to model `gpt-5.6-sol` and `kimi-executor` pinned to
`kimi-k3` — the compiler packages a plugin `agents/` directory into the
Claude bundle only, and the skills/docs name these executors instead of only
telling the user to create their own.

## Decisions & tradeoffs

- **Executors live in the dev plugin** (`plugins/dev/agents/*.md`), not a new
  plugin and not `~/.claude/agents/`. The delegation guidance already lives in
  dev's skills; a separate plugin adds catalog/docs ceremony for two files.
  Claude Code plugins support an `agents/` directory at plugin root (official
  plugins reference, verified 2026-08-15).
- **Exactly two executors, fixed prompt**: `gpt-executor` → `gpt-5.6-sol`,
  `kimi-executor` → `kimi-k3` (owner-named relay model IDs). Shared minimal
  executor system prompt; the real contract arrives in each dispatch prompt
  (see `references/delegation.md`), so the agent body must not duplicate it.
- **Auto-routing guard**: each agent's `description` must state it is used
  only when explicitly dispatched, so Claude Code does not auto-delegate
  routine work to a relay model.
- **Claude bundle only**, following the hooks precedent (`src/build.mjs`
  copies `hooks/` to the Claude bundle only; Codex has no subagent mechanism).
  Compiler support is a plain directory copy — no schema validation beyond the
  existing `assertPortableTree`; the frontmatter contract is Claude Code's,
  not the builder's.
- **Version bump** `catalog/plugins/dev.json` 0.5.0 → 0.6.0 in the same
  commit (convention: plan 008, `2d6e3fd`).
- **Skill/doc wording**: the model-choice paragraph in
  `plugins/dev/skills/dev-execute-plan/SKILL.md`, `references/delegation.md`,
  and `docs/dev.md` now name the shipped executors as the ready-made route;
  a user-created `.claude/agents/` definition remains valid for other models.
  The silent-fallback warning stays.

## Direction

### Milestone 1: Executor agents exist and the compiler ships them

`plugins/dev/agents/gpt-executor.md` and `kimi-executor.md` exist with
`name`, `description`, `model` frontmatter and the shared executor body;
`src/build.mjs` copies a plugin `agents/` directory into the Claude bundle
only; `test/build.test.mjs` asserts dev's `agents/` lands in the Claude
bundle and not the Codex bundle (mirror the hooks test); dev.json is 0.6.0.
Validation: `npm test` -> exit 0; `npm run build` -> exit 0 and
`dist/claude-plugins/dev/agents/` has both files while
`dist/plugins/dev/agents` does not exist.

### Milestone 2: Skills and docs name the shipped executors

Wording updated per the decision above.
Validation: `npm run verify` -> exit 0;
`grep -rn "gpt-executor" plugins/dev/skills docs/dev.md` -> at least one hit
in each of the two skill references and docs.

## Landmines

- `copySkillTree` renders target blocks for `skills/` only; `agents/` must be
  copied verbatim (like `hooks/`), never through the markdown renderer.
- The release gate (`test/build.test.mjs` "release gate requires a plugin
  version bump for payload changes") fails if payload changes without the
  dev.json bump — keep the bump in the same change.

## Scope

In scope:

- `plugins/dev/agents/` (new)
- `src/build.mjs`
- `test/build.test.mjs`
- `catalog/plugins/dev.json`
- `plugins/dev/skills/dev-execute-plan/SKILL.md`
- `plugins/dev/skills/dev-execute-plan/references/delegation.md`
- `docs/dev.md`
- `wiki/plans/README.md` (status update)

Out of scope:

- `~/.claude/agents/` — superseded by the plugin route
- `plugins/subagent-model/`, other plugins, `README.md`
- `dist/` — generated

## Commands

| Purpose | Command | Expected result |
| --- | --- | --- |
| Unit tests | `npm test` | exit 0 |
| Build | `npm run build` | exit 0 |
| Full verify | `npm run verify` | exit 0 |

## Done criteria

- [ ] All listed commands pass.
- [ ] `dist/claude-plugins/dev/agents/` contains `gpt-executor.md` and `kimi-executor.md`; `dist/plugins/dev/agents` does not exist.
- [ ] Both agent descriptions state explicit-dispatch-only.
- [ ] `catalog/plugins/dev.json` version is 0.6.0.
- [ ] Skills and docs name the shipped executors; silent-fallback warning retained.
- [ ] No out-of-scope files changed.
- [ ] `wiki/plans/README.md` status is updated.

## STOP conditions

- A fact cited under Decisions & tradeoffs no longer holds.
- The outcome requires out-of-scope files.
- A validation command fails twice after one reasonable fix.

## Maintenance notes

- Model IDs `gpt-5.6-sol` and `kimi-k3` are relay-specific; when the relay
  renames a model, edit the agent frontmatter and bump the plugin version.
- After installing the updated plugin, verify routing once per model against
  relay-side logs — an unrecognized ID silently falls back to the inherited
  model.
