# Praxis-ai — Context Budget

Context is a binding resource (P4). Instead of a single hard warning
threshold, praxis-ai polls the user once inside a window and defines a small
automated protocol for harness controllers that need to force a handoff.

## Poll window (50-60%)

When context usage is between 50% and 60% of the effective window, at the
next CLEAN point — between tasks, or at a resumable checkpoint; never
mid-task, never mid-edit, and never while a tool call or a subagent result is
pending — ask the user whether to save progress and pause for a compaction.

- Use the native question tool where one exists (`AskUserQuestion` in Claude
  Code); elsewhere, ask as a plain-text question and wait for the answer.
- Ask once per window. If the user declines, do not ask again until a later
  clean point past 60%. This keeps the policy simple: one ask per crossing,
  not a repeated nag inside the same window.
- If usage already exceeds 60% by the time the first clean point is reached,
  poll then — do not skip the ask just because the window was missed while a
  task was in flight.

## On "yes": save progress, then stop

When the user agrees to pause:

1. Save to Engram (`mem_save` / `mem_session_summary` when the harness has
   them available).
2. Save the harness memory (whatever local memory file or state the running
   harness keeps).
3. Save the task documents — for example `odd/tasks/<feature>.md` and its
   Engram mirror — so the next session can reconcile and resume.
4. Decide what to do with any in-flight subagents: either let them finish and
   record their results, or record their state and IDs so they can be
   resumed later. Do not leave a subagent unaccounted for.
5. STOP and wait for the user to run the compaction (for example `/compact`).
   Do not start new work while waiting.

## Context-guard protocol

Some setups run an automated controller — such as Iris, the user's coordinator —
that can force a handoff by sending one of the two literal messages below.
The messages are named after Iris, the controller that emits them, but the
protocol itself applies to any harness session, not only ones running Iris.

- `[IRIS CONTEXT GUARD] prepare-compact handoff=<path>`

  Finish the current step only (do not start a new one), save to Engram,
  write a complete handoff document to `<path>` covering: the goal, current
  state, decisions made, open tasks, in-flight agents, the next step, and
  file locators. Then reply with exactly:

  ```
  COMPACT-READY <path>
  ```

  and nothing else.

- `[IRIS CONTEXT GUARD] restore handoff=<path>`

  Read the handoff document at `<path>`, call `mem_context` (Engram),
  reconcile the restored state against the current session, then reply with
  exactly:

  ```
  CONTEXT-RESTORED
  ```

## CLI surface

`praxis context-usage` surfaces the same poll window from recorded samples:
no notice below 50%, a poll-window notice between 50% and 60% inclusive, and
a past-window notice above 60%. See `presets/balanced.md` for how this
window fits into the default preset.
