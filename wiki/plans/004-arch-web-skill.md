# Plan 004: arch plugin ships arch-web

> This plan is an outcome contract, not a step-by-step script. Understand the
> requirement and the recorded decisions, then design the implementation
> yourself against the live code. Run milestone validations as you go only if
> you are also the verifier — a delegated executor implements only, and
> verification happens outside its session. Stop on any STOP condition. When
> complete, update this plan in `wiki/plans/README.md`.
>
> Drift check: `git diff --stat a37f37c..HEAD -- plugins/arch catalog docs/arch.md`

## Status

- Priority: P2
- Effort: S
- Risk: LOW
- Depends on: wiki/plans/003-arch-plugin-monorepo-skill.md
- Category: feature
- Execution: self
- Planned at: `a37f37c`, 2026-07-26

## Requirement

The `arch` plugin gains its second domain skill, `arch-web`: the owner's frontend
web selection framework, captured in the 2026-07-26 interview and recorded verbatim
under Decisions & tradeoffs. Same stance as `arch-monorepo` (plan 003): a decision
framework — defaults with their reasons, deliberate absences recorded as absences —
not a rigid prescription and not a scaffold script.

Done means: both generated bundles ship `arch/skills/arch-web/SKILL.md`, the arch
catalog descriptor is 0.2.0 and mentions the web domain, `docs/arch.md` lists the
skill, and `npm run verify` passes. A correct solution carries every settled
decision below without inventing extras; adjacent wrong ones would add tooling the
interview never settled (e.g. a testing stack — explicitly rejected), or turn
"deployment is per-project" into a default.

## Decisions & tradeoffs

- **Framework content (settled by interview, do not re-derive or extend)**:
  - Framework: React 19 with the React Compiler enabled.
  - App shape: SPA by default. SSR's performance gains do not justify its very
    high maintenance cost; use it only when explicitly required.
  - Build tool: Vite — community default; `@vitejs/plugin-react` carries the React
    Compiler babel plugin, StyleX has a Vite integration path, and it coexists
    cleanly with the pnpm + turborepo monorepo baseline (`arch-monorepo`).
  - Router: TanStack Router — type-safe routing and search-param state, same
    family as TanStack Query. Accepted cost: younger than React Router.
  - Components & styling: astryx (`facebook/astryx`, Meta's open-source design
    system — verified live 2026-07-26: Beta, MIT, ~10.7k stars, 150+ React
    components authored with StyleX) with StyleX as the styling system for own
    code.
  - State: jotai for cross-page client state; TanStack Query for request state,
    always wrapped in custom hooks rather than inline `useQuery` at call sites.
  - Testing: **no test code at all.** Acceptance is manual testing — a human or an
    agent actually running the app. This is a deliberate discipline, stated
    affirmatively in the skill, not an omission.
  - Deployment: no default — considered per project. Record as a deliberate
    absence (the `arch` "recorded absences" stance, `docs/arch.md`).
- **Skill placement and shape**: `plugins/arch/skills/arch-web/SKILL.md`, sibling
  of `arch-monorepo`, matching its structure and tone (framework sections with
  reasons; trigger-rich frontmatter description covering both "build/set up a web
  app" and selection questions like "前端选型/用什么框架"). Based on:
  `plugins/arch/skills/arch-monorepo/SKILL.md` (plan 003).
- **arch version bump**: `0.1.0` → `0.2.0` in `catalog/plugins/arch.json`; payload
  changes without a strictly greater version fail the release gate (AGENTS.md
  "Version and tag contract"). Update `longDescription`/`defaultPrompt` to name
  the web domain alongside monorepo.
- **Docs**: add an `arch-web` row to the skills table in `docs/arch.md` and a web
  example prompt. `MARKET_README.md`'s arch line is domain-generic ("one skill per
  domain") and needs no change. Docs changes alone need no version bump, but the
  skill payload change already forces one.
- **No dev plugin changes**: this plan touches only arch surfaces.

## Direction

Content + catalog only; the compiler already renders everything under
`plugins/<name>/skills/`. No `src/` or `test/` changes expected — the hardcoded
live-version brittleness was fixed in plan 003 (`test/build.test.mjs` now reads the
dev version from the catalog and uses a `999.0.0` gate fixture).

### Milestone 1: arch-web ships

`plugins/arch/skills/arch-web/SKILL.md` written from the settled decisions;
`catalog/plugins/arch.json` bumped to 0.2.0 with web mentioned; `docs/arch.md`
updated.
Validation: `npm run verify` → exit 0; `dist/claude-plugins/arch/skills/arch-web/SKILL.md`
and `dist/plugins/arch/skills/arch-web/SKILL.md` both exist; `dist/docs/arch.md`
lists arch-web.

## Landmines

- The release-gate test builds current and next from the same live source, so it
  cannot catch a forgotten arch bump against the *published* baseline — the real
  gate runs in CI against `myWsq/plugins@main`. Bump arch here regardless
  (AGENTS.md "Version and tag contract").
- `astryx` is newer than the models' training data; the skill text should carry
  the repo URL (`https://github.com/facebook/astryx`) so future agents resolve it
  instead of "correcting" it to a name they know.

## Scope

In scope:

- `plugins/arch/skills/arch-web/SKILL.md` (new)
- `catalog/plugins/arch.json`
- `docs/arch.md`
- `wiki/plans/**`

Out of scope:

- `plugins/arch/skills/arch-monorepo/**` — settled by plan 003.
- `plugins/dev/**`, `plugins/commit/**`, `catalog/plugins/dev.json`,
  `catalog/plugins/commit.json`, `catalog/marketplace.json` — untouched domains;
  the marketplace plugin list already contains `arch`.
- `src/`, `test/` — no compiler or test behavior changes; if required, STOP.
- `MARKET_README.md` — arch line is domain-generic.
- Release (`npm version`, tags, pushing) — user-initiated.

## Commands

| Purpose | Command | Expected result |
| --- | --- | --- |
| Full verify (tests + real catalog build) | `npm run verify` | exit 0 |

## Done criteria

- [ ] All listed commands pass.
- [ ] Both targets ship `arch/skills/arch-web/SKILL.md`; `dist/docs/arch.md`
      lists arch-web.
- [ ] The skill carries all eight settled decisions — React 19 + Compiler, SPA
      default with the SSR cost rationale, Vite, TanStack Router, astryx + StyleX
      (with repo URL), jotai + TanStack Query wrapped in hooks, no-test-code with
      manual acceptance, deployment as a recorded absence — and nothing the
      interview did not settle.
- [ ] `catalog/plugins/arch.json` is 0.2.0 and names the web domain.
- [ ] Implementation follows every entry in Decisions & tradeoffs.
- [ ] No out-of-scope files changed.
- [ ] `wiki/plans/README.md` status is updated.

## STOP conditions

- A fact cited under Decisions & tradeoffs no longer holds.
- The outcome requires out-of-scope files (notably `src/` or `test/`).
- A validation command fails twice after one reasonable fix.

## Maintenance notes

- The no-test-code stance applies to web application projects governed by
  arch-web — it does not override repo-specific contracts like this builder's own
  test suite.
- When a deployment default finally stabilizes in practice, record it in arch-web
  the same way monorepo exceptions are meant to be recorded: from evidence, not
  ahead of it.
