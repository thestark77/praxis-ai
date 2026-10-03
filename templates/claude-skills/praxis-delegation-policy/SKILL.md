---
name: praxis-delegation-policy
description: Use when launching parallel subagents, worktrees or a workflow batch, or when choosing the reasoning effort or model for a task or subagent.
invocation: contextual
praxis-native: true
---

# Praxis-ai — Delegation Policy

Two policies for work split across agents: how to run parallel workflows, and what
reasoning effort to set. Both apply every time work is delegated.

## Praxis-ai — Workflow Policy

A workflow is a batch of parallel subagents (or worktrees) working at once.
It pays off only when the work is genuinely independent; otherwise the
coordination overhead costs more than it saves.

### When to use a workflow

Use a workflow only for independent batches of work — tasks that do not
read or write the same files and do not depend on each other's output.
Otherwise stay single-threaded: one task, one agent, in sequence.

### One task per worktree

Keep one task per worktree: each parallel agent gets its own task and its
own worktree. Never split a single task across two agents, and never let
two agents share a worktree.

### Disjoint files, single owner

Files touched by parallel agents must be disjoint. When a file is a hot
spot that several tasks would otherwise touch — `CHANGELOG.md`, an
index or import list, a shared config — give it a single owner: one agent
writes it, and the others leave it alone or hand their entry to the owner.
Never let two concurrent agents edit the same file.

### Workflows never deliver

A workflow never delivers: no push, merge, deploy, release, or PR merge
happens from inside a workflow. Delivery stays with the orchestrating
session and the human, under ordinary repository policy, after the
workflow's work lands.

### Concurrency cap

Run at most 4 agents writing code at the same time. Workflow size — the
number of agents or batches — is set per session by the user's prompt;
absent a stated size, choose the smallest workflow that fits the
independent work, and never exceed the cap of at most 4 concurrent
writers.

## Praxis-ai — Reasoning-Effort Policy

Reasoning effort is set per task or subagent, never raised globally by
habit. Higher effort is not free: it costs latency and tokens, and past a
point it stops helping.

### Default: medium

Claude Opus 5.5's API default effort is `medium` (Opus 5 and earlier
default to `high`). In Anthropic's own testing, Opus 5.5 at `medium`
exceeds Opus 5 at `high` on coding and knowledge-work evaluations. Default
to `medium` on Opus 5.5 for routine work: implementation, refactors, bug
fixes, ordinary reviews.

### When to escalate to `high`

Use `high` for:

- architecture decisions
- security-sensitive work
- corrections after a review found a real issue

### `xhigh` and `max` are rare

Reserve `xhigh` and `max` for work where a measured quality gain justifies
the cost — do not reach for them by default on hard-looking tasks. `max`
in particular can show diminishing returns and can be prone to overthink.
Use `xhigh`/`max` only when testing on the actual
task has shown it helps.

### Lower effort for simple delegated work

`low` is fine for simple subagent tasks: mechanical edits, narrow lookups,
single-file reads. Match the effort to the task, not to the model's
ceiling.

### Source

Anthropic, [Claude effort docs](https://platform.claude.com/docs/en/build-with-claude/effort)
and the Claude Opus 5.5 migration guide.
