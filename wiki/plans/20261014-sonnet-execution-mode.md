# Plan 20261014-sonnet-execution-mode: dev offers subagent(sonnet) as a fourth execution mode, recommended by task difficulty

> This plan is an outcome contract, not a step-by-step script. Understand the
> requirement and the recorded decisions, then design the implementation
> yourself against the live code. Run milestone validations as you go only if
> you are also the verifier — a delegated executor implements only, and
> verification happens outside its session. Stop on any STOP condition. When
> complete, update this plan in `wiki/plans/README.md`.
>
> Drift check: `git diff --stat c4848ff..HEAD -- plugins/dev catalog/plugins/dev.json docs/dev.md`

## Status

- Priority: P2
- Effort: S
- Risk: LOW
- Depends on: none
- Category: feature
- Execution: subagent(sonnet) — departure check answer. This mode does not exist in the installed dev 0.28.0 skills; it is the mode this plan introduces, so the orchestrator dispatches the generic subagent with `model: sonnet` under the user's current explicit instruction (selection rule 1).
- Stop after: implementation — departure check (plan audit)
- Plan review: audit — departure check
- Workspace: isolated — planned from the main worktree; moved to `.claude/worktrees/20261014-sonnet-execution-mode` on `dev/20261014-sonnet-execution-mode`
- Planned at: `c4848ff`, 2026-10-14

## Requirement

The dev plugin's execution modes are exactly `subagent(opus)`, `subagent(fable)`,
and `self`. Much plan execution is mechanical — syncing enumerations, docs
edits, small well-specified changes — where the mid tier is enough and cheaper.
The owner wants a fourth mode, `subagent(sonnet)`: the host's generic subagent
dispatched with `model: sonnet`.

Product conclusions confirmed in exploration (the consumer is the user
answering the departure check or `dev:execute-plan`'s execution-mode question,
and anyone reading a plan's `Execution:` field or a run report's `Mode:`):

- The execution-mode question offers four options, ordered by tier:
  **Subagent (sonnet)**, **Subagent (opus)**, **Subagent (fable)**, **Self**.
- The recommended marker is no longer fixed on opus. The asking agent marks
  one option `(recommended)` according to the task's difficulty — sonnet for
  mechanical, well-specified work; opus for ordinary implementation needing
  judgment; fable for work that needs the top tier — and recommends opus when
  unsure. Self is never the difficulty-based recommendation (it remains the
  fallback/explicit choice as today).
- When no question was asked and no target was named (selection rule 3,
  "upstream asked to delegate but did not name a target"), the default stays
  `subagent(opus)`. Legacy-value mapping also stays `subagent(opus)`.
- Recorded values: `subagent(sonnet)` joins every enumeration of modes — the
  start contract, the plan's `Execution:` field, the report's `Mode:` line,
  and the maintainer docs.

Done when a user running `dev:explore` → departure check sees the four ordered
options with a difficulty-based recommendation, can pick sonnet, and
`dev:execute-plan` dispatches the generic subagent with `model: sonnet`.

## Decisions & tradeoffs

- **Sonnet is a tier alias of the same generic subagent, not a new agent
  type**: dispatched exactly like opus/fable, with `model: sonnet`, and the same
  unsupported-alias fallback (omit the override, host default, report it).
  Rejected: shipping an `agents/` definition for sonnet — the plugin
  deliberately ships no agents. Based on:
  `plugins/dev/skills/execute-plan/SKILL.md:40`,
  `plugins/dev/skills/execute-plan/references/delegation.md:34`,
  `docs/dev.md:81`.
- **Option order is by tier, sonnet first**: sonnet, opus, fable, self.
  Rejected: inserting sonnet after opus to keep opus first — the owner chose
  tier order. Based on: user answer at product confirmation.
- **Recommendation is difficulty-based, opus when unsure; the unasked default
  stays opus**: the `(recommended)` marker moves to whichever subagent tier the
  asking agent judges the task needs, but selection rule 3 and the legacy
  mapping keep `subagent(opus)`. Rejected: making rule 3 also judge difficulty
  — an unasked default must be predictable; rejected: making sonnet the fixed
  default — it under-serves ordinary implementation. Based on:
  `plugins/dev/skills/execute-plan/SKILL.md:46-47,54`; user answers.
- **The canonical definition stays in `dev:execute-plan`'s "Choose execution
  mode" section**: the difficulty guidance (what each tier is for, when to
  recommend which) is written there once; `dev:explore` and `dev:write-plan`
  keep reading it by name and only update their inline enumerations of mode
  values. Rejected: duplicating the recommendation rule into the departure
  check text. Based on: `plugins/dev/skills/explore/SKILL.md:99`,
  `plugins/dev/skills/write-plan/SKILL.md:31`.
- **Plan audit and the top-tier hook are untouched**: the audit still
  dispatches `fable`, and `TOP_TIER = /fable/i` still decides `top-tier`; a
  sonnet orchestrator is `top-tier: no`. Based on:
  `plugins/dev/hooks/context.mjs:18`,
  `plugins/dev/skills/write-plan/references/plan-audit.md:9`.
- **The two-strategy structure stays; "four" counts recorded answers only**
  (revised on plan audit): the canonical section's "Two modes, in default
  preference order" (delegation vs self-execution) and `docs/dev.md`'s "Two
  execution modes" table keep their two-strategy framing; sonnet is a third
  tier under delegation. "Four" applies only to the question's recorded
  answers — `docs/dev.md:81`, the start contract, the plan `Execution:` field,
  the report `Mode:` line. Rejected: restructuring into four peer modes.
  Based on: `plugins/dev/skills/execute-plan/SKILL.md:38`, `docs/dev.md:74`.
- **The asking skill applies the difficulty rule when presenting the
  question** (revised on plan audit): the canonical section's question
  definition itself says the asker — `dev:explore`/`dev:write-plan` at the
  departure check, `dev:execute-plan` under rule 4 — puts `(recommended)` on
  the tier the current task needs (opus when unsure). The options list must
  not keep a static `(recommended)` on any row. Rejected: a static marker plus
  a separate advisory paragraph. Based on:
  `plugins/dev/skills/execute-plan/SKILL.md:52-54`,
  `plugins/dev/skills/explore/SKILL.md:99`.
- **Version**: dev `0.28.0` → `0.29.0` (minor: new user-visible option). The
  builder release (`npm version`) is not part of this plan. Based on:
  `catalog/plugins/dev.json:3`, AGENTS.md version contract.

## Direction

One milestone; all edits are prose in skill sources, the shared fragment, and
maintainer docs, plus the version bump.

### Milestone 1: every enumeration of execution modes includes `subagent(sonnet)` and the question recommends by difficulty

Known enumeration sites (verify with the grep below, there may be others):

- `plugins/dev/skills/execute-plan/SKILL.md` — mode definition (~40), selection
  rules (~44-50), the execution-mode question options and record line
  (~52-58), the report template `Mode:` line (~166).
- `plugins/dev/skills/execute-plan/references/delegation.md:34`.
- `plugins/dev/fragments/start-contract.md:7` (expanded into all three skills
  at build).
- `plugins/dev/skills/explore/SKILL.md:99`.
- `plugins/dev/skills/write-plan/SKILL.md:98`.
- `docs/dev.md` — ~37, ~78, ~81 (the "exactly three answers" sentence becomes
  four).
- `catalog/plugins/dev.json` version.

Also the bare-alias enumerations: `execute-plan/SKILL.md:40` ("`opus` by
default, `fable` when the user chooses it"), `delegation.md:34`,
`docs/dev.md:37`, `docs/dev.md:78`.

Validation (the build asserts nothing about mode text, so the greps carry the
check):
- `npm run verify` → exit 0.
- `grep -rn "subagent(fable)" plugins/dev docs/dev.md` → every hit line also
  names `subagent(sonnet)`, except the fable question option itself.
- ``grep -rn '`fable`\|(fable)' plugins/dev docs/dev.md`` → every hit also
  names `sonnet`, except audit/top-tier text: `plan-audit.md:9`,
  `docs/dev.md:104`, `hooks/context.mjs:18`.
- `grep -rn "exactly three answers" plugins/dev docs/dev.md` → no hits.
- `grep -rni "two modes\|two execution modes" plugins/dev docs/dev.md` → only
  `execute-plan/SKILL.md:38` and `docs/dev.md:74`, framing unchanged.
- `grep -rn "(recommended)" plugins/dev/skills/execute-plan/SKILL.md` → no
  static marker on an option row.
- `grep -l "subagent(sonnet)" dist/plugins/dev/skills/*/SKILL.md` → three
  paths.

## Landmines

- `plugins/dev/skills/write-plan/SKILL.md` and `dev:explore` contain the start
  contract only via `<!-- include start-contract -->`; edit the fragment
  (`plugins/dev/fragments/start-contract.md`), not the expanded text — the
  installed skill copies under `~/.claude/plugins/cache` are generated output.
- `plugins/dev/skills/execute-plan/SKILL.md:54` marks opus `(recommended)`
  statically; the change replaces that static marker with the difficulty rule,
  it does not just add a row.
- "opus" also appears in docs examples (`docs/dev.md:48`, "Implement this with
  opus") — that example is about naming a model and stays valid; do not
  rewrite it. Likewise leave `docs/dev.md:5` and `:13` ("using `opus` where
  supported" — the default stays opus) and `docs/dev.md:42` ("The three
  answers become the start contract" — counts departure-check items, not
  modes).

## Scope

In scope:
- `plugins/dev/skills/execute-plan/SKILL.md`
- `plugins/dev/skills/execute-plan/references/delegation.md`
- `plugins/dev/fragments/start-contract.md`
- `plugins/dev/skills/explore/SKILL.md`
- `plugins/dev/skills/write-plan/SKILL.md`
- `docs/dev.md`
- `catalog/plugins/dev.json`
- `wiki/plans/README.md`, this plan

Out of scope:
- `plugins/dev/hooks/**`, `test/**` — tier detection unchanged; no behaviour
  in code changes.
- `plugins/dev/skills/write-plan/references/plan-audit.md` — audit stays on
  fable.
- `package.json` version / release tag — separate release step.
- Other plugins.

## Commands

| Purpose | Command | Expected result |
| --- | --- | --- |
| Tests + build | `npm run verify` | exit 0 |
| Recorded-value sweep | `grep -rn "subagent(fable)" plugins/dev docs/dev.md` | every hit also names `subagent(sonnet)` except the fable option row |
| Alias sweep | ``grep -rn '`fable`\|(fable)' plugins/dev docs/dev.md`` | every hit names `sonnet` except `plan-audit.md:9`, `docs/dev.md:104`, `hooks/context.mjs:18` |
| Stale count | `grep -rn "exactly three answers" plugins/dev docs/dev.md` | no hits |
| Static marker | `grep -rn "(recommended)" plugins/dev/skills/execute-plan/SKILL.md` | no option row carries it |
| Built output | `grep -l "subagent(sonnet)" dist/plugins/dev/skills/*/SKILL.md` | three paths |

## Done criteria

- [ ] All listed commands pass.
- [ ] The execution-mode question in `dev:execute-plan` lists Subagent (sonnet), Subagent (opus), Subagent (fable), Self in that order, with a difficulty-based recommendation rule that falls back to opus when unsure.
- [ ] Selection rule 3 and the legacy mapping still resolve to `subagent(opus)`.
- [ ] Every recorded-value enumeration (start contract, plan `Execution:`, report `Mode:`, docs) includes `subagent(sonnet)`.
- [ ] `catalog/plugins/dev.json` version is `0.29.0`.
- [ ] Implementation follows every entry in Decisions & tradeoffs.
- [ ] No out-of-scope files changed.
- [ ] `wiki/plans/README.md` status is updated.

## STOP conditions

- A fact cited under Decisions & tradeoffs no longer holds.
- The outcome requires out-of-scope files.
- A validation command fails twice after one reasonable fix.
- A named assumption is false.

## Maintenance notes

- Bootstrap: this plan's own `Execution: subagent(sonnet)` is unknown to the
  installed dev 0.28.0 skills. It is honoured because the user named it in the
  planning session (rule 1); executed from a fresh session on 0.28.0, the
  orchestrator should still dispatch `model: sonnet` per this Status note.

- Adding a further tier later means the same sweep: the canonical section in
  `dev:execute-plan`, the start-contract fragment, the plan/report field
  enumerations, and `docs/dev.md`.
- Tier aliases (`sonnet`, `opus`, `fable`) are host model aliases; if the host
  renames one, only the canonical section and delegation reference need to
  change.
