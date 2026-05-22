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

1. Write the handoff to a file in the **operating system's temporary
   directory** — not the current workspace (it is scratch state, not a
   project artifact). Use the OS temp location (`$TMPDIR` / `/tmp` /
   `%TEMP%`), e.g. a `handoff-<timestamp>.md` file there.

2. The document must contain:

   - **Goal**: one sentence on what the session was trying to achieve.
   - **State**: what is currently in flight (branch name, in-progress
     edits, tests last seen passing or failing, blockers).
   - **Decisions made**: link to ADRs, commits, or PR descriptions
     instead of re-summarising them.
   - **Open questions**: anything the next agent must resolve.
   - **Suggested next steps**: the smallest next action that unblocks
     progress.
   - **Suggested skills**: a section naming which praxis-ai or other
     skills the next session should invoke.

3. Do not duplicate content that already lives in a durable artifact
   (PRDs, plans, ADRs, issues, commits, diffs). Reference by path or
   URL.

4. **Redact sensitive information** — API keys, passwords, tokens, and
   personally identifiable information must never appear in the handoff
   document.

5. If the user passed an argument via `argument-hint`, treat it as the
   description of the next session's focus and shape the document
   accordingly.

6. Surface the handoff path to the user so it can be shared with the
   next agent.

## What goes in, what stays out

In: state, decisions-by-reference, open questions, the smallest next
step.

Out: re-derivations of code that exists, restatements of decisions that
are already in commits or ADRs, speculative future work.

The handoff is a pointer document, not a duplicate of the codebase.
