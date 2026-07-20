## Codex prerequisite

Before starting, confirm that `request_user_input` is available in the current tool list. When it
is available, prefer it for every question that can be represented as structured choices.

If it is unavailable, stop and tell the user to run:

    codex features enable default_mode_request_user_input

Then ask them to restart Codex or open a new session. Do not silently replace structured questions
with guessed answers or a plain-text fallback.
