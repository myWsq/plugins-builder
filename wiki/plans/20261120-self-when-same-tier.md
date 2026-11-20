# Plan 20261120-self-when-same-tier: recommend self when the task needs no other model tier

> Three parts for three readers. The Record says why and stays true after the
> code moves on. The Execution brief is the only part a delegated executor
> receives. Verification is the orchestrator's. At close, `dev:execute-plan`
> appends an Outcome and updates `wiki/plans/README.md`.
>
> Drift check: `git diff --stat 2c2402f..HEAD -- plugins/dev catalog/plugins/dev.json docs/dev.md`

## Status

- Priority: P2
- Effort: S
- Risk: LOW
- Depends on: none
- Category: feature
- Execution: self — departure check answer (the installed dev 0.32.0 rule never recommends self; the user's current instruction is exactly that change)
- Stop after: implementation — departure check (plain autopilot)
- Plan review: none — departure check (plain autopilot)
- Workspace: isolated — planned from the main worktree; moved to `.claude/worktrees/20261120-self-when-same-tier` on `dev/20261120-self-when-same-tier`
- Planned at: `2c2402f`, 2026-11-20

## Record

### Requirement

The owner found that implementation delegated to a subagent turns out worse
than implementation by the orchestrator itself. Today the execution-mode
question always recommends a subagent — the tier picked by task difficulty,
opus when unsure — and "Self is never the recommended option". For the
common case, an opus orchestrator facing an ordinary task, that recommends
handing the work to a same-tier model, which only adds a lossy handoff.

Product conclusions confirmed in exploration (the consumer is whoever answers
the execution-mode question: the departure check in `dev:explore` or
`dev:write-plan`, or `dev:execute-plan` under its selection rule 4):

- The question still offers exactly four options in tier order — Subagent
  (sonnet), Subagent (opus), Subagent (fable), Self — with the recommended one
  presented first.
- Recommendation: task difficulty picks a tier as today (mechanical,
  well-specified → sonnet; ordinary implementation needing judgment → opus;
  needs the top tier → fable; unsure → opus). Compare that tier with the
  orchestrator's own:
  - different tier → recommend the subagent on that tier;
  - same tier → recommend Self; exception: when concurrent execution is
    already evident at the time of asking (a plan group, or plainly
    independent milestones), recommend the same-tier subagent, since only
    delegation runs work concurrently.
- The orchestrator's tier comes from the latest injected `<dev-orchestrator>`
  block's `model`; without a block, from the model the host says it runs on;
  when still unknown, or not one of the three Claude tiers, treat it as opus.
- Examples: opus session — ordinary → Self, mechanical → Subagent (sonnet),
  hardest → Subagent (fable). fable session — ordinary → Subagent (opus),
  hardest → Self.
- Unchanged: a mode the user names, a recorded mode, legacy values mapping to
  `subagent(opus)`, "delegate" without a named target → `subagent(opus)`, the
  host-unsupported fallback, brief sizing, verification, and the plan audit.
- The "subagent preferred / delegated by default" framing goes away wherever
  it describes the modes.

Done when the canonical "Choose execution mode" section, the explore
departure-check item that points at it, and the maintainer docs all state the
tier-comparison rule, and nothing in the dev plugin or `docs/dev.md` still
calls delegation the preferred or default mode or says self is never
recommended.

### Decisions & tradeoffs

- **D1 One canonical rule**: the recommendation rule is written only in
  `dev:execute-plan`'s "Choose execution mode" section; `dev:explore` and
  `dev:write-plan` keep pointing at it by name. Rejected: restating the rule
  in the departure checks — the section exists precisely so the wording is
  not duplicated. Based on: `plugins/dev/skills/execute-plan/SKILL.md:37`,
  `plugins/dev/skills/explore/SKILL.md:99`, `plugins/dev/skills/write-plan/SKILL.md:33`.
- **D2 Compare tiers, not "prefer self"**: self is recommended exactly when
  the difficulty tier equals the orchestrator's tier and concurrency is not
  evident. Rejected: always recommending self unless the user asks — the
  owner still wants sonnet for mechanical work and fable for top-tier work;
  and recommending self on a fable session's ordinary task — confirmed at the
  product confirmation that a different tier means a subagent. Based on:
  Discussion log entries 2–3.
- **D3 Concurrency exception**: on a tier tie, evident concurrency (a plan
  group, or plainly independent milestones) recommends the same-tier
  subagent. Rejected: ignoring concurrency. Based on: Discussion log entry 1.
- **D4 Orchestrator tier source**: the latest `<dev-orchestrator>` block's
  `model`, else the host-declared model, else opus. No hook change: the block
  is already injected at session start and when `dev:explore` and
  `dev:write-plan` start, which is where the question is normally asked;
  `dev:execute-plan` asks only as a fallback and uses the session-start block.
  Rejected: adding `dev:execute-plan` to the hook's orchestrator skills —
  extra code and tests for a rare path. Based on:
  `plugins/dev/hooks/context.mjs:12`, `plugins/dev/hooks/context.mjs:139`.
- **D5 Defaults for unasked paths stay `subagent(opus)`**: selection rule 3
  (delegate without a target) and the legacy-value mapping are explicit
  requests to delegate or recorded delegation, not recommendations. Based on:
  `plugins/dev/skills/execute-plan/SKILL.md:47-48`.
- **D6 Version**: bump the `dev` plugin to `0.33.0` (behavior change to a
  shipped skill); no builder release in this plan. Based on: `AGENTS.md`
  version contract, `catalog/plugins/dev.json`.

### Discussion log

1. Grilling — same tier, but the plan looks parallelizable: recommend? Options:
   still self (recommended) / subagent when parallel is evident. Answer:
   "可并行时推荐 subagent". Settled D3.
2. Product confirmation — the rule, the tier source, the examples, the
   unchanged list, and removing the "preferred" framing; alternative offered:
   "fable session ordinary task → self too". Answer: confirmed as stated.
   Settled D2, D4, D5.
3. Departure check — direction as above; options Self + plain autopilot
   (recommended) / Self + plan audit / Subagent (sonnet) / Subagent (fable).
   Answer: Self + plain autopilot.

### Maintenance notes

- If the hook ever stops injecting `<dev-orchestrator>` at `dev:explore` or
  `dev:write-plan` start, the recommendation silently falls back to "treat
  as opus".
- A new Claude tier means revisiting both the difficulty tiers and the
  "treat as opus" fallback.

## Execution brief

> Written for `self` at `2c2402f`. Implement the tasks in order. Decide only
> what Your call leaves to you; on anything else that is unclear, stop and
> report.

### Goal

Change how the execution-mode question picks its recommended option: task
difficulty picks a tier, the tier is compared with the orchestrator's own,
and self is recommended on a tie unless concurrency is already evident. The
canonical definition lives in `dev:execute-plan`; other files only point at
it or describe it for maintainers. All repository text is English. No
formatter applies to these Markdown/JSON files.

### Milestone 1: the canonical rule and its references

Depends on: none

#### T1 · execute-plan defines the tier-comparison recommendation

- Where: `plugins/dev/skills/execute-plan/SKILL.md` — `### 2. Choose execution mode`, from "Two modes, in default preference order:" through "Self is never the recommended option. Present the recommended option first, then the others in the tier order above."
- Change: present the two modes without a preference order — drop "(preferred)" and "in default preference order"; self-execution is no longer described only as a fallback or for when the orchestrator's "full capability" is needed. Replace the recommendation paragraph with the rule from D2–D4: difficulty picks a tier (keep the tier descriptions in the option list as the difficulty scale; unsure → opus), compare with the orchestrator's tier read from the latest `<dev-orchestrator>` block (else the host-declared model; unknown or not a Claude tier → opus); different → recommend that subagent; same → recommend Self unless concurrent execution is evident at the time of asking (a plan group, or plainly independent milestones), then the same-tier subagent. Keep "Present the recommended option first, then the others in the tier order above."
- After: the section states who marks the recommendation and by which rule; "Self is never the recommended option" and "when unsure, recommend opus" (as the final recommendation) are gone; selection rules 1–4, the unsupported-host paragraph, and the option list wording stay as they are.
- Don't: change selection rule 3 or the legacy mapping away from `subagent(opus)` (D5).

#### T2 · execute-plan's description and overview drop the delegation preference

- Where: `plugins/dev/skills/execute-plan/SKILL.md` — frontmatter `description` ("Prefers a host subagent and can self-execute before verifying and reviewing the diff.") and the opening paragraph ("Delegate implementation to a host subagent (preferred) or implement it yourself").
- Change: describe both modes neutrally — implement directly or delegate to a host subagent — without "Prefers" / "(preferred)".
- After: the description keeps its trigger phrases (implement, run, execute, delegate, the example plan names) unchanged; only the preference wording changes.

#### T3 · explore's departure check points at the recommendation rule

- Where: `plugins/dev/skills/explore/SKILL.md` — departure-check item 2, "with the recommendation that section's difficulty rule gives for this task".
- Change: refer to that section's recommendation rule rather than a difficulty-only rule.
- After: the item still tells the asker to read the canonical section and does not restate the rule (D1).

#### T4 · maintainer docs describe the new rule

- Where: `docs/dev.md` — the "division of labor" paragraph ("The implementation itself is delegated by default to a host subagent using `opus` where supported"), departure-check item 2 ("with the recommended tier chosen by the task's difficulty (opus when unsure)"), and `### 3. Execute and review` ("Two execution modes, in default preference order:" and its table rows "Subagent (default)" / "Self-execution | Fallback when no subagent tool exists, or an explicit choice.").
- Change: describe the orchestrator implementing directly or delegating, with the recommendation given by the tier comparison (difficulty tier vs. orchestrator tier; tie → self unless concurrency is evident); retitle the table rows without "default"/"Fallback" framing while keeping their factual notes (model aliases, permission envelope, no subagent tool → self).
- After: `docs/dev.md` contains no claim that delegation is the default or preferred mode.

#### T5 · version bump

- Where: `catalog/plugins/dev.json` — `"version": "0.32.0"`.
- Change: set it to `0.33.0` (D6).

### Your call

Exact wording and sentence structure in every task; whether the rule in T1 is
a short list or a paragraph; how the docs table in T4 is laid out.

### Scope

In scope:
- `plugins/dev/skills/execute-plan/SKILL.md`
- `plugins/dev/skills/explore/SKILL.md`
- `docs/dev.md`
- `catalog/plugins/dev.json`
- `wiki/plans/20261120-self-when-same-tier.md`, `wiki/plans/README.md` (status only)

Out of scope:
- `plugins/dev/hooks/context.mjs` and `test/` — no hook change (D4)
- `plugins/dev/skills/write-plan/SKILL.md` — already points at the canonical section by name
- `plugins/dev/fragments/start-contract.md` — enumerates modes only, carries no recommendation
- `package.json` version / release tag — no builder release here
- `MARKET_README.md`, `catalog/marketplace.json`

### Stop and report if

- A task's anchor is missing, or the code there differs from what the task describes.
- A task needs a file outside the in-scope list.
- Another file in `plugins/dev` turns out to state the old recommendation rule.

## Verification

### Milestone validations

- Milestone 1: `npm run verify` → exit 0

### Commands

| Purpose | Command | Expected result |
| --- | --- | --- |
| Tests + build | `npm run verify` | exit 0 |
| Leftover wording | `grep -rn -E "\(preferred\)\|Prefers a host subagent\|Self is never\|opus when unsure\|delegated by default\|default preference order\|Subagent \(default\)" plugins/dev docs/dev.md` | no output |
| Shipped text | `sed -n '/### 2. Choose execution mode/,/### 3. Preflight/p' dist/plugins/dev/skills/execute-plan/SKILL.md` | contains the tier-comparison rule |
| Version | `grep '"version"' dist/plugins/dev/.claude-plugin/plugin.json` | `0.33.0` |

### Done criteria

- [ ] All listed commands pass.
- [ ] Every task's `After` state holds.
- [ ] Reading the canonical section, an opus orchestrator with an ordinary, non-parallel task lands on Self; with a mechanical task on Subagent (sonnet); with a plan group at opus difficulty on Subagent (opus).
- [ ] Implementation follows every entry in Decisions & tradeoffs.
- [ ] No out-of-scope files changed.
- [ ] The Outcome is appended and `wiki/plans/README.md` status is updated.

### Merge and deploy

Shipping to the marketplace needs a builder release after merge: `npm version
minor` (or patch) on `main` and `git push origin main --follow-tags`.
