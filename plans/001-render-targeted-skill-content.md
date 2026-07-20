# Plan 001: Render target-specific skill content

> This plan is an outcome contract, not a step-by-step script. Understand the
> requirement and the recorded decisions, then design the implementation
> yourself against the live code. Run milestone validations as you go only if
> you are also the verifier. Stop on any STOP condition. When complete, update
> this plan in `plans/README.md`.
>
> Drift check: `git diff --stat de12c51..HEAD -- src/build.mjs test/build.test.mjs README.md AGENTS.md`

## Status

- Priority: P2
- Effort: S
- Risk: LOW
- Depends on: none
- Category: feature
- Execution: self
- Planned at: `de12c51`, 2026-07-20

## Requirement

Canonical skill Markdown must be able to contain shared text plus simple Claude-only and Codex-only blocks while retaining its existing filename. A build must emit only the applicable block content to each target bundle, remove directive markers, preserve unrelated skill files, and reject structurally invalid directives.

## Decisions & tradeoffs

- **Keep canonical filenames unchanged**: directives live directly in existing Markdown such as `SKILL.md`; no template extension or parallel target source tree is introduced. Rejected: `.tmpl` files or complete per-target copies — both add source-layout ceremony and the latter invites drift. Based on: skill trees are currently copied directly from `plugins/<name>/skills/` in `src/build.mjs:293`.
- **Use minimal paired HTML-comment directives**: `<!-- codex -->`/`<!-- /codex -->` and `<!-- claude -->`/`<!-- /claude -->`, with content outside blocks shared. Rejected: a general-purpose template engine — unnecessary dependency and expression surface for two fixed targets.
- **Render Markdown only and copy everything else verbatim**: target directives apply to Markdown throughout a skill tree, including references; scripts and assets are not decoded or transformed. Rejected: rendering arbitrary files — unsafe for binary assets and unnecessary for the agreed Markdown syntax. Based on: current source skills include both `SKILL.md` and Markdown references under `plugins/dev/skills/`.
- **Keep the directive grammar deliberately flat and strict**: nesting, orphan closes, mismatched closes, and unclosed blocks fail the build; known markers must occupy their own line. Rejected: nested conditions — there are only two mutually exclusive targets, so nesting adds ambiguity without capability.
- **Preserve byte identity when no directives exist**: existing skill output remains unchanged unless a Markdown file actually uses target blocks. Rejected: unconditional rewriting — it creates payload churn unrelated to the feature. Based on: `test/build.test.mjs:70` currently asserts both generated skill trees match canonical source.

## Direction

### Milestone 1: Target-aware skill rendering

The compiler emits target-specific Markdown from unchanged canonical filenames, copies non-Markdown skill content unchanged, and reports actionable errors for malformed directives. Validation: `npm test` -> exit 0.

### Milestone 2: Maintainer contract and full verification

Repository documentation describes the directive syntax and release/version implications, and the real catalog still builds deterministically. Validation: `npm run verify` -> exit 0.

## Landmines

- The existing deterministic-build test requires generated skill trees to equal source byte-for-byte (`test/build.test.mjs:70`); that invariant must remain true for source without directives while new fixtures prove intentional divergence.
- The release gate fingerprints Claude and Codex trees independently (`src/check-release.mjs:152`), so rendered differences are already versioned payload and must not be normalized back together.

## Scope

In scope:
- `src/build.mjs`
- `test/build.test.mjs`
- `README.md`
- `AGENTS.md`
- `plans/README.md`
- `plans/001-render-targeted-skill-content.md`

Out of scope:
- `plugins/dev/skills/` — no target-specific payload was requested yet.
- `catalog/plugins/dev.json` — compiler capability alone does not change the currently shipped plugin payload.
- `package.json` and release tags — release preparation was not requested.

## Commands

| Purpose | Command | Expected result |
| --- | --- | --- |
| Unit and safety tests | `npm test` | exit 0 |
| Full repository verification (acceptance) | `npm run verify` | exit 0 and real catalog built |

## Done criteria

- [x] All listed commands pass.
- [x] Shared Markdown appears in both target bundles and each target receives only its matching block content.
- [x] Generated Markdown contains no consumed directive markers.
- [x] Malformed known directives fail with an actionable source-path error.
- [x] Files without directives and non-Markdown skill files remain byte-identical.
- [x] Documentation explains the source syntax and plugin-version consequence of using it.
- [x] No out-of-scope files changed.
- [x] `plans/README.md` status is updated.

## STOP conditions

- A fact cited under Decisions & tradeoffs no longer holds.
- The outcome requires out-of-scope files.
- A validation command fails twice after one reasonable fix.
- Rendering cannot preserve unchanged files byte-for-byte.

## Maintenance notes

Keep this a two-target selection mechanism, not the seed of a general template language. Any future variables, nesting, or additional file types require an explicit compiler contract and tests.
