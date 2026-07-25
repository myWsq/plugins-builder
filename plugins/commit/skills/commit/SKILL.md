---
name: commit
description: Commit and push with a fixed safety floor — stage by name, refuse staged secrets, match the repository's message style. Use when the user asks to commit, save, or push code (e.g. "commit this", "提交代码", "push my changes").
---

# commit

Committing and pushing run the same flow every time: stage only what belongs to this change, refuse to commit secrets, and write a message that explains why.

## The commit flow

<!-- include commit-flow -->

Report the commit message, the hash, and whether it was pushed.
