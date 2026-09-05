# Plan 20260905-execute-work-packages: dev-execute-plan fans one plan out into concurrent work packages

> This plan is an outcome contract, not a step-by-step script. Understand the
> requirement and the recorded decisions, then design the implementation
> yourself against the live code. Run milestone validations as you go only if
> you are also the verifier — a delegated executor implements only, and
> verification happens outside its session. Stop on any STOP condition. When
> complete, update this plan in `wiki/plans/README.md`.
>
> Drift check: `git diff --stat 1ca934d..HEAD -- plugins/dev/skills/dev-execute-plan plugins/dev/skills/dev-write-plan/SKILL.md docs/dev.md catalog/plugins/dev.json test/build.test.mjs AGENTS.md`

## Status

- Priority: P1
- Effort: M
- Risk: MED
- Depends on: none
- Category: feature
- Execution: self
- Planned at: `1ca934d`, 2026-09-05

## Requirement

In daily use of the `dev` plugin, implementation is never parallelised. The
only concurrency the chain knows is the **plan group**: `dev-write-plan`
decides at planning time to author a contract plan, parallel member plans and
an integration plan, and `dev-execute-plan` runs the members in per-plan
worktrees. That bar is deliberately high and its authoring cost is three or
more plan files, so it does not trigger; a single plan is always dispatched to
exactly one subagent.

The owner wants the parallelism decision to move to execution time and to the
orchestrator: once the plan exists, `dev-execute-plan` judges on its own —
without asking the user — whether the plan's implementation can be fanned out
to several subagents running concurrently, each isolated in its own git
worktree created automatically; a small plan stays with one subagent. The
judgment is guided by principles the orchestrator applies, not by a new
question or a new plan format.

Product conclusions, settled in exploration (the consumer is whoever invokes
`dev-execute-plan`; the perceptible surface is the orchestrator's behaviour and
report):

- After preflight, the orchestrator states in a line or two whether it splits
  the plan into work packages and why. Nothing is asked. An explicit user
  instruction in the conversation — "don't split" or "split this" — is
  honoured over its own judgment.
- When it splits, one subagent per package runs concurrently, each in its own
  worktree and branch cut from the recorded baseline. The orchestrator
  verifies each package as it finishes, merges the passing branches back into
  the current branch one at a time, then runs the plan-level checks and the
  acceptance tier on the merged result.
- A wrong split is the orchestrator's mistake, not the plan's or the
  executor's: when a package turns out to need a sibling's files, or two
  packages collide at merge, the orchestrator falls back to finishing the
  remaining work serially on the merged branch. It never marks the plan
  BLOCKED for that reason.
- Plans that do not decompose behave exactly as today — one subagent, no
  worktree. Self-execution never splits: one orchestrator cannot parallelise
  itself.
- The final report lists the packages, their worktrees and branches, their
  status, and the merge order when a split happened; the plan-group flow and
  its report are unchanged in substance.
- `dev-write-plan` keeps the plan group for requirements whose split needs a
  *designed* boundary (a contract plan reviewed by a human) and, in the
  Direction, states how the milestones depend on each other so the executor
  can read independence off the plan. No new mandatory field, no template
  churn.

When this plan is done: `dev-execute-plan` has a partition step under
delegation, a shared concurrent-execution section that serves both plan-group
members and work packages, verification split into per-package and post-merge
halves, a serial fallback for partition errors, and a report that carries the
packages; `references/delegation.md` defines the package brief, the worktree
hand-off, and self-contained REVISE prompts; `dev-write-plan` frames the group
against the work package and asks for milestone dependencies in prose;
`docs/dev.md` describes the behaviour without over-promising; `dev` is bumped
to 0.16.0; `npm run verify` passes.

An adjacent wrong solution lets the orchestrator explore the code to invent a
split or to design a "contract package" of shared types and stubs, treats a
merge conflict between work packages as a scope violation to BLOCK on, relies
on the host's native subagent worktree isolation without controlling its base
commit, or adds a partition question to the departure check.

## Decisions & tradeoffs

- **The partition is read off the plan, never discovered in the code**: the
  orchestrator splits only along milestones the plan declares independent, or
  whose independence is evident from the plan text itself — the outcome and
  validation of one milestone do not need another's output — and whose Scope
  paths do not overlap. It does not explore the repository to find a split;
  when the plan leaves independence unstated and unclear, it dispatches one
  package. Rejected: letting the orchestrator investigate the code for
  parallelisable seams — it would spend the context that delegation exists
  to protect on work the planner already did with exploration context.
  Based on: `plugins/dev/skills/dev-execute-plan/SKILL.md:37` (delegation
  keeps the orchestrator's context free), `:57-62` (preflight reads the plan
  and runs the drift check, nothing more).
- **No contract package at execution time**: a package is dispatched only when
  its milestone validation can pass on baseline plus its own work. A plan
  whose milestones must first produce a shared artefact (types, schema, stubs,
  registration) for others to build on is not fanned out; it runs as one
  package, and a requirement that needs such a boundary designed is what the
  plan group is for. Rejected: a serial contract package that runs first and
  becomes the fan-out baseline — deciding what the shared surface is and
  where it lives is implementation design the model reserves for the
  executor, it would be reviewed by nobody before N siblings build on it, and
  under Rule 8 it is unverified at fan-out time. Based on:
  `plugins/dev/skills/dev-execute-plan/SKILL.md:10`, `:21`;
  `plugins/dev/skills/dev-write-plan/SKILL.md:35-37`, `:48`.
- **A package's file set is a partition of the plan's in-scope paths**: each
  package owns path prefixes or globs; every in-scope path belongs to exactly
  one package and none is left over, so a newly created file is decidable.
  Shared surfaces (package manifests and lockfiles, route/DI registration,
  barrel indexes, shared types and config, `wiki/plans/README.md`) that more
  than one package would need mean the milestones are not independent — no
  split. Rejected: explicit file lists per package — new files fall outside
  every list and the scope check becomes undecidable. Based on:
  `plugins/dev/skills/dev-execute-plan/SKILL.md:89`;
  `plugins/dev/skills/dev-write-plan/SKILL.md:35`.
- **A package is a slice of behaviour together with its tests**: no
  tests-only package, and no cross-package stubs — a stub either lands in a
  sibling's files (merge conflict) or survives the merge. Each package's
  milestone validation is run in its own worktree and proves baseline plus
  that package only; the plan's Commands, done criteria and acceptance run
  after merge on the main worktree. A package whose validation cannot pass
  without a sibling's output was never independent: that is a partition
  error, not a REVISE. Rejected: treating a green plan-level suite in each
  worktree as the per-package bar — the plan's commands are repository-level
  and a sibling's half is missing by construction. Based on:
  `plugins/dev/skills/dev-write-plan/SKILL.md:107-110`;
  `wiki/plans/20260905-drop-codex-target.md` Milestones 1 and 3, where
  `npm test` validates code another milestone changes.
- **Real bulk includes the per-worktree overhead**: a fresh worktree has no
  installed dependencies, and per-package validation plus a separate review
  cost the orchestrator context; a package must outweigh dispatch, install,
  review and merge, and when in doubt the orchestrator dispatches one
  package. Before fanning out it runs the plan's milestone validation
  commands once on the baseline, so a red baseline is not misread N times.
  Rejected: a numeric threshold (files, milestones) — the owner asked for
  principles the orchestrator applies, not a rule.
- **A wrong partition falls back to serial, it never BLOCKs**: three tiers of
  out-of-scope. A file outside the plan's Scope is the existing STOP/BLOCK. A
  file inside the plan's Scope but owned by a sibling package is a partition
  error: the executor stops and reports the file and the reason, editing and
  stubbing nothing; the orchestrator verifies and merges the packages that
  passed, then dispatches the remaining work as one serial dispatch on the
  merged branch in the main worktree, handing it the package brief and the
  abandoned branch name for reference. A merge conflict between work packages
  takes the same fallback (abort the merge, re-implement that package's
  outcomes serially on the merged result). Under a plan group the existing
  ruling stands: the planner drew the scopes with exploration context, so a
  conflict there is evidence of a scope violation and goes to REVISE or
  BLOCK. Rejected: REVISE to the package — it cannot fix files it does not
  own; also rejected: BLOCK — the plan and the executor did nothing wrong.
  Based on: `plugins/dev/skills/dev-execute-plan/SKILL.md:107-109`, `:138`,
  `:148`.
- **Worktrees are created by the orchestrator from the baseline SHA, not by
  the host's native subagent isolation**: `git worktree add
  .claude/worktrees/<plan-id>--<package> -b plan/<plan-id>/<package>
  <baseline>`, after making sure `.claude/worktrees/` is ignored (check with
  `git check-ignore -q`; if not, append it to the local `.git/info/exclude`,
  never to the tracked `.gitignore`). The package prompt names the absolute
  worktree path and branch and instructs the executor to switch into it as
  its first action using the host's enter-worktree tool when one exists,
  otherwise to address every file and every command through that path; its
  report opens with `git rev-parse --show-toplevel` and `--abbrev-ref HEAD`,
  which the orchestrator checks against `git worktree list` before trusting
  the branch. Native isolation is acceptable only when the host branches it
  from the baseline and the path and branch are known. Rejected: preferring
  Claude Code's `Agent` `isolation: "worktree"` — per the official docs it
  branches from the repository's default branch unless `worktree.baseRef` is
  `head`, so an unpushed local baseline (this repository's normal state
  between releases) is silently missing from the package; the parent is not
  told the path or branch; and a worktree under `.claude/worktrees/` that is
  not excluded shows up as an untracked directory and breaks every
  clean-tree check. Also rejected: a path outside the repository — a host
  enter-worktree tool may prompt or refuse outside `.claude/worktrees/`, and
  an executor that fails to switch keeps writing into the main checkout.
  Based on: `plugins/dev/skills/dev-execute-plan/SKILL.md:14`, `:87`,
  `:134`; `.gitignore` and `.git/info/exclude` of this repository, where
  `git check-ignore -v .claude/worktrees/x` reports nothing ignored; Claude
  Code docs `worktrees.md` ("Choose the base branch", "Isolate subagents with
  worktrees") and `tools-reference.md` (EnterWorktree/ExitWorktree scope).
- **REVISE prompts are self-contained about location**: every REVISE to a
  package names the absolute worktree path and branch, and the orchestrator
  confirms the new commits landed on that branch, because a continued
  subagent is not guaranteed to resume in the same worktree. Two REVISE
  rounds per package; the post-merge serial dispatch has its own two rounds.
  Rejected: relying on host continuation to preserve the working directory —
  undocumented. Based on:
  `plugins/dev/skills/dev-execute-plan/references/delegation.md:44-51`.
- **One shared "Concurrent execution" section replaces "Parallel group
  execution"**: two triggers — members of a plan group, work packages of one
  plan — share isolation, monitoring, per-unit verification, sequential
  merge, post-merge checks and cleanup; only the trigger and the
  merge-conflict ruling differ. `git worktree remove` and `git branch -d`
  run at close; nothing is left for a lazy sweep. The "Choose execution mode"
  section keeps its name because `dev-explore` and `dev-write-plan` cite it
  by name; `SKILL.md:8` and `docs/dev.md:59` are updated to the new section
  name. Rule 4's "no merge" gains a carve-out for merging this run's own
  package or member branches into the current branch. Rejected: a second
  parallel section duplicating the group mechanics — two copies drift.
  Based on: `plugins/dev/skills/dev-execute-plan/SKILL.md:8`, `:17`,
  `:130-141`; `plugins/dev/skills/dev-explore/SKILL.md:101`;
  `plugins/dev/skills/dev-write-plan/SKILL.md:27`.
- **Post-merge coherence review is targeted, not a full re-read**: after the
  last merge the orchestrator reads `git diff --stat <baseline>..HEAD`, the
  packages' reported key design choices, and looks for duplicated helpers,
  inconsistent naming and mismatched conventions across packages; each
  package diff has already had the full code review. Rejected: re-reading the
  whole combined diff — it spends the orchestrator's context twice.
- **dev-write-plan frames the group against the work package and asks for
  milestone dependencies in prose**: a plan group is for a split that needs a
  contract plan — a designed, human-reviewed boundary; independent
  milestones need no group, `dev-execute-plan` fans them out at dispatch. The
  Direction guidance asks the planner to state which milestone's outcome or
  validation depends on which, and to say so when they are independent,
  because the executor reads independence off the plan. The three criteria
  and the contract-first shape stay. No new template field. Rejected: a
  `Parallel:` status field or per-milestone tag — the owner rejects fixed
  formats where judgment does the job; also rejected: dropping the plan
  group — it still covers the case the work package must not. Based on:
  `plugins/dev/skills/dev-write-plan/SKILL.md:31-48`, `:104-110`.
- **No change to dev-explore**: the departure check asks nothing about
  partitioning; the decision is the orchestrator's. Based on:
  `plugins/dev/skills/dev-explore/SKILL.md:96-104`.
- **docs/dev.md sets expectations honestly**: the mechanism removes the
  authoring cost of a plan group for plans whose milestones are independent;
  it does not discover parallelism the planner could not see, and most
  single-requirement plans stay one package. `dev` is bumped 0.15.1 →
  0.16.0 (new behaviour, minor). `npm version` is the owner's release step
  and is not run. Based on: `AGENTS.md:95`.

## Direction

Prose changes to four Markdown files plus a version bump. The tests assert
only that shipped skills carry no retired markers or unexpanded includes
(`test/build.test.mjs:171-176`), so no test changes are expected.

### Milestone 1: dev-execute-plan partitions, isolates, verifies in two halves and falls back

`plugins/dev/skills/dev-execute-plan/SKILL.md` has: a partition step between
Preflight and Execute, delegation only, applying the decisions above and
stating the split and its reason; Execute and Verify covering packages
(per-package checks in the package worktree, plan-level checks and acceptance
after merge); Decide with per-package REVISE accounting and the serial
fallback; a Close report carrying packages, worktrees, branches, status and
merge order; a "Concurrent execution" section serving both triggers with the
worktree creation, exclusion check, hand-off, cleanup and the two
merge-conflict rulings; Rule 4's carve-out; Stop conditions that distinguish
the plan's scope from a sibling's files. `references/delegation.md` has the
package brief (owned milestones and outcomes, owned paths, sibling one-liners,
worktree path and branch with the switch-in instruction, the three-tier rule,
the report's opening lines), the generalised concurrent dispatch and
monitoring text, and the self-contained REVISE prompt. Validation:
`grep -n 'Concurrent execution' plugins/dev/skills/dev-execute-plan/SKILL.md` -> at least two hits (heading and the reference at the top);
`grep -c 'Parallel group execution' plugins/dev/skills/dev-execute-plan/SKILL.md` -> 0;
`grep -n 'Choose execution mode' plugins/dev/skills/dev-execute-plan/SKILL.md` -> the heading is still present.

### Milestone 2: dev-write-plan and docs describe the boundary

`plugins/dev/skills/dev-write-plan/SKILL.md` step 2 and Direction guidance are
updated per Decisions; `docs/dev.md` describes work packages in the skill
table, section 2's group paragraph and section 3, using the new section name.
Validation: `grep -n 'work package' plugins/dev/skills/dev-write-plan/SKILL.md docs/dev.md` -> hits in both files;
`grep -c 'Parallel group execution' docs/dev.md` -> 0.

### Milestone 3: the bundle builds with the bumped version

`catalog/plugins/dev.json` version is 0.16.0. Validation: `npm run verify` ->
exit 0; `node -e 'const m=require("./dist/plugins/dev/.claude-plugin/plugin.json");process.exit(m.version==="0.16.0"?0:1)'` -> exit 0.

## Landmines

- `plugins/dev/skills/dev-execute-plan/SKILL.md:8` names the parallel section
  by its heading; `docs/dev.md:59` says "parallel group". Renaming the section
  without updating both leaves dangling references.
- `plugins/dev/skills/dev-explore/SKILL.md:101` and
  `plugins/dev/skills/dev-write-plan/SKILL.md:27` locate "Choose execution
  mode" by name — do not rename that heading.
- `plugins/dev/skills/dev-execute-plan/SKILL.md:17` (Rule 4) forbids merging;
  the group flow at `:138` already merges. The new section makes merging
  routine, so the rule needs the carve-out or the skill contradicts itself.
- `plugins/dev/skills/dev-execute-plan/SKILL.md:148` and the STOP template at
  `plugins/dev/skills/dev-write-plan/SKILL.md:158` say "out-of-scope files";
  under work packages that phrase must mean the plan's Scope, not the
  package's file set.
- The executor preface at `references/delegation.md:15` says "Change only
  in-scope files"; a package brief narrows it and adds the stop-and-report
  rule — the brief must say it overrides the preface's scope sentence.
- Claude Code's `EnterWorktree` is unavailable to subagents dispatched with
  `isolation: "worktree"` and, for other agents, accepts `path` under
  `.claude/worktrees/` without a prompt; a path elsewhere may prompt. Keep
  the worktrees under `.claude/worktrees/`.

## Scope

In scope:
- `plugins/dev/skills/dev-execute-plan/SKILL.md`
- `plugins/dev/skills/dev-execute-plan/references/delegation.md`
- `plugins/dev/skills/dev-write-plan/SKILL.md`
- `docs/dev.md`
- `catalog/plugins/dev.json` (version only)
- `wiki/plans/README.md` (index row and status)

Out of scope:
- `plugins/dev/skills/dev-explore/SKILL.md` — the departure check is
  unchanged by decision.
- `plugins/dev/skills/dev-advisor/SKILL.md`, `plugins/dev/agents/*` — no
  behaviour change.
- `src/`, `test/` — no compiler or test behaviour changes; tests do not
  assert skill prose.
- `package.json` — `npm version` is the owner's release step.
- `.gitignore` — the worktree exclusion is a local `.git/info/exclude` entry
  written at execution time by the orchestrator, not a tracked change.

## Commands

| Purpose | Command | Expected result |
| --- | --- | --- |
| Unit tests | `npm test` | exit 0 |
| Verify (tests + real build) | `npm run verify` | exit 0 |
| Section renamed everywhere | `grep -rn 'Parallel group execution' plugins/dev docs/dev.md` | no output, exit 1 |
| Canonical heading kept | `grep -n '^### 2\. Choose execution mode' plugins/dev/skills/dev-execute-plan/SKILL.md` | one hit |
| Bundle version | `node -e 'const m=require("./dist/plugins/dev/.claude-plugin/plugin.json");process.exit(m.version==="0.16.0"?0:1)'` | exit 0 |

## Done criteria

- [ ] All listed commands pass.
- [ ] `dev-execute-plan` partitions only along plan-declared or plan-evident independent milestones with disjoint Scope paths, dispatches one package by default, states the split and its reason, and asks nothing.
- [ ] Work packages run in orchestrator-created worktrees under `.claude/worktrees/` cut from the baseline SHA, with the exclusion check, the switch-in instruction, and the report's opening lines defined.
- [ ] Verification is split: per-package checks in the package worktree; plan commands, done criteria, targeted coherence review and acceptance after merge on the main worktree.
- [ ] A partition error or a work-package merge conflict falls back to a serial dispatch on the merged branch; a plan-group conflict keeps the REVISE/BLOCK ruling.
- [ ] REVISE prompts to a package name the worktree path and branch; two rounds per package, two for the serial fallback.
- [ ] `dev-write-plan` frames the plan group as the designed-boundary case and asks for milestone dependencies in prose, with no new template field.
- [ ] `docs/dev.md` describes work packages and the honest expectation.
- [ ] `catalog/plugins/dev.json` is 0.16.0.
- [ ] Implementation follows every entry in Decisions & tradeoffs.
- [ ] No out-of-scope files changed.
- [ ] `wiki/plans/README.md` status is updated.

## STOP conditions

- A fact cited under Decisions & tradeoffs no longer holds.
- The outcome requires out-of-scope files.
- A validation command fails twice after one reasonable fix.
- A named assumption is false.

## Maintenance notes

- The partition rests on what the plan says about milestone independence. If
  fan-out rarely triggers, look at the plans' Direction sections before
  loosening the criteria: the orchestrator is not meant to find seams the
  planner did not record.
- If Claude Code's native subagent isolation ever branches from the current
  HEAD by default and reports the worktree path and branch, revisit the
  explicit-creation decision; until then the orchestrator owns the worktrees.
- The three-tier out-of-scope rule is the hinge that keeps a wrong split from
  becoming a BLOCK; keep the plan's Scope and a package's file set distinct
  in every sentence that mentions scope.
