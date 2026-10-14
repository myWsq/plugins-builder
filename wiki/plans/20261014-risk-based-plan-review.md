# Plan 20261014-risk-based-plan-review: the departure check recommends a plan audit by plan risk, not unconditionally

> This plan is an outcome contract, not a step-by-step script. Understand the
> requirement and the recorded decisions, then design the implementation
> yourself against the live code. Run milestone validations as you go only if
> you are also the verifier — a delegated executor implements only, and
> verification happens outside its session. Stop on any STOP condition. When
> complete, update this plan in `wiki/plans/README.md`.
>
> Drift check: `git diff --stat 99526f7..HEAD -- plugins/dev/skills/explore/SKILL.md docs/dev.md catalog/plugins/dev.json plugins/dev/skills/execute-plan/SKILL.md`

## Status

- Priority: P2
- Effort: S
- Risk: LOW
- Depends on: none
- Category: feature
- Execution: subagent(opus) — departure check
- Stop after: implementation — departure check (plain autopilot)
- Plan review: none — departure check
- Workspace: isolated — planned from the main worktree; moved to `.claude/worktrees/20261014-risk-based-plan-review` on `dev/20261014-risk-based-plan-review`
- Planned at: `99526f7`, 2026-10-14

## Requirement

`dev:explore`'s departure check bundles an **autopilot** item with three
answers: plan audit, plain autopilot, and review pause. Today the plan audit is
the recommended answer whenever it is available, regardless of the task — a
three-file rename gets the same fable audit recommendation as a cross-module
design change. The execution-mode item next to it is already recommended by
task difficulty (`plugins/dev/skills/execute-plan/SKILL.md:59`); plan review is
not. An audit of a mechanical, fully specified plan costs a blocking top-tier
call for almost no findings.

Once done, the autopilot item's recommendation follows **plan risk**.

Product conclusions (confirmed by the user at `dev:explore`'s product gate):

- The item still offers the same three answers; only which one carries
  `(recommended)` changes, followed by a one-clause reason.
- **Plain autopilot** is recommended when the plan is mechanical, narrow, and
  fully specified — it settles no real design decisions.
- **Plan audit** is recommended when the plan settles real design decisions or
  touches contracts, data, or cross-module boundaries — and whenever the
  asker is unsure, so unclear cases keep today's behaviour.
- **Review pause** is never the recommendation (unchanged).
- Availability gates unchanged: with an orchestrator whose `<dev-orchestrator>`
  block says `top-tier: yes`, or with no subagent tool, the audit option is
  omitted with a one-clause reason and plain autopilot is recommended; without
  a block the tier is treated as unknown and the audit stays available.
- Observable when done: for a rename-style change the departure check marks
  plain autopilot `(recommended)`; for a decision-heavy change it marks the
  plan audit `(recommended)`.

## Decisions & tradeoffs

- **The recommendation signal is plan risk, judged by the asker at the
  departure check**: whether the plan settles real design decisions or touches
  contracts, data, or cross-module boundaries. Rejected: deriving it from the
  chosen execution mode (e.g. no audit for `subagent(sonnet)`) — the two pull
  in opposite directions (a weaker executor follows a flawed plan more
  literally, yet mechanical plans have less to get wrong), so the executor tier
  is not a reliable proxy; the wording must not link the two items. Based on:
  execution-mode rule at `plugins/dev/skills/execute-plan/SKILL.md:52-59`,
  autopilot rule at `plugins/dev/skills/explore/SKILL.md:100`.
- **Unsure defaults to the audit**. Rejected: defaulting to plain autopilot —
  it would silently weaken today's behaviour for every ambiguous plan.
- **Only whether to recommend the audit varies; the audit itself does not.**
  The reviewer stays on `fable`, `write-plan` step 5 and
  `references/plan-audit.md` are untouched. Rejected: a lower-tier audit for
  medium-risk plans — the audit contract holds that a reviewer at or below the
  reviewed tier is worse than none
  (`plugins/dev/skills/write-plan/references/plan-audit.md:13-15`), and the
  orchestrator is usually opus.
- **Availability gates keep precedence over the risk rule**: when the audit is
  unavailable it is omitted and plain autopilot recommended, whatever the risk.
  Based on: `plugins/dev/skills/explore/SKILL.md:100`.
- **Only two texts state the default and change**:
  `plugins/dev/skills/explore/SKILL.md:100` (canonical rule) and
  `docs/dev.md:38` (user-facing mirror). `plugins/dev/fragments/start-contract.md`
  and `plugins/dev/skills/write-plan/SKILL.md:31` describe the audit but do not
  state which answer is recommended — leave them. No test pins the wording.
  (decided while planning: verified by grep for "recommended default" /
  "whenever it is available".)
- **Version bump: dev `0.29.0` → `0.30.0`** in `catalog/plugins/dev.json`, a
  minor bump matching the previous behaviour change (0.28.0 → 0.29.0). The
  builder `package.json` version is not touched — releasing is a separate step.

## Direction

One milestone; exact prose is the executor's call, in the surrounding
sentence-dense style of each file. Keep the rest of
`explore/SKILL.md:100` — the three answers' descriptions, the gate wording,
and the mapping to **Stop after** / **Plan review** — intact.

### Milestone 1: risk-based autopilot recommendation shipped

`explore/SKILL.md`'s autopilot item and `docs/dev.md`'s mirror state the risk
rule above, with the availability gates still overriding it, and dev is at
`0.30.0`. Validation: `npm run verify` -> exit 0, and
`dist/plugins/dev/skills/explore/SKILL.md` contains the new rule.

## Scope

In scope:
- `plugins/dev/skills/explore/SKILL.md`
- `docs/dev.md`
- `catalog/plugins/dev.json`
- `wiki/plans/README.md`, this plan

Out of scope:
- `plugins/dev/skills/write-plan/**`, `plugins/dev/fragments/**` — they do not restate the default
- `plugins/dev/skills/execute-plan/SKILL.md` — execution-mode rules are unchanged
- `plugins/dev/hooks/**` — the tier gate is unchanged
- `package.json` version — release is separate

## Commands

| Purpose | Command | Expected result |
| --- | --- | --- |
| Install | `npm ci --ignore-scripts` | exit 0 |
| Tests + build | `npm run verify` | exit 0 |

## Done criteria

- [ ] All listed commands pass.
- [ ] The autopilot item recommends plain autopilot for mechanical, narrow, fully specified plans and the audit for decision-heavy / contract / data / cross-module plans and when unsure, each with a one-clause reason.
- [ ] Review pause is never recommended; the availability gates still omit the audit and recommend plain autopilot.
- [ ] Neither text ties the recommendation to the chosen execution mode.
- [ ] `docs/dev.md` matches the skill rule.
- [ ] `catalog/plugins/dev.json` version is `0.30.0`.
- [ ] Implementation follows every entry in Decisions & tradeoffs.
- [ ] No out-of-scope files changed.
- [ ] `wiki/plans/README.md` status is updated.

## STOP conditions

- A fact cited under Decisions & tradeoffs no longer holds.
- The outcome requires out-of-scope files.
- A validation command fails twice after one reasonable fix.
- Another file is found to state the audit as the unconditional default.

## Maintenance notes

The risk rule is a judgment the asker makes, like the execution-mode difficulty
rule. If either the audit's tier or the gate in `plugins/dev/hooks/context.mjs`
changes, revisit the availability wording in both texts together.
