---
name: commit-push
description: Commit and push the current branch to its upstream, without opening a PR or changing branches. Use when the user asks to commit and push in one step, or says things like "commit and push", "提交并推送", "push this up". Pushes the branch that is already checked out, including the default branch.
---

# commit-push

Commit, then push. Invoking this command is the explicit request to push.

No pull request, no `git switch`, no `git checkout`, no new branch — this pushes whatever branch is already checked out, and the default branch is a legitimate target here. When the change belongs on a pull request instead, use commit-pr.

## 1. Commit

<!-- include commit-flow -->

## 2. Push

`git push`. If the branch has no upstream, `git push -u origin HEAD` to set it.

## 3. Report

The commit message, the hash, and the push destination (remote and branch).
