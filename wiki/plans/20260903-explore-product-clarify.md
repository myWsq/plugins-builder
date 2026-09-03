# Plan 20260903-explore-product-clarify: dev-explore clarifies product behaviour before technical design

> This plan is an outcome contract, not a step-by-step script. Understand the
> requirement and the recorded decisions, then design the implementation
> yourself against the live code. Run milestone validations as you go only if
> you are also the verifier — a delegated executor implements only, and
> verification happens outside its session. Stop on any STOP condition. When
> complete, update this plan in `wiki/plans/README.md`.
>
> Drift check: `git diff --stat ed3d896..HEAD -- plugins/dev/skills/dev-explore plugins/dev/skills/dev-write-plan docs/dev.md catalog/plugins/dev.json plugins/dev/skills/dev-execute-plan/SKILL.md`

## Status

- Priority: P2
- Effort: S
- Risk: LOW
- Depends on: none
- Category: feature
- Execution: self
- Planned at: `ed3d896`, 2026-09-03

## Requirement

`dev-explore` reads the implementation first and then grills "every branch of
the design tree", but every branch it names is an engineering one —
architecture, file boundaries, data flow and API behaviour, error handling,
migration, testing (`plugins/dev/skills/dev-explore/SKILL.md:73`). No stage
asks what the person who consumes the change will see or do. Because the code
is read before the first question, questions drift toward implementation
detail, and product-level decisions — what the feature is, how its consumer
moves through it, what a screen or command holds, which states exist, what is
out of scope — get settled implicitly or not at all, and surface late, at
review.

After this plan: for a request whose change is **perceptible** to whoever
consumes it (a GUI user, a CLI user, an API caller, a skill invoker),
`dev-explore` first clarifies the product behaviour — recon of the existing
product surface only, then grilling on product-level branches, then one
structured confirmation of the product conclusions — and only afterwards runs
the existing technical recon, technical grilling, approach comparison, and
departure check. The technical stage treats the confirmed product conclusions
as settled input. Product conclusions live in the chat report and are carried
into the plan's Requirement section by `dev-write-plan`; no new artifact
exists. A request with no perceptible surface (internal bug fix, refactor,
infrastructure, performance) skips the product stage and behaves exactly as
today. The same orchestrating agent performs both stages; the skill describes
them as two kinds of work, never as two roles.

A correct solution adds a product stage that runs *before* implementation is
read and ends in its own confirmation. An adjacent wrong one bolts product
questions onto the existing technical grilling after the full recon, or
merges the product confirmation into the departure check, or creates a
`dev-spec` skill or a `wiki/specs/` artifact.

## Decisions & tradeoffs

- **Product clarification is a stage inside `dev-explore`, not a new skill.**
  `dev-explore` stays the chain's single entry point. Rejected: a separate
  `dev-spec`/`dev-clarify` skill that `dev-explore` routes to — a second entry
  point plus catalog/docs ceremony, and the owner wants one entry.
  Based on: `docs/dev.md:19` (chain diagram); owner decision, 2026-09-03.

- **Both stages live in `plugins/dev/skills/dev-explore/SKILL.md`; no
  `references/` file.** Rejected: `dev-explore/references/product-clarify.md`
  on the `dev-execute-plan/SKILL.md:79` precedent — that precedent isolates a
  delegation contract that is pasted into a prompt; here nothing is pasted
  anywhere, and a second file would split one workflow. The product stage is
  written as a branch list plus an output shape, and points at the existing
  grilling rules (`plugins/dev/skills/dev-explore/SKILL.md:49-53`) instead of
  restating them, so the file stays readable.

- **One agent, two kinds of work — no persona framing.** The stage is
  described by its inputs and outputs. Wording such as "act as a product
  manager", "PM persona", "switch roles", or "wear the … hat" is excluded.
  Rejected: persona framing — the owner rejected it explicitly ("主 Agent 就一种
  人设, 只是单纯的执行两种不同的工作").

- **Trigger: triage decides, on perceptibility.** The product stage runs when
  the change alters what the consumer of the change sees or does: pages,
  interaction, flow, copy, CLI commands/flags/output, API call shape, skill
  prompt/response. It is skipped when the change has no perceptible surface:
  internal bug fix, refactor, infrastructure, performance. The user may force
  or skip it by saying so; the "don't grill me" opt-out at
  `plugins/dev/skills/dev-explore/SKILL.md:53` applies to this stage too.
  Perceptibility is a dimension orthogonal to the existing triage categories
  at `plugins/dev/skills/dev-explore/SKILL.md:39-43` — a "clear, narrow
  change" can still be perceptible — so the categories stay and are not
  replaced. Rejected: run on every proposal — asks meaningless interaction
  questions on refactors; run only on explicit request — gets forgotten and
  reverts to technical-first.

- **Order: product recon → product grilling → product confirmation →
  technical recon → technical grilling → approaches → departure check.**
  Product recon reads only the product surface — existing routes, pages,
  screens, commands, copy, whatever the consumer currently sees — and does not
  read the implementation; the existing recon list at
  `plugins/dev/skills/dev-explore/SKILL.md:24-33` becomes the technical recon
  and runs after product confirmation. Rejected: full recon first, then
  product grilling — reading implementation before the first question is what
  biases the questions; product grilling with no repository reading — asks
  what the existing product already answers, contradicting
  `plugins/dev/skills/dev-explore/SKILL.md:51`.

- **Product grilling walks these branches**, one question at a time with a
  recommended answer, under the existing grilling rules: target consumer and
  trigger scenario; product form (what it is and is not); interaction flow —
  entry, steps, exit, including failure and cancel paths; UI at **structure
  level only** — layout, components, the empty/loading/error/success states,
  key copy, expressed in prose or ASCII wireframes; scope and non-goals (the
  MVP cut); acceptance from the consumer's point of view (what they can
  observe when done). Rejected: visual-level UI (colour, spacing, motion) —
  belongs to the project's design system and to execution;
  interaction-only, skipping layout — layout disagreements then surface at
  review.

- **Product confirmation is one structured question; the departure check
  stays the last gate.** After product grilling the agent summarizes the
  product conclusions and asks one structured confirmation — same tool
  convention as `plugins/dev/skills/dev-explore/SKILL.md:55-60` — before
  technical recon starts. The departure check
  (`plugins/dev/skills/dev-explore/SKILL.md:93-101`) keeps its three items
  and remains the workflow's last confirmation. Rejected: folding product
  confirmation into the departure check — the owner wants product settled
  before technical work begins; a multi-round chat instead of one question —
  one gate per stage.

- **The technical stage treats product conclusions as settled.** It does not
  re-ask product questions. When technical recon exposes a constraint that
  contradicts a confirmed product conclusion, the agent raises it as one
  question with a recommended resolution and never silently changes the
  product decision. Based on: the same principle in
  `plugins/dev/skills/dev-write-plan/SKILL.md:29`.

- **Product conclusions persist only through the plan's Requirement section.**
  `dev-explore`'s report gains a product-conclusions item (flow, states, UI
  structure, scope, consumer-visible acceptance) next to
  `plugins/dev/skills/dev-explore/SKILL.md:86`; the Requirement guidance in
  the plan template at `plugins/dev/skills/dev-write-plan/SKILL.md:88-91`
  says that for a perceptible change it carries those conclusions. Rejected:
  a `wiki/specs/` artifact — turns read-only `dev-explore` into a writer,
  adds an artifact class, and breaks plan self-containment
  (`plugins/dev/skills/dev-write-plan/SKILL.md:20`, rule 3).

- **`dev-write-plan` direct entry routes perceptible requests to
  `dev-explore`.** The switch rule at
  `plugins/dev/skills/dev-write-plan/SKILL.md:32` is extended: a direct
  request that is perceptible and has no settled product conclusions switches
  to `dev-explore`. Rejected: duplicating the product stage in
  `dev-write-plan` — two copies of one workflow.

- **Description, docs, and catalog name the new behaviour; version 0.12.0.**
  The frontmatter description at `plugins/dev/skills/dev-explore/SKILL.md:3`
  is what the host matches on, so it states that perceptible changes are
  clarified from the consumer's side first. `docs/dev.md:11` and
  `docs/dev.md:26-28` describe the stage and the new order.
  `catalog/plugins/dev.json:7` (`longDescription`) gains a clause;
  `catalog/plugins/dev.json:3` goes 0.11.0 → 0.12.0 — minor, matching the
  precedent of `eaa0053` (0.10.0 → 0.11.0 for new behaviour without removal).

- **Codex parity.** Skills ship to both bundles; the product stage uses the
  same structured-question convention as the existing target blocks at
  `plugins/dev/skills/dev-explore/SKILL.md:55-60` and needs no subagent.
  Rejected: a Claude-only product stage — nothing here is host-specific.

## Direction

### Milestone 1: `dev-explore` describes the product stage

`plugins/dev/skills/dev-explore/SKILL.md` has the updated frontmatter
description; the workflow contains the product stage in the decided order,
with the decided trigger, branch list, confirmation, and the settled-input
rule for the technical stage; the Report section lists product conclusions.
Validation: `npm test` -> exit 0; `npm run build` -> exit 0;
`grep -Eic "persona|act as a|switch roles" plugins/dev/skills/dev-explore/SKILL.md` -> `0`.

### Milestone 2: `dev-write-plan` carries and routes product conclusions

The Requirement guidance in the plan template says a perceptible change's
product conclusions belong there; the direct-entry path switches perceptible
requests without settled product conclusions to `dev-explore`.
Validation: `npm test` -> exit 0.

### Milestone 3: docs and catalog describe the stage; version bumped

`docs/dev.md` skill table row and section 1 describe the product stage and
the new order; `catalog/plugins/dev.json` is 0.12.0 with the longDescription
clause.
Validation: `npm run verify` -> exit 0;
`grep -c '"version": "0.12.0"' dist/claude-plugins/dev/.claude-plugin/plugin.json` -> `1`.

## Landmines

- Target-block syntax is validated at build: an orphaned, inline, or nested
  `<!-- codex -->` / `<!-- claude -->` marker fails `npm test` and
  `npm run build` (`AGENTS.md`, "Skill Markdown may select content…"). Any new
  block must be paired and on its own lines.
- The host running this plan has the plugin installed from cache at
  `~/.claude/plugins/cache/plugins/dev/0.10.0/`; source is at 0.11.0. Edit
  only `plugins/dev/` in this repository, never the cache.
- `docs/dev.md` sits outside the plugin version contract (test "marketplace
  documentation is outside the plugin version contract" in
  `test/build.test.mjs`); the skill edits are what require the bump.
- The engineering-only list at `plugins/dev/skills/dev-explore/SKILL.md:73`
  is the technical stage's list. Leave it engineering-only; product items are
  already confirmed by then.

## Scope

In scope:
- `plugins/dev/skills/dev-explore/SKILL.md`
- `plugins/dev/skills/dev-write-plan/SKILL.md`
- `docs/dev.md`
- `catalog/plugins/dev.json`
- `wiki/plans/README.md` — status only

Out of scope:
- the plan stress-test triage path in `dev-explore` — owner deferred it
- `test/build.test.mjs` — no test asserts skill prose; adding one is unrequested
- `plugins/dev/skills/dev-execute-plan/**`, `plugins/dev/agents/**`,
  `plugins/dev/fragments/**` — untouched by the requirement
- `MARKET_README.md` — its one-line summary stays accurate
- `package.json` version — bumped by `npm version` at release, owner's call

## Commands

| Purpose | Command | Expected result |
| --- | --- | --- |
| Unit tests | `npm test` | exit 0 |
| Build | `npm run build` | exit 0 |
| Verify | `npm run verify` | exit 0 |

No acceptance-tier command: the project has no runtime.

## Done criteria

- [ ] All listed commands pass.
- [ ] In `dev-explore`, a perceptible request triggers product recon → product grilling → one structured product confirmation before any implementation is read; a non-perceptible request follows the previous path unchanged.
- [ ] `dev-explore` contains no persona or role framing for its stages.
- [ ] `dev-explore`'s report lists product conclusions; `dev-write-plan`'s Requirement guidance carries them; `dev-write-plan`'s direct entry routes perceptible, unsettled requests to `dev-explore`.
- [ ] `docs/dev.md` and `catalog/plugins/dev.json` describe the stage; the descriptor and the built `plugin.json` read 0.12.0.
- [ ] No test code is required by this plan (documented, not skipped).
- [ ] Implementation follows every entry in Decisions & tradeoffs.
- [ ] No out-of-scope files changed.
- [ ] `wiki/plans/README.md` status is updated.

## STOP conditions

- A fact cited under Decisions & tradeoffs no longer holds.
- The outcome requires out-of-scope files.
- A validation command fails twice after one reasonable fix.
- A named assumption is false.
- `plugins/dev/skills/dev-explore/SKILL.md` no longer has the six-section workflow (Recon, Triage, Clarify, Compare approaches, Report, Departure check) recorded at `ed3d896`.

## Maintenance notes

The product branch list is the tunable part of this change; adjust it there
rather than growing rules elsewhere. Keep the product stage pointing at the
shared grilling rules instead of copying them. When the plan template's
Requirement guidance changes, keep the sentence that carries product
conclusions, or the stage's output has nowhere to land.
