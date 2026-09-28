# Praxis-ai — Reasoning-Effort Policy

Reasoning effort is set per task or subagent, never raised globally by
habit. Higher effort is not free: it costs latency and tokens, and past a
point it stops helping.

## Default: medium

Claude Opus 5.5's API default effort is `medium` (Opus 5 and earlier
default to `high`). In Anthropic's own testing, Opus 5.5 at `medium`
exceeds Opus 5 at `high` on coding and knowledge-work evaluations. Default
to `medium` on Opus 5.5 for routine work: implementation, refactors, bug
fixes, ordinary reviews.

## When to escalate to `high`

Use `high` for:

- architecture decisions
- security-sensitive work
- corrections after a review found a real issue

## `xhigh` and `max` are rare

Reserve `xhigh` and `max` for work where a measured quality gain justifies
the cost — do not reach for them by default on hard-looking tasks. `max`
in particular can show diminishing returns and is prone to overthink: past
a point, extra reasoning budget adds hedging and second-guessing rather
than a better answer. Use `xhigh`/`max` only when testing on the actual
task has shown it helps.

## Lower effort for simple delegated work

`low` is fine for simple subagent tasks: mechanical edits, narrow lookups,
single-file reads. Match the effort to the task, not to the model's
ceiling.

## Source

Anthropic, [Claude effort docs](https://platform.claude.com/docs/en/build-with-claude/effort)
and the Claude Opus 5.5 migration guide.
