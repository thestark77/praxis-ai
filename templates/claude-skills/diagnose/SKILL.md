---
name: diagnose
description: Disciplined diagnosis loop for hard bugs and performance regressions. Reproduce, minimise, hypothesise, instrument, fix, regression-test. Use when user says "diagnose this", "debug this", reports a bug, says something is broken/throwing/failing, or describes a performance regression. Also auto-fires after two consecutive command failures in F2 execution.
invocation: reflex
triggers:
  - kind: consecutive-failures
    count: 2
    scope: F2
  - kind: user-utterance
    matches:
      - diagnose this
      - debug this
      - this is broken
      - this is failing
      - perf regression
---

# diagnose — Mechanism

A six-phase loop for hard bugs. Skip phases only when explicitly
justified.

When entering an unfamiliar area, read the project's `CONTEXT.md`
glossary first to anchor the mental model, and check ADRs in the affected
modules.

## Phase 1 — Build a feedback loop

This is the central skill. The rest is mechanical. Without a fast,
deterministic, agent-runnable pass/fail signal, no amount of code reading
will find the cause.

Construction order, try roughly top-to-bottom:

1. Failing test at the seam closest to the bug (unit, integration, e2e).
2. Curl or HTTP script against a running dev server.
3. CLI invocation with a fixture input, diffing stdout against a
   known-good snapshot.
4. Headless browser script (Playwright, Puppeteer) that drives the UI and
   asserts on DOM, console, and network.
5. Replay a captured trace. Save a real payload to disk and replay it
   through the code path in isolation.
6. Throwaway harness. Spin up a minimal subset of the system that
   exercises the bug code path with a single function call.
7. Property or fuzz loop. Run many random inputs to surface a flake.
8. Bisection harness. Automate "boot at state X, check, repeat" so
   `git bisect run` can drive it.
9. Differential loop. Same input through old version vs new version,
   diff outputs.
10. HITL bash script. Last resort if a human must click. Structure the
    loop so captured output feeds back to the agent.

### Iterate on the loop itself

Treat the loop as a product. Once a loop exists, ask:

- Can it be faster? Cache setup, skip unrelated init, narrow scope.
- Can the signal be sharper? Assert on the specific symptom, not "did
  not crash".
- Can it be more deterministic? Pin time, seed RNG, isolate filesystem,
  freeze network.

A 30-second flaky loop is barely better than no loop. A 2-second
deterministic loop is debuggable.

### Non-deterministic bugs

The goal is a higher reproduction rate, not a clean repro. Loop the
trigger many times, parallelise, add stress, narrow timing windows,
inject sleeps. Raise the rate until the bug is debuggable.

### When no loop is achievable

Stop and say so explicitly. List what was tried. Ask the user for:

- Access to an environment that reproduces the bug.
- A captured artifact (HAR file, log dump, core dump, screen recording
  with timestamps).
- Permission to add temporary production instrumentation.

Do not proceed to Phase 2 without a loop you believe in.

## Phase 2 — Reproduce

Run the loop. Confirm:

- The loop produces the failure mode the user described, not a different
  failure that happens to be nearby. Wrong bug equals wrong fix.
- The failure is reproducible across multiple runs, or for
  non-deterministic bugs, at a high enough rate to debug against.
- The exact symptom is captured (error message, wrong output, slow
  timing) so later phases can verify the fix.

Do not proceed until the bug is reproduced.

## Phase 3 — Hypothesise

Generate three to five ranked hypotheses before testing any of them.
Single-hypothesis generation anchors on the first plausible idea.

Each hypothesis must be falsifiable. State the prediction:

> If X is the cause, then changing Y will make the bug disappear (or
> changing Z will make it worse).

If no prediction can be stated, the hypothesis is a vibe. Discard or
sharpen it.

Show the ranked list to the user before testing. Domain knowledge often
re-ranks instantly. Do not block on it; proceed with the ranking if the
user is AFK.

## Phase 4 — Instrument

Each probe maps to a specific prediction from Phase 3. Change one
variable at a time.

Tool preference:

1. Debugger or REPL inspection when the environment supports it. One
   breakpoint beats ten logs.
2. Targeted logs at the boundaries that distinguish hypotheses.
3. Never "log everything and grep".

Tag every debug log with a unique prefix, e.g. `[DEBUG-a4f2]`. Cleanup
becomes a single grep. Untagged logs survive; tagged logs die.

For performance regressions, logs are usually wrong. Establish a
baseline measurement (timing harness, `performance.now()`, profiler,
query plan), then bisect. Measure first, fix second.

## Phase 5 — Fix and regression test

Write the regression test before the fix, but only if a correct seam
exists.

A correct seam exercises the real bug pattern as it occurs at the call
site. If the only available seam is too shallow (single-caller test when
the bug needs multiple callers, unit test that cannot replicate the
trigger chain), a regression test there gives false confidence.

If no correct seam exists, that itself is the finding. Note it. The
architecture is preventing the bug from being locked down. Flag this for
Phase 6.

If a correct seam exists:

1. Turn the minimised repro into a failing test at that seam.
2. Watch it fail.
3. Apply the fix.
4. Watch it pass.
5. Re-run the Phase 1 feedback loop against the original un-minimised
   scenario.

## Phase 6 — Cleanup and post-mortem

Required before declaring done:

- Original repro no longer reproduces (re-run the Phase 1 loop).
- Regression test passes, or absence of seam is documented.
- All `[DEBUG-...]` instrumentation removed (grep the prefix).
- Throwaway prototypes deleted or moved to a clearly-marked debug
  location.
- The correct hypothesis is stated in the commit or PR message.

Then ask: what would have prevented this bug? If the answer involves
architectural change (no good test seam, tangled callers, hidden
coupling), hand off to an architecture-improvement skill with the
specifics. Make the recommendation after the fix is in, not before — the
agent has more information now than when it started.
