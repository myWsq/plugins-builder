# Plan 008: Remove the dev-agents MCP broker — subagent becomes the only delegation channel

> This plan is an outcome contract, not a step-by-step script. Understand the
> requirement and the recorded decisions, then design the implementation
> yourself against the live code. Run milestone validations as you go only if
> you are also the verifier — a delegated executor implements only, and
> verification happens outside its session. Stop on any STOP condition. When
> complete, update this plan in `wiki/plans/README.md`.
>
> Drift check: `git diff --stat 2aa5394..HEAD -- plugins/dev src/build.mjs test catalog/plugins/dev.json docs/dev.md README.md`

## Status

- Priority: P2
- Effort: M
- Risk: MED
- Depends on: none
- Category: refactor
- Execution: self
- Planned at: `2aa5394`, 2026-08-15

## Requirement

The dev plugin ships a bundled `dev-agents` MCP server (`plugins/dev/mcp/`)
that detects and asynchronously drives local Codex, Claude Code, and Cursor
CLI executables as a "local agent delegation" execution mode. The owner has
decided this channel is not worth its weight: subagent delegation is already
the default mode, runs inside the host's permission envelope (no
`--dangerously-bypass` unattended consent needed), and gets native
monitoring/cancellation from the host — while the broker re-implements all of
that in ~900 lines plus its own test file, compiler support, and consent
protocol.

After this plan: the repository contains no MCP runtime, descriptor,
compiler support, or test for it; `dev-execute-plan` defines exactly two
execution modes — **subagent delegation (default)** and **self-execution**;
and the skills gain a short guidance section for delegating to a non-Claude
model (served through the user's `ANTHROPIC_BASE_URL` relay) via a
user-defined model-pinned executor agent. A correct solution deletes the
local-agent channel everywhere it is described, not just where it is
implemented; an adjacent wrong one leaves "agent:<id>" modes, `agents_list`
references, or MCP compiler paths behind in skills, docs, tests, or the
catalog descriptor.

## Decisions & tradeoffs

- **Full removal, not dual-track**: delete the broker outright; do not keep it
  for the Codex bundle. Rejected: keeping the broker only in the Codex bundle —
  the code, tests, and compiler support would all survive, so nothing is
  actually simplified. Based on: user's explicit direction ("不要的代码和逻辑,
  该删就删") and dev being the only MCP-using plugin
  (`catalog/plugins/dev.json:36` is the sole `mcpServers` descriptor in
  `catalog/plugins/`).
- **Delete the compiler's MCP support too**: `src/build.mjs` MCP validation and
  emission (`src/build.mjs:63-73`, `98-121`, `312-316`, `318-331`, `390-402`,
  `438` region) becomes dead code once no plugin declares `mcpServers`; remove
  it and every MCP assertion in `test/build.test.mjs` (fixture snapshots at
  `test/build.test.mjs:153-175`, manifest assertions at `196`, `201`,
  `250-251`, validation tests at `448-508`), and delete `test/mcp.test.mjs`
  entirely. Rejected: keeping generic MCP compiler capability for future
  plugins — speculative; recoverable from git history if ever needed.
- **Execution modes converge to two**: rewrite the canonical "Choose execution
  mode" section (`plugins/dev/skills/dev-execute-plan/SKILL.md:36-57`) to
  subagent (preferred) / self-execution, dropping `agents_list`-based selection
  rules, `agent:<id>` normalization, and the local-agent consent language. The
  existing no-subagent-tool fallback ("recorded mode is `subagent` but the
  host has no subagent tool → self-execute and say so", `SKILL.md:53`) is the
  accepted answer for the Codex bundle, which has no subagent mechanism —
  Codex users get self-execution only, and the plugin keeps shipping to Codex.
  Rejected: stopping the Codex bundle — explore/plan skills remain valuable
  there.
- **Non-Claude model delegation goes through a user-defined executor agent**:
  add a concise guidance note (in the canonical execution-mode section and/or
  `references/delegation.md`, executor's call) stating: the host's runtime
  subagent `model` parameter accepts only Claude alias tiers, so to delegate
  to a non-Claude model served by the user's relay, the user pre-creates a
  model-pinned executor agent file in `.claude/agents/` (frontmatter `model:`
  accepts full model IDs) and the orchestrator dispatches it by agent type;
  the departure check may enumerate such agents when the user asks. Must warn:
  an unrecognized/blocked model value **silently falls back to the inherited
  model**, so the user should verify which model actually served the run
  (e.g. relay-side logs). Rejected: plugin-shipped executor agent — frontmatter
  has no env interpolation and model names are relay-specific. Rejected:
  `CLAUDE_CODE_SUBAGENT_MODEL` — session-global, overrides every subagent.
- **Descriptor and metadata cleanup**: `catalog/plugins/dev.json` drops the
  `mcpServers` block and every MCP/local-agent claim in `description`,
  `longDescription`, `keywords`, `capabilities`, and `defaultPrompt`
  (`catalog/plugins/dev.json:5-7`, `22`, `28-29`, `34`, `36-41`); bump its
  `version` 0.4.0 → 0.5.0 in the same commit, following the convention of
  `2d6e3fd` (0.3.0 → 0.4.0 in the feature commit itself).
- **Untouched**: the `subagent-model` plugin (its tiering rule is Claude-family
  scoped; extending it is out of scope) and
  `plugins/dev/fragments/codex-request-user-input.md` (unrelated to the
  broker). The root `package.json` version stays — release bumps are separate
  commits (`2aa5394`).

## Direction

Work top-down from the descriptor so the build fails loudly until every layer
is consistent: catalog descriptor → compiler → tests → runtime files → skill
texts → docs. All prose (skills, `docs/dev.md`, `README.md`) must read as if
the local-agent channel never existed — describe the two remaining modes
positively; do not write changelog-style "no longer supports X" language into
the skills.

### Milestone 1: MCP runtime, descriptor, compiler support, and tests are gone

`plugins/dev/mcp/` deleted; `catalog/plugins/dev.json` has no `mcpServers`
and no MCP/local-agent metadata claims, version 0.5.0; `src/build.mjs` has no
MCP validation or emission; `test/mcp.test.mjs` deleted; `test/build.test.mjs`
MCP assertions removed with all non-MCP assertions intact.
Validation: `npm test` -> exit 0; `npm run build` -> exit 0 and no `.mcp.json`
or `mcp/` anywhere under `dist/`.

### Milestone 2: Skill texts describe exactly two execution modes

The canonical "Choose execution mode" section defines subagent/self only, with
selection rules that no longer reference `agents_list`, `agent:<id>`, or the
broker; the model-choice paragraph covers Claude tier aliases plus the
non-Claude executor-agent guidance with the silent-fallback warning;
`references/delegation.md` is subagent-only (prompt contract, monitoring, and
REVISE loop retained); `plugins/dev/skills/dev-explore/SKILL.md:98` departure
check item no longer promises "local agent unattended permission disclosure"
and stays consistent with the canonical section it reads.
Validation: `grep -rn "dev-agents\|agents_list\|delegate_start\|delegate_get\|delegate_cancel\|agent:<id>" plugins/` -> no matches.

### Milestone 3: Docs match reality

`docs/dev.md` rewritten where it describes execution modes and the broker
(`docs/dev.md:5`, `32`, `43-55`); `README.md` source-layout row and the MCP
compiler paragraph removed/rewritten (`README.md:27`, `34-38`).
Validation: `npm run verify` -> exit 0; `grep -rn "mcp\|broker\|local agent" README.md docs/dev.md -i` -> no hits describing the dev plugin's delegation (target-platform prose unrelated to delegation may remain if any).

## Landmines

- `test/build.test.mjs` uses `plugins/dev/mcp` as the live fixture for generic
  MCP compiler behavior (`test/build.test.mjs:153-175`, `502-508`); those tests
  cannot be adapted — they must be deleted with the feature. Take care to
  remove only MCP-scoped assertions: e.g. `test/build.test.mjs:196` and
  `:250-251` assert MCP *absence* inside broader tests that must survive.
- `dist/` is gitignored (`.gitignore:1`) and rebuilt from scratch — never edit
  or commit it; stale local `dist/` content is not evidence of a bug.
- `plugins/dev/skills/dev-explore/SKILL.md` and `dev-write-plan/SKILL.md` refer
  to the canonical section *by its heading name* ("Choose execution mode") —
  keep that heading text unchanged or update every referrer.
- The user's installed plugin cache (`~/.claude/plugins/cache/plugins/dev/0.4.0`)
  is a deployment artifact, not repo source — out of scope, do not touch.
- Target-block rendering: skill markdown may contain `<!-- codex -->` blocks
  (see `README.md` "Target-specific skill content"); when editing skill prose,
  check whether the edited sections carry target blocks and keep both bundles
  coherent.

## Scope

In scope:

- `plugins/dev/mcp/` (delete)
- `catalog/plugins/dev.json`
- `src/build.mjs`
- `test/mcp.test.mjs` (delete), `test/build.test.mjs`
- `plugins/dev/skills/dev-execute-plan/SKILL.md`
- `plugins/dev/skills/dev-execute-plan/references/delegation.md`
- `plugins/dev/skills/dev-explore/SKILL.md`
- `plugins/dev/skills/dev-write-plan/SKILL.md` (only if it references execution modes/local agents)
- `docs/dev.md`, `README.md`
- `wiki/plans/README.md` (status update)

Out of scope:

- `plugins/subagent-model/`, `docs/subagent-model.md` — separate plugin, tiering rule unchanged
- `plugins/dev/fragments/` — unrelated to the broker
- `dist/` — generated, gitignored
- `package.json` version — release commits are separate
- Any other plugin or `src/` file beyond `build.mjs`

## Commands

| Purpose | Command | Expected result |
| --- | --- | --- |
| Unit tests | `npm test` | exit 0 |
| Build | `npm run build` | exit 0 |
| Full verify | `npm run verify` | exit 0 |

## Done criteria

- [ ] All listed commands pass.
- [ ] `grep -rin "dev-agents\|agents_list\|delegate_start\|mcpServers" plugins/ src/ test/ catalog/ docs/ README.md` returns no matches.
- [ ] `dist/` after a fresh build contains no `.mcp.json` and no `mcp/` directory.
- [ ] The canonical "Choose execution mode" section defines exactly two modes and includes the non-Claude executor-agent guidance with the silent-fallback warning.
- [ ] `catalog/plugins/dev.json` version is 0.5.0 and its metadata makes no MCP/local-agent claims.
- [ ] Implementation follows every entry in Decisions & tradeoffs.
- [ ] No out-of-scope files changed.
- [ ] `wiki/plans/README.md` status is updated.

## STOP conditions

- A fact cited under Decisions & tradeoffs no longer holds.
- The outcome requires out-of-scope files.
- A validation command fails twice after one reasonable fix.
- Another plugin or build path turns out to depend on the MCP compiler support.

## Maintenance notes

- If a future plugin needs MCP, recover the compiler support from git history
  (`17a332a` introduced it; this plan's commit removes it) rather than
  re-deriving it.
- The non-Claude executor-agent guidance depends on two host facts that may
  drift with Claude Code releases: the runtime subagent `model` parameter being
  alias-only, and unrecognized model values silently falling back to the
  inherited model. Re-verify both before extending that guidance.
