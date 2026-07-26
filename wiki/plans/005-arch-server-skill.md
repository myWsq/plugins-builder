# Plan 005: arch plugin ships arch-server

> This plan is an outcome contract, not a step-by-step script. Understand the
> requirement and the recorded decisions, then design the implementation
> yourself against the live code. Run milestone validations as you go only if
> you are also the verifier — a delegated executor implements only, and
> verification happens outside its session. Stop on any STOP condition. When
> complete, update this plan in `wiki/plans/README.md`.
>
> Drift check: `git diff --stat a89838e..HEAD -- plugins/arch catalog docs/arch.md`

## Status

- Priority: P2
- Effort: S
- Risk: LOW
- Depends on: wiki/plans/004-arch-web-skill.md
- Category: feature
- Execution: self
- Planned at: `a89838e`, 2026-07-26

## Requirement

The `arch` plugin gains its third domain skill, `arch-server`: the owner's
server-side selection framework, captured in the 2026-07-26 interview and recorded
verbatim under Decisions & tradeoffs. Same stance as its siblings: decision
framework — defaults with reasons, deliberate absences recorded as absences.

Done means: both generated bundles ship `arch/skills/arch-server/SKILL.md`, the
arch descriptor is 0.3.0 and names the server domain, `docs/arch.md` lists the
skill, and `npm run verify` passes. A correct solution carries every settled
decision and defers RavenJS teaching to the `raven-use` skill; adjacent wrong ones
would re-teach RavenJS APIs inside arch-server (duplicating knowledge that lives in
the framework repo), swap RavenJS for a framework the model knows better, add unit
tests to the testing discipline, or fill the deliberate absences with defaults.

## Decisions & tradeoffs

- **Framework content (settled by interview, do not re-derive or extend)**:
  - Runtime: Node (RavenJS requires >=20) by default. Bun only when the project
    has a measured performance or cold-start requirement *and* all dependencies
    are Bun-compatible. No other switch conditions.
  - Framework: RavenJS (`https://github.com/myWsq/RavenJS`), the owner's
    self-built AI-native web framework — Hono engine, contract-first with
    serializable contracts, Standard Schema validation, ambient state DI
    (`AppState`/`RequestState`), plugin lifecycle, self-built OpenAPI export;
    ships as npm package `@raven.js/core` with `hono` as peer dependency; targets
    Node/Bun/Deno server-side, explicitly not edge/Cloudflare Workers. Verified
    against the live repo README 2026-07-26 (`~/Workspace/RavenJS/README.md`).
  - RavenJS knowledge boundary: agents learn and write RavenJS through its
    self-contained `raven-use` skill, installed via `npx skills add myWsq/RavenJS`
    (or copied from the repo's `skills/`). arch-server records the *selection* and
    points there; it must not restate the framework's API or teaching material —
    single source of knowledge, same rationale as the plugin's own docs split.
  - API shape: REST as the general default, adjusted per project needs.
  - Contract path to the frontend: generate a typed TS client from the RavenJS
    OpenAPI export (e.g. openapi-ts / openapi-fetch family); the arch-web TanStack
    Query custom hooks wrap that generated client — types end to end. Rejected:
    hand-written fetch layers — contract drift relies on discipline.
  - Database: Postgres + Drizzle by default.
  - Testing: **E2E black-box only, no unit tests.** Run the real service with real
    dependencies (real Postgres via local docker or a disposable database), hit it
    over HTTP from outside, mock nothing. **Blind-testing discipline**: whoever
    writes or runs tests — human or agent — works only from test cases and the
    API contract (OpenAPI); reading the implementation code is forbidden. The
    contract is the single source of truth for expected behavior.
  - Deliberate absences, recorded as absences: auth (per project), deployment
    (per project), background jobs and caching (no default yet). Same "from
    evidence, not ahead of it" stance as the sibling skills.
- **Skill placement and shape**: `plugins/arch/skills/arch-server/SKILL.md`,
  sibling of `arch-web`, matching its structure and tone; trigger-rich frontmatter
  covering both building ("build an API/backend", "新建服务端项目") and selection
  questions ("服务端选型", "用什么框架/数据库", "怎么写测试").
- **arch version bump**: `0.2.0` → `0.3.0`; payload changes require a strictly
  greater version (AGENTS.md "Version and tag contract"). Update
  `longDescription`, `keywords`, `defaultPrompt` to cover the server domain and
  drop the "further domains such as server" forward reference.
- **Docs**: add the `arch-server` row and example prompts to `docs/arch.md`.
  `MARKET_README.md` stays domain-generic — no change.
- **Builder release is out of scope**: v0.6.0 already shipped; the user requests
  releases explicitly. This plan ends at committed, verified source.

## Direction

Content + catalog only; no `src/` or `test/` changes expected.

### Milestone 1: arch-server ships

`plugins/arch/skills/arch-server/SKILL.md` written from the settled decisions;
`catalog/plugins/arch.json` bumped to 0.3.0 naming the server domain;
`docs/arch.md` updated.
Validation: `npm run verify` → exit 0; `dist/claude-plugins/arch/skills/arch-server/SKILL.md`
and `dist/plugins/arch/skills/arch-server/SKILL.md` both exist; `dist/docs/arch.md`
lists arch-server.

## Landmines

- RavenJS is the owner's own framework and newer than model training data; the
  skill must carry the repo URL and the `raven-use` install command so future
  agents resolve it instead of substituting Express/Fastify/Hono-direct.
- The blind-testing rule is easy to water down in wording ("prefer not to read the
  code"). It is a hard rule: tests are written and judged against the contract
  only. Keep the wording absolute.
- arch-web's testing stance (no tests at all) and arch-server's (E2E only) differ
  by design — do not "harmonize" them in either skill or in `docs/arch.md`.

## Scope

In scope:

- `plugins/arch/skills/arch-server/SKILL.md` (new)
- `catalog/plugins/arch.json`
- `docs/arch.md`
- `wiki/plans/**`

Out of scope:

- `plugins/arch/skills/arch-monorepo/**`, `plugins/arch/skills/arch-web/**` —
  settled by plans 003/004.
- `plugins/dev/**`, `plugins/commit/**`, other catalog descriptors,
  `catalog/marketplace.json`, `MARKET_README.md` — untouched.
- `src/`, `test/` — if required, STOP.
- Release (`npm version`, tags, pushing) — user-initiated.
- The RavenJS repository itself.

## Commands

| Purpose | Command | Expected result |
| --- | --- | --- |
| Full verify (tests + real catalog build) | `npm run verify` | exit 0 |

## Done criteria

- [ ] All listed commands pass.
- [ ] Both targets ship `arch/skills/arch-server/SKILL.md`; `dist/docs/arch.md`
      lists arch-server.
- [ ] The skill carries every settled decision — Node default with the two-part
      Bun condition, RavenJS with repo URL + raven-use pointer and no API
      re-teaching, REST default, OpenAPI→typed TS client path naming the arch-web
      hook layer, Postgres + Drizzle, E2E-black-box-only with real deps and the
      absolute blind-testing rule, three recorded absences — and nothing more.
- [ ] `catalog/plugins/arch.json` is 0.3.0 and names the server domain.
- [ ] Implementation follows every entry in Decisions & tradeoffs.
- [ ] No out-of-scope files changed.
- [ ] `wiki/plans/README.md` status is updated.

## STOP conditions

- A fact cited under Decisions & tradeoffs no longer holds.
- The outcome requires out-of-scope files (notably `src/` or `test/`).
- A validation command fails twice after one reasonable fix.

## Maintenance notes

- When RavenJS's skill install path or package name changes, arch-server's pointer
  is the only place in this marketplace that needs updating — by design.
- Auth, deployment, and jobs/caching defaults get written here when practice
  settles them, not before.
