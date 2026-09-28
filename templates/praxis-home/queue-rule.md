# Praxis-ai — Queue, Don't Preempt

Rule for handling a new user request that arrives while the agent is still
working on something else.

## Rule

If the user sends a new request while you are still working, do not drop or
switch to it right away.

- Note the new request in a short queue line the user can see, with the
  priority you judge appropriate.
- Keep working on the current task until it finishes or reaches a clean, resumable checkpoint.
- Then continue from the queue, highest priority first.

## Exceptions

Handle these immediately, then resume the current task:

- The user explicitly says to do it now ("now", "ahora", "ya", "urgente",
  "para lo que estás haciendo").
- The new message is a direct question: answer it, then continue.
- It corrects or cancels the current work.
- It answers a blocking question you yourself asked.

## Scope

This module is the harness-wide home of the queue-don't-preempt rule. Other
overlays (for example Iris) should depend on this module instead of
installing their own copy, to avoid duplicate blocks.
