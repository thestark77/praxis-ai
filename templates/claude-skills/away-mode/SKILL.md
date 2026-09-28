---
name: away-mode
description: Prepare this session to keep working unattended while the user is away (asleep, running an errand). Triggers on "away mode", "modo independiente", "me voy a dormir", or the explicit /away-mode command. Invoke again with "back" or "volví" to close out away mode on return. Never auto-invoked — the user must ask for it.
invocation: explicit
disable-model-invocation: true
argument-hint: "(blank to activate) | check | back | volví"
praxis-native: true
---

# away-mode — Mechanism

A phase-marking skill, not a semantic-intent one (per
`~/.praxis/skill-invocation-policy.md`): it never fires on its own, only on
an explicit invocation naming one of its triggers or `/away-mode`. It
prepares THIS session to keep working while the user is unreachable, and
closes that state out cleanly when they return.

## Dry run

Invoke with the `check` argument to run **only step 1a** (readiness checks)
and print the readiness report. Step 1a is read-only and has no side
effects: with `check`, run ONLY step 1a, print the readiness report, then
STOP — no step 1b activation, no `AskUserQuestion`, no writes to Engram or
the task document, and none of steps 2-6 run. Use this to preview what
away mode would do before committing to it.

## Step 1a — Readiness checks (read-only)

Run for THIS session only. Nothing in this step changes any state — it
only detects and reports.

1. **Detect tools.** Every readiness tool below is optional. Detect each
   one with `command -v <tool>` first; if it is missing, report that in the
   readiness summary and continue with the rest of the procedure — a
   missing tool must never fail the whole skill.

2. **Herdr.** Unattended auto-resume and the context guard both need to type
   into this session's pane, which only works inside Herdr. Check
   `HERDR_PANE_ID`: if unset, warn the user that auto-resume and the context
   guard cannot type into this session, and continue with the rest of the
   checks anyway.

3. **cc-flags — read current state.** Usage:
   `cc-flags [-h] target [{auto_compact,auto_resume}] [{on,off}]`, where
   `target` is the Herdr pane id, the session name, or the Claude session
   id. Read current state first: `cc-flags <target>` with no flag, if it
   prints state. Do not turn anything on here — that is step 1b. If
   `cc-flags` is not on PATH, report it missing and continue.

4. **Account limits.** Run `cc-status --json --session <id>` (and
   `--all` for the full picture) and summarize remaining capacity in the
   readiness report. If another account is available, note that
   `cc-switch` / auto-switch exists as an option — never switch without the
   user's yes, even overnight; an account switch is a live, consequential
   change the user should make deliberately, and reporting its
   availability here does not switch anything.

Report the readiness summary: which tools were found, which were missing
and what that means for this session, and the current cc-flags state.

## Step 1b — Activation

Only reached on a plain (non-`check`) invocation, after step 1a's report.

Before changing any switch below, record its prior value in the task
document and Engram — the exact state it was in before this step touched
it — so Step 6 can restore it exactly on return.

1. **cc-flags — turn on.** Record the current `auto_compact` / `auto_resume`
   state (read in step 1a), then turn both on:
   `cc-flags <target> auto_compact on` and `cc-flags <target> auto_resume
   on`. Read back to verify each one actually took. If `cc-flags` is not on
   PATH, there is nothing to turn on or record here: away mode does not
   fall back on the context-budget poll while unattended — the Step 4
   automatic save-and-continue rule governs instead, with or without
   cc-flags.

2. **Iris context guard.** If `iris-context-guard` is installed, record
   whether it is currently enabled or disabled, then run
   `iris-context-guard enable --session <id>`. If it is not installed,
   `auto_compact` (if available) plus the Step 4 automatic save-and-continue
   rule govern context management instead — the poll described in
   `~/.praxis/context-budget.md` does not run while away either way; do not
   treat the guard's absence as a blocker.

3. **Review auto-consent and standing order.** If `iris-review-consent` is
   installed, record its current mode, then run `iris-review-consent set
   always-yes --session <id>` so native-review consent prompts do not block
   progress while unattended. If it is not installed, note explicitly that
   gentle-ai consent prompts will be answered `granted` per the user's
   standing order, and only proceed on that footing if the user confirms
   that standing order right now — this is a real product decision, not a
   default to assume silently.

Report what got turned on and verified, and confirm the prior value of each
switch was recorded so Step 6 can restore it.

## Step 2 — Workflow sizing

Ask whether to use parallel workflows for the queued work. Recommend a size
based on how many independent, disjoint-file batches actually exist — do
not default to parallel just because the user is leaving. Cap at 4
concurrent code writers regardless of how many independent batches exist
(see `~/.praxis/workflow-policy.md`). Record the decision (workflow size,
or single-threaded) in the task document.

## Step 3 — Blocker sweep, before the user leaves

Collect every item that will need the user while they are away, and resolve
as many as possible right now instead of leaving them to stall overnight:

- Commands only the user can run themselves (absolute paths, secret
  placeholders — per `~/.praxis/command-handoff.md`).
- Keys, logins, and approvals the session cannot obtain on its own.
- Real product decisions (scope, tradeoffs, naming) — not implementation
  details the session can decide itself.
- SDD preflights and pending native-review consents that are currently
  blocked on a human answer.

Ask them in as few `AskUserQuestion` rounds as possible, max 4 questions
per round, so the user is not kept from leaving by a long interrogation.

## Step 4 — Overnight rules

State these explicitly to the user and record them in Engram and the task
document before they leave:

- **No AskUserQuestion while away.** Nobody is there to answer it.
- **Documented defaults for small decisions.** Use the defaults already on
  record (this skill, the task document, prior answers) instead of
  guessing fresh each time.
- **Real decisions go to the inbox, not a blocked prompt.** If
  `iris-task` / the Iris inbox is available, file it there; otherwise
  record it in Engram with a clear `NEEDS-USER` marker so it surfaces on
  return instead of silently stalling the task.
- **Risky or irreversible live switches wait for the user's return** —
  deploys, destructive operations, account switches, and anything else the
  irreversibility firewall would otherwise pause on. The firewall still
  applies in full during away mode; away mode changes who answers a
  blocking question, never whether one gets asked for an irreversible
  action.
- **No context-budget poll.** Polling a window between 50-60% assumes
  someone is there to answer (see `~/.praxis/context-budget.md`); nobody
  is. Away mode replaces that poll with an automatic save-and-continue at
  the next clean point: save to Engram, save the task document, then keep
  working instead of stopping to ask.

## Step 5 — Propose the /loop command

Print the exact `/loop` invocation, in dynamic mode, that the user can
paste so an idle session wakes itself back up, for example:

```
/loop continue autonomously with the queued tasks in <task doc>; follow the away-mode rules
```

The agent cannot start /loop itself — print the command and hand it to
the user to paste before they go.

## Step 6 — On return

Invoke this skill again with `back` or `volví` (or say either in plain
language) to close out away mode:

1. Summarize what happened while away: merged PRs, commits, what finished.
2. Summarize what is still pending, and every `NEEDS-USER` item recorded
   during the overnight run.
3. Restore interactive rules: `AskUserQuestion` and the context-budget poll
   are allowed again from this point on.
4. **Restore every switch Step 1b turned on**, using the prior values
   recorded there. This is the default, not something to ask about:
   - **Review auto-consent.** Restore the previous mode recorded in
     Step 1b (for example, `iris-review-consent set <prior-mode>
     --session <id>`, if that is the syntax the tool documents — verify
     with `iris-review-consent --help` before relying on an exact flag).
   - **Context guard.** If Step 1b enabled `iris-context-guard`, restore
     the previous mode recorded in Step 1b (for example,
     `iris-context-guard disable --session <id>`, if Step 1b found it
     disabled before enabling it — verify with `iris-context-guard --help`
     before relying on an exact flag). If Step 1b found it already
     enabled, leave it enabled.
5. **Ask only about `auto_compact` / `auto_resume`.** Offer to turn them
   back off via `cc-flags` if the user wants; leave them on if the user
   prefers to keep them — this is the one switch Step 6 asks about instead
   of silently restoring.
