# Plan 20260904-explore-advisor-escalation: dev-explore consults the advisor before asking the user an uncertain technical question

> This plan is an outcome contract, not a step-by-step script. Understand the
> requirement and the recorded decisions, then design the implementation
> yourself against the live code. Run milestone validations as you go only if
> you are also the verifier — a delegated executor implements only, and
> verification happens outside its session. Stop on any STOP condition. When
> complete, update this plan in `wiki/plans/README.md`.
>
> Drift check: `git diff --stat 02194c8..HEAD -- plugins/dev/skills/dev-explore/SKILL.md docs/dev.md catalog/plugins/dev.json plugins/dev/skills/dev-advisor/SKILL.md plugins/dev/skills/dev-execute-plan/SKILL.md`

## Status

- Priority: P2
- Effort: S
- Risk: LOW
- Depends on: none
- Category: feature
- Execution: subagent opus
- Planned at: `02194c8`, 2026-09-04

## Requirement

During `dev-explore`'s technical design stage — step 4 "Clarify the design"
and step 5 "Converge on the direction" — the orchestrating agent has exactly
two ways to settle a technical decision: read the codebase, or ask the user
(`plugins/dev/skills/dev-explore/SKILL.md:71`: "If a question can be answered
by exploring the codebase, explore the codebase instead"). When the code and
conventions leave a decision open and the agent has no recommendation it is
confident in, the question goes to the user with a weak recommendation, even
though the plugin ships `dev-advisor`, a skill that briefs a top-tier
read-only subagent precisely for this kind of call. Nothing in `dev-explore`
points at it.

After this plan, the Claude bundle of `dev-explore` carries a three-rung
escalation for technical decisions in steps 4 and 5: the codebase and its
conventions first; then, for a decision they do not settle and the agent
cannot recommend with confidence, the advisor via the `dev-advisor` skill;
the user last. The consumer of this change is the person invoking
`dev-explore`, and what they observe is:

- An uncertain technical point the advisor settles as a technical fact or the
  single sane path never reaches them as a question. The agent relays in one
  or two chat lines what the advisor settled, and the direction and report
  cite the advisor's answer as evidence the way they cite `file:line`.
- An uncertain technical point that still holds a genuine trade-off after the
  advisor — a user preference, a cost the user must weigh — reaches them as a
  question whose recommended answer carries the advisor's view.
- When the advisor cannot be dispatched or does not settle the point, the
  question reaches them exactly as it does today.
- Saying "don't grill me" reduces the questions put to them, as today. It does
  not suppress advisor consultation: the advisor is not a question to the
  user.
- Product grilling (step 2), recon (step 3), and the converged direction as a
  whole are untouched: no advisor call is added there, and none is made
  mandatory.
- `docs/dev.md` describes the behaviour; the `dev` plugin version is bumped.

A correct solution adds the rule to `dev-explore` and leaves `dev-advisor`
authoritative for how the advisor is briefed and how its answer is weighed.
Adjacent wrong solutions: adding "during dev-explore" to `dev-advisor`'s own
"When to call" list and leaving `dev-explore` silent; making the advisor a
mandatory pass over every technical question or over the converged direction;
following every advisor answer with a user question anyway; letting the
advisor's answer override the user on a genuine trade-off; writing the rule as
shared text the Codex bundle also renders; restoring an advisor agent file
under `plugins/dev/agents/`; applying the escalation to product grilling.

## Decisions & tradeoffs

- **The rule is one principle in `dev-explore` step 4, at the altitude of the
  codebase-first sentence.** It sits next to "If a question can be answered by
  exploring the codebase, explore the codebase instead"
  (`plugins/dev/skills/dev-explore/SKILL.md:71`) and extends it into codebase →
  advisor → user. It governs the technical decisions of step 4 and of step 5,
  which are the same decisions; whether step 5 gets its own clause is the
  executor's call. Rejected: a procedure or checklist (when to call, what to
  paste, how many calls) — `895129e` deliberately moved this skill from fixed
  procedure to principles, and its commit message says so. Rejected: placing
  the trigger in `dev-advisor`'s "When to call" list — that list describes
  `dev-advisor`'s own general triggers (`plugins/dev/skills/dev-advisor/SKILL.md:23-39`);
  the explore-specific trigger is narrower and belongs to the skill that
  fires it. Based on: `plugins/dev/skills/dev-explore/SKILL.md:67-71`.

- **Trigger: a technical decision the code and conventions do not settle and
  the agent cannot recommend with confidence.** Both conditions. A decision
  the codebase answers is answered from the codebase, as today; a decision
  the agent can recommend confidently goes straight to the user (or is left
  to the executor) without an advisor round-trip. Rejected: every technical
  decision — an advisor call per grilling question turns the cheapest stage
  of the chain into the slowest, and the user asked for "拿不准的" only.
  Based on: `plugins/dev/skills/dev-explore/SKILL.md:67` (settle only
  decisions worth settling).

- **The advisor's answer is evidence, not authority.** If the answer settles
  the point as a technical fact or the single sane path, the user is not
  asked; the direction states the conclusion and cites the advisor's answer as
  its evidence, alongside any `file:line`. If a genuine trade-off remains —
  something only the user can weigh — the user is asked, with the advisor's
  view folded into the recommended answer. Rejected: always still asking the
  user — doubles the round-trips and makes the advisor a mere phrasing aid.
  Rejected: the advisor settling all technical decisions — removes the
  agent's judgment about whether a trade-off remains, and the user chose
  against it. Based on: the existing rule that codebase evidence removes a
  user question (`plugins/dev/skills/dev-explore/SKILL.md:71`), which this
  decision extends to advisor evidence.

- **Fallback is today's behaviour.** When the advisor cannot be dispatched
  (no subagent tool, tier unavailable) or its answer does not settle the
  point, the question goes to the user as it does now. Rejected: blocking or
  retrying — the user asked for "先优先尝试", a first attempt, not a gate.
  Based on: `plugins/dev/skills/dev-advisor/SKILL.md:8-12` (advisor
  unavailable on Codex; the same wording must not make explore depend on it).

- **The opt-out does not reach the advisor.** "don't grill me" keeps its
  current meaning — fewer questions to the user, derive the rest
  (`plugins/dev/skills/dev-explore/SKILL.md:73`) — and the advisor remains a
  way to derive. The wording must not let a reader conclude that the opt-out
  skips the advisor. Rejected: tying the two together — the opt-out exists to
  spare the user, and the advisor spares the user.

- **Claude bundle only.** The new text lives inside a `<!-- claude -->` …
  `<!-- /claude -->` pair; the Codex rendering of `dev-explore` is unchanged.
  Rejected: shared text that relies on `dev-advisor`'s Codex block
  (`plugins/dev/skills/dev-advisor/SKILL.md:8-12`) to no-op — leaves Codex a
  dead instruction to load a skill that tells it to do nothing. Based on:
  `dev-explore` already uses paired target blocks for host-specific wording in
  the same step (`plugins/dev/skills/dev-explore/SKILL.md:74-79`).

- **Reference `dev-advisor` by name; duplicate nothing.** The model tier, the
  brief's contents, the read-only boundary, and how to weigh and relay the
  answer stay in `dev-advisor` (`plugins/dev/skills/dev-advisor/SKILL.md:14-107`).
  `dev-explore` states only the trigger, the two outcomes (settled → no
  question, cited as evidence; trade-off → ask with the advisor's view), and
  the fallback. Rejected: restating the brief in `dev-explore` — two copies
  drift. Based on: the same pattern already used for the execution-mode
  question, which `dev-explore` reads from `dev-execute-plan` by name
  (`plugins/dev/skills/dev-explore/SKILL.md:96`;
  `plugins/dev/skills/dev-execute-plan/SKILL.md`, "This section is the
  canonical definition").

- **Scope of the rule: steps 4 and 5 only.** No advisor call in product
  grilling (product decisions are the user's), none in recon, and no mandatory
  advisor review of the converged direction before the departure check.
  Rejected: a mandatory direction review — the user chose the narrow cut; it
  adds a fixed round-trip to every exploration including one-sentence
  changes.

- **Companion changes ship in the same commit.** `docs/dev.md`'s section
  "### 1. Explore and grill (`dev-explore`)" gains a sentence describing the
  escalation (the skills-table row is the executor's call);
  `catalog/plugins/dev.json` `version` goes 0.13.0 → 0.14.0. Rejected: docs
  later — every prior `dev` skill change shipped skill, docs, and version
  together (`895129e`). Based on: `AGENTS.md` "Bump that plugin's
  strict-semver descriptor `version` whenever its shipped payload … changes".

## Direction

Three files, one commit, no new mechanism. The skill text is a principle at
the altitude of the surrounding step-4 sentences; the docs sentence mirrors it
in the docs' own voice; the version bump is mechanical.

### Milestone 1: the Claude rendering of `dev-explore` carries the escalation; the Codex rendering is unchanged

After this milestone, `dev-explore` step 4 in the Claude bundle names the
`dev-advisor` skill, the trigger, both outcomes, and the fallback, inside a
target block; the Codex bundle's `dev-explore` does not mention the advisor.
Validation: `npm run build` -> exit 0;
`grep -q dev-advisor dist/claude-plugins/dev/skills/dev-explore/SKILL.md` -> exit 0;
`! grep -qi advisor dist/plugins/dev/skills/dev-explore/SKILL.md` -> exit 0.

### Milestone 2: docs and version follow

After this milestone, `docs/dev.md` describes the escalation in the
`dev-explore` section, and `catalog/plugins/dev.json` carries `0.14.0`.
Validation: `npm run verify` -> exit 0;
`grep -q '"version": "0.14.0"' catalog/plugins/dev.json` -> exit 0;
`grep -qi advisor docs/dev.md` already true today — check instead that the
"### 1. Explore and grill" section mentions the advisor:
`awk '/^### 1\. Explore/{p=1} /^### 2\./{p=0} p' docs/dev.md | grep -qi advisor` -> exit 0.

## Landmines

- Target-block markers must occupy their own lines, cannot nest, and every
  opener needs its closer; the build fails otherwise and
  `test/build.test.mjs:301-325` exercises exactly this. Step 4 already holds
  a `<!-- codex -->` / `<!-- claude -->` pair
  (`plugins/dev/skills/dev-explore/SKILL.md:74-79`); add to the existing
  Claude block or open a new pair beside it, never inside it.
- `dev-advisor`'s "When to call" (`plugins/dev/skills/dev-advisor/SKILL.md:23-39`)
  lists its own general triggers ("before substantive work", "when stuck").
  `dev-explore` must state its narrower trigger itself; pointing at
  `dev-advisor` for the trigger would import "call before substantive work"
  into every exploration.
- `895129e` removed `plugins/dev/agents/advisor.md` on purpose; the memory
  and the docs agree there is no advisor agent definition. Do not recreate
  one.
- No test asserts skill prose, and none should be added: the build tests only
  check rendering mechanics.
- The locally installed `dev` plugin is the 0.13.0 cache; the change is
  visible only after installing from `dist/`. Not part of this plan.
- `package.json` version is the builder release version, bumped by
  `npm version` at release time — not here.

## Scope

In scope:
- `plugins/dev/skills/dev-explore/SKILL.md`
- `docs/dev.md`
- `catalog/plugins/dev.json`

Out of scope:
- `plugins/dev/skills/dev-advisor/SKILL.md` — stays authoritative and unchanged; the rule lives in the caller
- `plugins/dev/skills/dev-write-plan/`, `plugins/dev/skills/dev-execute-plan/` — no behaviour change downstream
- `plugins/dev/agents/` — no advisor agent file
- `test/`, `src/` — rendering mechanics unchanged
- `MARKET_README.md` — does not describe skill internals
- `wiki/plans/README.md` — owned by the planner and orchestrator

## Commands

| Purpose | Command | Expected result |
| --- | --- | --- |
| Unit tests | `npm test` | exit 0 (baseline 20 pass, 0 fail) |
| Tests + real catalog build | `npm run verify` | exit 0 |
| Claude bundle carries the rule | `grep -q dev-advisor dist/claude-plugins/dev/skills/dev-explore/SKILL.md` | exit 0 |
| Codex bundle unchanged | `! grep -qi advisor dist/plugins/dev/skills/dev-explore/SKILL.md` | exit 0 |
| Version bumped | `grep -q '"version": "0.14.0"' catalog/plugins/dev.json` | exit 0 |

No acceptance-tier commands: the project has no runtime environment to drive.

## Done criteria

- [ ] All listed commands pass.
- [ ] In the Claude rendering of `dev-explore`, step 4 states the escalation codebase → advisor → user for technical decisions the code does not settle and the agent cannot recommend confidently; names `dev-advisor`; says a settled answer removes the user question and is cited as evidence; says a remaining trade-off goes to the user with the advisor's view; says the fallback is asking the user; and does not let "don't grill me" read as skipping the advisor.
- [ ] The Codex rendering of `dev-explore` is byte-identical to the one built from `02194c8`.
- [ ] `docs/dev.md`'s `dev-explore` section describes the escalation in one or two sentences.
- [ ] `catalog/plugins/dev.json` version is `0.14.0`.
- [ ] Implementation follows every entry in Decisions & tradeoffs.
- [ ] No out-of-scope files changed.
- [ ] `wiki/plans/README.md` status is updated.

## STOP conditions

- A fact cited under Decisions & tradeoffs no longer holds — in particular, `plugins/dev/skills/dev-explore/SKILL.md:71` no longer contains the codebase-first sentence, or `dev-advisor` has gained a Claude-independent mechanism.
- The outcome requires out-of-scope files.
- A validation command fails twice after one reasonable fix.
- `npm test` fails on the unmodified tree (baseline broken).

## Maintenance notes

- If `dev-advisor` ever changes its model tier or brief contract, `dev-explore`
  needs no edit: it references the skill by name and carries no copy.
- If Codex gains a subagent mechanism, the rule can move out of the Claude
  block into shared text; until then the Codex `dev-explore` must stay silent
  about the advisor.
- The trigger wording ("code and conventions do not settle it, and no
  confident recommendation") is the knob: loosening it toward "every
  technical decision" turns exploration slow; tightening it toward "never"
  makes the rule dead text.
