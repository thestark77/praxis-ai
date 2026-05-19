---
name: handoff
description: Compact the current conversation into a handoff document so a fresh agent can pick up the work. Use when the user invokes /handoff or asks to "hand off", "pass this off", "summarise for the next agent".
invocation: explicit
argument-hint: "What will the next session be used for?"
---

# handoff — Mechanism

Write a handoff document that lets a fresh agent continue the work
without rebuilding context from scratch.

## Procedure

1. Generate a temporary path:

   ```
   mktemp -t handoff-XXXXXX.md
   ```

   Read the file before writing to it (the temp file already exists and
   may contain a placeholder).

2. Write the handoff into that path. The document must contain:

   - **Goal**: one sentence on what the session was trying to achieve.
   - **State**: what is currently in flight (branch name, in-progress
     edits, tests last seen passing or failing, blockers).
   - **Decisions made**: link to ADRs, commits, or PR descriptions
     instead of re-summarising them.
   - **Open questions**: anything the next agent must resolve.
   - **Suggested next steps**: the smallest next action that unblocks
     progress.
   - **Suggested skills**: which praxis-ai or other skills the next
     session is likely to need.

3. Do not duplicate content that already lives in a durable artifact
   (PRDs, plans, ADRs, issues, commits, diffs). Reference by path or
   URL.

4. If the user passed an argument via `argument-hint`, treat it as the
   description of the next session's focus and shape the document
   accordingly.

5. Surface the handoff path to the user so it can be shared with the
   next agent.

## What goes in, what stays out

In: state, decisions-by-reference, open questions, the smallest next
step.

Out: re-derivations of code that exists, restatements of decisions that
are already in commits or ADRs, speculative future work.

The handoff is a pointer document, not a duplicate of the codebase.
