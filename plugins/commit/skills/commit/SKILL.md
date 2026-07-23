---
name: commit
description: Delegate git commit and push to a cheap subagent. Use when the user asks to commit, save, or push code (e.g. "commit this", "提交代码", "push my changes"). The main model must not run git itself; it delegates the whole stage-and-commit flow to a subagent running on the host's cheapest available model and relays the result.
---

# commit

Committing and pushing are low-difficulty, high-frequency operations. They should not burn tokens on the session's main (most expensive) model. When the user asks to commit or push, your job is a single delegation call plus relaying the outcome — not running git yourself.

## Delegate, don't execute

<!-- include delegate-cheap -->

<!-- claude -->
Use the Agent (Task) tool with `model` set to `haiku` (the cheapest Claude model) to run the flow below.
<!-- /claude -->
<!-- codex -->
Use experimental collab's `spawn_agent` to run the flow below on a cheaper model of the same provider. Collab is beta and off by default, and can only switch models within the same provider. If collab is not enabled, fall back to running the flow inline yourself.
<!-- /codex -->

## The commit flow (subagent, or inline fallback)

<!-- include commit-flow -->

Relay the result (commit message, hash, and whether it was pushed) back to the user.
