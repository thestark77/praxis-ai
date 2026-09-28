# Praxis-ai — Workflow Policy

A workflow is a batch of parallel subagents (or worktrees) working at once.
It pays off only when the work is genuinely independent; otherwise the
coordination overhead costs more than it saves.

## When to use a workflow

Use a workflow only for independent batches of work — tasks that do not
read or write the same files and do not depend on each other's output.
Otherwise stay single-threaded: one task, one agent, in sequence.

## One task per worktree

Keep one task per worktree: each parallel agent gets its own task and its
own worktree. Never split a single task across two agents, and never let
two agents share a worktree.

## Disjoint files, single owner

Files touched by parallel agents must be disjoint. When a file is a hot
spot that several tasks would otherwise touch — `CHANGELOG.md`, an
index or import list, a shared config — give it a single owner: one agent
writes it, and the others leave it alone or hand their entry to the owner.
Never let two concurrent agents edit the same file.

## Workflows never deliver

A workflow never delivers: no push, merge, deploy, release, or PR merge
happens from inside a workflow. Delivery stays with the orchestrating
session and the human, under ordinary repository policy, after the
workflow's work lands.

## Concurrency cap

Run at most 4 agents writing code at the same time. Workflow size — the
number of agents or batches — is set per session by the user's prompt;
absent a stated size, choose the smallest workflow that fits the
independent work, and never exceed the cap of at most 4 concurrent
writers.
