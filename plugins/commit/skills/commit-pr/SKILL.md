---
name: commit-pr
description: Delegate the full commit → push → pull-request flow to a cheap subagent. Use when the user asks to open a PR, ship changes as a pull request, or says things like "open a PR", "commit and open a PR", "提交并开 PR". The main model must not run git or gh itself; it delegates the whole flow to a subagent running on the host's cheapest available model and relays the PR URL.
---

# commit-pr

The full ship-it flow — branch, commit, push, open a pull request — is mechanical work that should not burn tokens on the session's main (most expensive) model. Invoking this command is the explicit request to push and open a PR.

## Delegate, don't execute

<!-- include delegate-cheap -->

<!-- claude -->
Use the Agent (Task) tool with `model` set to `haiku` (the cheapest Claude model) to run the flow below.
<!-- /claude -->
<!-- codex -->
Use experimental collab's `spawn_agent` to run the flow below on a cheaper model of the same provider. Collab is beta and off by default, and can only switch models within the same provider. If collab is not enabled, fall back to running the flow inline yourself.
<!-- /codex -->

## The flow (subagent, or inline fallback)

If currently on the default branch (`main`/`master`), create a descriptively named branch before committing — never commit directly to the default branch in this flow.

Then commit:

<!-- include commit-flow -->

Then publish:

1. Push the branch with `-u` to set the upstream. Never `git push --force`.
2. Open the pull request with `gh pr create`, using a HEREDOC body containing a `## Summary` bullet list that reflects the intent summary and a `## Test plan` checklist.
3. Relay the PR URL, the commit message, and the branch name back to the user.
