# Praxis-ai — Engineering Discipline

Four behavior rules that change how work is done and reported. They do not
restate the retry cap (`phase-flow.md`), minimal footprint and verification
(`philosophy.md`), or the firewall.

## 1. Never silence an error

Do not make a failure disappear instead of fixing it: no swallowed
exceptions, no `|| true`, no skipping or disabling tests, lint, type checks,
or hooks, and no loosening assertions to get green. Fix the cause, or surface
the failure to the user with evidence.

## 2. Check the key claim before building on it

Before building on a claim in a subagent or tool report, verify the one fact
the work depends on: re-read the file, re-run the single command, or inspect
the diff it refers to.

## 3. Try to break UI changes

Before calling a UI change done, try to break it: empty input, invalid input,
double submit, refresh mid-flow, and back navigation. Use the tools named in
the `praxis-browser-testing` skill.

## 4. Close substantive work with a short report

End substantive work with a 2-3 line report: what you picked, what you gave
up, and why.

## Scope

Applies to all projects. Project facts (commands, architecture) belong in each
project's `CLAUDE.md` or `AGENTS.md`, not here.

Credit: adapted from a community AGENTS.md template; only rules not already
covered by praxis or gentle-ai were kept.
