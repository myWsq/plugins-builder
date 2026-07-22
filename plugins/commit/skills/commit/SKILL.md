---
name: commit
description: Delegate git commit and push to a cheap subagent. Use when the user asks to commit, save, or push code (e.g. "commit this", "提交代码", "push my changes"). The main model must not run git itself; it delegates the whole stage-and-commit flow to a subagent running on the host's cheapest available model and relays the result.
---

# commit

Committing and pushing are low-difficulty, high-frequency operations. They should not burn tokens on the session's main (most expensive) model. When the user asks to commit or push, your job is a single delegation call plus relaying the outcome — not running git yourself.

## Delegate, don't execute

If the host exposes a subagent-spawning capability, you MUST delegate the entire commit flow to a subagent running on the host's cheapest available model. Do not run `git add`, `git commit`, or `git push` yourself. Only when the host has no such capability do you fall back to running the flow inline, following the exact same rules below.

The delegation prompt MUST include a one- or two-sentence summary of the intent behind this change — why it was made, drawn from the current session — and instruct the subagent to weave that intent into the commit message. Without it the subagent has no session context and the message degrades into a diff paraphrase; the intent summary is the one thing that keeps a cheap-model message useful.

<!-- claude -->
Use the Agent (Task) tool with `model` set to `haiku` (the cheapest Claude model) to run the flow below.
<!-- /claude -->
<!-- codex -->
Use experimental collab's `spawn_agent` to run the flow below on a cheaper model of the same provider. Collab is beta and off by default, and can only switch models within the same provider. If collab is not enabled, fall back to running the flow inline yourself.
<!-- /codex -->

## The commit flow (subagent, or inline fallback)

1. Inspect `git status` and `git diff` to understand what changed.
2. Stage only the changes related to this intent. Never `git add -A` unrelated files.
3. Before committing, verify the staged content contains no secrets — `.env` files, private keys, credential files, tokens. If any are staged, stop and report instead of committing.
4. Write a Conventional Commits message (`feat:`, `fix:`, `docs:`, …) whose body reflects the provided intent summary.
5. Commit. Never use `git commit --no-verify`; let hooks run.
6. Push only when the user explicitly asked to push — default to commit-only. Never use `git push --force`.

Relay the result (commit message, hash, and whether it was pushed) back to the user.
