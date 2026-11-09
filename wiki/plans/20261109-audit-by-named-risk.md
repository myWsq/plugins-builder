# Plan 20261109-audit-by-named-risk: recommend the plan audit only for a named late-discovery risk, and retire the review pause

> Three parts for three readers. The Record says why and stays true after the
> code moves on. The Execution brief is the only part a delegated executor
> receives. Verification is the orchestrator's. At close, `dev:execute-plan`
> appends an Outcome and updates `wiki/plans/README.md`.
>
> Drift check: `git diff --stat 5d2ac12..HEAD -- plugins/dev/skills/explore/SKILL.md plugins/dev/fragments/start-contract.md plugins/dev/skills/write-plan/SKILL.md plugins/dev/skills/execute-plan/SKILL.md docs/dev.md catalog/plugins/dev.json`

## Status

- Priority: P2
- Effort: S
- Risk: LOW
- Depends on: none
- Category: feature
- Execution: subagent(fable) — departure check
- Stop after: implementation — departure check (plain autopilot)
- Plan review: none — departure check
- Workspace: isolated — planned from the main worktree; moved to `.claude/worktrees/20261109-audit-by-named-risk` on `dev/20261109-audit-by-named-risk`
- Planned at: `5d2ac12`, 2026-11-09

## Record

### Requirement

At `dev:explore`'s departure check, the autopilot item recommends the plan
audit for nearly every plan. The rule at `plugins/dev/skills/explore/SKILL.md:100`
recommends the audit when a plan "settles real design decisions or touches
contracts, data, or cross-module boundaries", and "when unsure". By the time
the check runs, grilling has almost always settled a decision, and in this
repository every skill text counts as a contract, so the audit trigger is met
by default. Plain autopilot needs four conjunctive conditions; the audit needs
any one. The rule weighs risk only and never asks whether the execution-side
safety net — verification and diff review in `dev:execute-plan` — would catch
a wrong plan cheaply.

The user also asked to remove the option that pauses for a human to review the
plan, together with the `plan` endpoint it set.

Product conclusions (confirmed by the user at `dev:explore`'s product gate,
extended by their later instructions):

- The autopilot item offers two answers: **plan audit** and **plain
  autopilot**. The review pause is gone.
- **Plain autopilot is the default recommendation**: opus plus execution-time
  verification and diff review is sufficient for most plans.
- **Plan audit is recommended only when its one-clause reason names one of
  four concrete situations** where a plan error surfaces late and costs a lot:
  1. irreversible or external side effects — data migration, deletion,
     publishing, calls to external services;
  2. amplified error — a plan group or several work packages build on one
     shared contract;
  3. verification would not catch it — the plan and its done criteria rest on
     the same premise about the code that has not been verified against it;
  4. the hard part exceeds opus's reliable range — concurrency, security,
     intricate algorithmic correctness.
  If no such situation can be named, plain autopilot is recommended. Having
  settled design decisions, or touching a contract or module boundary, no
  longer triggers the audit on its own; "when unsure, recommend the audit" is
  gone.
- Unchanged: availability gates (`top-tier: yes` or no subagent tool → the
  audit is omitted with a one-clause reason and plain autopilot recommended),
  the audit itself (fable reviewer, `write-plan` step 5,
  `references/plan-audit.md`), and the execution-mode recommendation.
- The `plan` endpoint is removed entirely: `Stop after` is `discussion` or
  `implementation`. A user who wants to read a plan before execution
  interrupts the run.
- An audit that was chosen but cannot be dispatched is a STOP: the plan is
  written, execution does not start, and the reason is reported.
- Observable when done: for a typical skill-wording change in this repository
  the departure check offers two answers and marks plain autopilot
  `(recommended)`; for a plan group or a data migration it marks the plan
  audit `(recommended)` with the named situation as its reason; no skill or
  doc mentions a review pause.

### Decisions & tradeoffs

- **D1 The audit recommendation is keyed on a named late-discovery risk; plain
  autopilot is the default.** The audit is recommended only when the asker can
  name, in the one-clause reason, one of the four situations in the
  Requirement for this plan; otherwise plain autopilot. Rejected: the current
  signals (settled design decisions; contracts, data, or cross-module
  boundaries) with "when unsure → audit" — nearly every plan meets them, which
  is the reported defect. Rejected: a fixed structural checklist (plan group,
  migration, public API only) — it misses the unverified-premise and
  capability-gap cases. Based on: the departure-check discussion (Discussion
  log 1–2); rule at `plugins/dev/skills/explore/SKILL.md:100`.
- **D2 Untouched parts of the autopilot rule stay**: judge the plan, not the
  execution mode chosen in the previous item; availability gates override the
  risk rule; the audit maps to `implementation` with `audit`, plain autopilot
  to `implementation` with `none`. The audit mechanism (fable,
  `write-plan` step 5, `references/plan-audit.md`) does not change. Based on:
  `plugins/dev/skills/explore/SKILL.md:100`,
  `wiki/plans/20261014-risk-based-plan-review.md` D1–D4.
- **D3 The review pause answer and the `plan` endpoint are removed
  entirely.** `Stop after` takes `discussion` or `implementation`; no request
  wording derives `plan` any more; a departure check always continues into
  implementation. Rejected: dropping only the departure-check answer while
  still deriving `plan` from an explicit "just plan it" request — the user
  chose full removal (Discussion log 5). Based on:
  `plugins/dev/fragments/start-contract.md:6`,
  `plugins/dev/skills/write-plan/SKILL.md:112,269`.
- **D4 An audit that cannot be dispatched is a STOP.** `write-plan` step 5
  reports why, does not start `dev:execute-plan`, and leaves the plan in the
  workspace with its absolute path stated. Rejected: continuing into execution
  unreviewed — an audit is only chosen when a named error would be costly
  after execution. Based on: Discussion log 6;
  `plugins/dev/skills/write-plan/SKILL.md:264`. The plan is left uncommitted
  at that STOP, since the plan commit happens only at handoff to execution
  (write-plan Rule 6) and `dev:execute-plan` commits pending `wiki/plans/`
  files at preflight (decided while planning).
- **D5 When `dev:execute-plan` is absent, `write-plan` asks once only how to
  execute** (self-execution or a subagent); the "or review first" alternative
  and the clause about a later request overriding `Stop after: plan` go.
  Based on: `plugins/dev/skills/write-plan/SKILL.md:270`. (decided while
  planning)
- **D6 Legacy plans recording `Stop after: plan` are executed when
  `dev:execute-plan` is asked to run them**: the request to execute
  supersedes the old endpoint, which `execute-plan/SKILL.md:31` already says;
  only its "plan-only endpoint" wording is aligned. Based on:
  `plugins/dev/skills/execute-plan/SKILL.md:31`. (decided while planning)
- **D7 `Execution: deferred` stays** for work no departure check settled; its
  description drops plan-only work. Based on:
  `plugins/dev/fragments/start-contract.md:7`. (decided while planning)
- **D8 Version bump: dev `0.31.0` → `0.32.0`** in `catalog/plugins/dev.json`,
  a minor bump like the previous behaviour changes. The builder
  `package.json` version is not touched. Based on: `catalog/plugins/dev.json:3`.

### Discussion log

1. Diagnosis offered at `dev:explore`: the rule is biased toward the audit
   (decisions always exist, skill text counts as a contract, asymmetric
   conditions, unsure → audit, no cost side). A first question proposing
   three criteria was declined; the user asked to discuss how the real world
   decides that a task needs a senior expert.
2. Real-world practice discussed (one-way/two-way doors, architecturally
   significant = costly to change, ITIL standard vs normal change, RFC
   "substantial", blast radius and rollback, CODEOWNERS domains, mandatory
   second opinions): escalation is the exception, needs a named reason, and
   pays when an error is found late and is costly to undo. Here
   implementation is cheap and `dev:execute-plan` verifies, so the audit pays
   only in four situations. User: "opus 能力其实挺强的, 大多数情况下是足够的",
   and accepted the four situations.
3. Product confirmation: default plain autopilot; audit only for a named one of
   the four situations; three answers, availability gates, and the audit
   itself unchanged — confirmed.
4. Departure check: direction approved; execution `subagent(fable)` (offered
   with opus recommended); plain autopilot (recommended, reason: local,
   reversible skill-text change meeting none of the four situations).
5. Later instruction: "移除给人审核 plan 的选项". Asked whether to keep the
   `plan` endpoint for explicit plan-only requests (recommended) or remove it
   entirely — user: remove it entirely.
6. Asked what happens when a chosen audit cannot be dispatched: STOP and report
   (recommended) or continue unreviewed — user: STOP and report.

### Maintenance notes

- `wiki/plans/20261014-risk-based-plan-review.md` records the rule this plan
  replaces; it stays as history and is not edited.
- Older plans in `wiki/plans/` mention `Stop after: plan` or the review pause;
  they are history, not live instructions.
- If audits later prove to catch real defects in plans outside the four
  situations, revisit D1 by adding a situation, not by restoring a broad
  default.

## Execution brief

> Written for `subagent(fable)` at `5d2ac12`. Implement the tasks in order.
> Decide only what Your call leaves to you; on anything else that is unclear,
> stop and report.

### Goal

The `dev` plugin's skills are Markdown instructions that a model follows. Two
behaviours change. First, at `dev:explore`'s departure check the autopilot
item stops recommending the plan audit by default: plain autopilot becomes the
default recommendation, and the audit is recommended only when its reason
names one of four concrete situations. Second, the "review pause" answer —
stop after writing the plan so a human reads it — and the `plan` value of
`Stop after` are removed everywhere they are live instructions; the chain's
endpoints become `discussion` and `implementation`.

Conventions: these files are English, one paragraph or list item per line
(long lines, no hard wrapping inside a paragraph), sentence-dense, with
identifiers in backticks. Match the surrounding style; change only the
sentences these tasks name and keep the rest of each paragraph intact. There
is no formatter for Markdown in this repository; do not run one.
`plugins/dev/fragments/start-contract.md` is included verbatim into all three
skills at build time, so edit the fragment, never a generated copy.

### Milestone 1: the recommendation rule and the endpoint removal ship in skills and docs

Depends on: none. One milestone; its tasks touch different files and do not
depend on each other except T6, which mirrors T1–T4.

#### T1 · The departure check's autopilot item has two answers and recommends by named risk

- Where: `plugins/dev/skills/explore/SKILL.md` — the list item beginning `3. **Autopilot**:` under `### 7. Departure check`
- Change: rewrite the answers and the recommendation rule.
- After:
  - The item offers two answers: the plan audit (description unchanged:
    `dev:write-plan` sends the finished plan to a top-tier subagent that reads
    the code itself, revises it on the findings, then continues into execution
    without stopping) and plain autopilot (straight to execution). No third
    answer, no mention of a review pause, no "Three answers".
  - Availability text unchanged in substance: the audit is offered when the
    host has a subagent tool and the latest `<dev-orchestrator>` block does
    not say `top-tier: yes`; without a block the tier is unknown and the audit
    stays available.
  - Recommendation (D1): plain autopilot is recommended by default. The plan
    audit is recommended only when the one-clause reason names, for this
    plan, one of these situations where a plan error would surface only after
    execution and cost a lot: (1) irreversible or external side effects —
    data migration, deletion, publishing, calls to external services;
    (2) an amplified error — a plan group, or several work packages, building
    on one shared contract; (3) a gap verification cannot close — the plan and
    its done criteria rest on the same premise about the code that has not
    been verified against it; (4) a hard part beyond opus's reliable range —
    concurrency, security, intricate algorithmic correctness. When no such
    situation can be named, recommend plain autopilot. State explicitly that
    settling design decisions, or touching a contract or module boundary,
    does not by itself call for the audit.
  - Kept (D2): judge the plan itself, not the execution mode chosen in the
    previous item; the availability gates override the risk rule — when the
    block says `top-tier: yes`, or the subagent tool is missing, omit the
    audit, say in one clause why, and recommend plain autopilot (the item then
    only confirms autopilot).
  - Mapping: plain autopilot sets `Stop after: implementation` with
    `Plan review: none`; the plan audit sets `implementation` with `audit`.
- Don't: keep "when unsure, recommend the plan audit" or any tie-break toward the audit (D1).
- Don't: keep "settles real design decisions or touches contracts, data, or cross-module boundaries" as a trigger (D1).

#### T2 · The start contract has two endpoints

- Where: `plugins/dev/fragments/start-contract.md` — the bullets beginning `- **Stop after**:` and `- **Execution**:`
- Change: remove the `plan` endpoint and plan-only wording.
- After:
  - `Stop after` takes `discussion` or `implementation` (including
    verification). A discussion request ends in chat and is derived from the
    request; `implementation` is set at the departure check's autopilot item,
    which also sets `Plan review` (`none` or `audit`, the `audit` sentence
    kept as is). There is no plan-only endpoint (D3).
  - `Execution`: `deferred` is used only for work no departure check settled,
    such as a discussion; the "plan-only work" mention is gone (D7).
  - The last paragraph ("Once the departure check is answered …") needs no
    change unless it names `plan`; leave it otherwise.

#### T3 · `dev:write-plan` no longer pauses for review

- Where: `plugins/dev/skills/write-plan/SKILL.md`
- Change and After, per anchor:
  - `### 1. Establish context`, bullet beginning `- For direct requests that stay here` — the departure-check summary reads "direction, execution mode, plain autopilot or plan audit"; no review pause.
  - The plan template's Status line beginning `- Stop after: plan | implementation` — becomes `- Stop after: implementation — from the departure check's autopilot item` (plain autopilot or plan audit); no `plan` value, no review-pause mapping.
  - `### 5. Plan audit`, item `4. If the audit cannot be dispatched` — becomes a STOP (D4): report why, do not start `dev:execute-plan`, and state the plan's absolute path (it lives only on `dev/<id>` in the worktree when step 3 moved the session); the plan stays uncommitted, since `dev:execute-plan` commits pending `wiki/plans/` files at preflight. No `Stop after: plan`, no review pause.
  - `### 6. Handoff`: delete the bullet beginning `- When \`Stop after: plan\``. In the first bullet, the clause "When `Stop after: implementation` — directly, or after step 5 under `Plan review: audit` —" may drop the condition since it is now always true; keep the actions it describes. In the bullet beginning `- If the departure check omitted the execution item`, ask once only how to execute (self-execution or a subagent), then proceed; remove "or review first" and the sentence about a later request overriding `Stop after: plan` (D5).
  - Also remove the `Stop after: implementation unchanged` phrase in step 5's top-tier skip paragraph only if it reads as implying another value exists; otherwise leave it.
- Don't: change step 5 items 1–3, `references/plan-audit.md`, or Rule 6 (D2, D4).

#### T4 · `dev:execute-plan` aligns its legacy-endpoint sentence

- Where: `plugins/dev/skills/execute-plan/SKILL.md` — the preflight bullet beginning `- Read the full plan and any listed prerequisite plans.`
- Change: replace "A current request to execute supersedes an older plan-only endpoint; without execution authorization, stop at the recorded endpoint." with a sentence saying that a `Stop after: plan` recorded by an older plan is superseded by the request to execute it (D6).
- After: no other sentence in this file changes.

#### T5 · dev is versioned 0.32.0

- Where: `catalog/plugins/dev.json` — `"version": "0.31.0"`
- After: `"version": "0.32.0"`; nothing else in the file changes (D8).

#### T6 · `docs/dev.md` mirrors the new behaviour

- Where: `docs/dev.md`
- Change and After, per anchor:
  - Paragraph beginning `The departure check determines where the chain stops:` — discussion ends in chat, and autopilot continues through execution and verification, optionally with an audit of the finished plan on the way; no review pause.
  - List item beginning `3. **Autopilot**` — two answers (plain autopilot, plan audit); mirror T1's rule: plain autopilot recommended by default, the audit only when its reason names one of the four situations (list them briefly), design decisions or contracts alone do not call for it; judged from the plan, not the execution mode; when the audit is unavailable it is omitted and plain autopilot recommended.
  - Table row beginning `| "Write a plan first; I want to review it." |` — delete the row.
  - Paragraph beginning `Under \`Plan review: audit\`` — replace "the plan is not executed unreviewed: the chain falls back to the review pause and waits for you" with: the plan is not executed unreviewed — the chain stops and reports why (D4).
- Don't: edit other sections of `docs/dev.md`.

### Your call

Exact wording and sentence order within each changed paragraph, as long as
every `After` holds and the rejected alternatives in the `Don't` lines are
excluded by the words, not merely disfavored.

### Landmines

- `wiki/plans/*.md` other than this plan are history and mention the review
  pause and `Stop after: plan`; do not edit them.
- `plugins/dev/skills/explore/SKILL.md` line `For pure exploration, a
  discussion that ends in chat, or a plan stress-test, stop after the report.`
  contains "stop after" but is about the discussion path; leave it.

### Scope

In scope:
- `plugins/dev/skills/explore/SKILL.md`
- `plugins/dev/fragments/start-contract.md`
- `plugins/dev/skills/write-plan/SKILL.md`
- `plugins/dev/skills/execute-plan/SKILL.md`
- `catalog/plugins/dev.json`
- `docs/dev.md`

Out of scope:
- `plugins/dev/skills/write-plan/references/plan-audit.md` — the audit itself does not change
- `plugins/dev/skills/execute-plan/SKILL.md` "Choose execution mode" section — the execution-mode recommendation does not change
- `plugins/dev/hooks/` — the `<dev-orchestrator>` block and `top-tier` detection do not change
- `wiki/plans/` history, `package.json`, `MARKET_README.md`

### Stop and report if

- A task's anchor is missing, or the text there differs from what the task describes.
- A live instruction outside the in-scope files mentions the review pause or `Stop after: plan`.
- Removing the `plan` endpoint leaves a sentence whose meaning depends on it and that no task covers.

## Verification

### Milestone validations

- Milestone 1: `npm test` -> exit 0

### Commands

| Purpose | Command | Expected result |
| --- | --- | --- |
| Tests and real build | `npm run verify` | exit 0 |
| No live review pause | `grep -rniE "review pause\|plan-only\|Stop after: plan\|review first" plugins docs dist/plugins/dev dist/docs` | only the execute-plan legacy sentence (T4) matches `Stop after: plan`; nothing else |
| No unsure-audit tie-break | `grep -rn "when unsure, recommend the plan audit\|whenever the asker is unsure" plugins docs` | no output |
| Version | `node -p "require('./catalog/plugins/dev.json').version"` | `0.32.0` |

`npm run verify` runs after `npm ci --ignore-scripts` in a fresh worktree.

### Done criteria

- [ ] All listed commands pass.
- [ ] Every task's `After` state holds.
- [ ] `dist/plugins/dev/skills/explore/SKILL.md` shows an autopilot item with two answers, plain autopilot as the default recommendation, and the four named situations as the only audit triggers.
- [ ] All three generated skills carry the start contract with `Stop after` limited to `discussion` and `implementation`.
- [ ] Implementation follows every entry in Decisions & tradeoffs.
- [ ] No out-of-scope files changed.
- [ ] The Outcome is appended and `wiki/plans/README.md` status is updated.

### Merge and deploy

Releasing is separate: after merge, `npm version minor` (or as appropriate)
and `git push origin main --follow-tags` publish dev 0.32.0. Installed copies
keep the old rule until the user updates the plugin.
