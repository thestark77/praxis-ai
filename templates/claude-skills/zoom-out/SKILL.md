---
name: zoom-out
description: Ask the agent to zoom out and produce a higher-level map of the surrounding code. Use when you are unfamiliar with a section of code or need to understand how it fits the bigger picture.
invocation: explicit
---

# zoom-out — Mechanism

A phase-marking skill that requests a higher-level abstraction view of
the current code area.

## When the user invokes it

The agent should:

1. Identify the module or file currently in focus.
2. Walk one layer of abstraction outward (parent module, package, or
   bounded context).
3. Produce a map of:
   - All relevant modules at that layer.
   - All callers of the current focus.
   - The bounded context or domain the focus participates in.
4. Use the vocabulary in the project's `CONTEXT.md` (or, if absent,
   propose canonical terms while marking them as proposed).

The output is a map. It is not a refactor, not a critique, and not a
list of changes.

## What "one layer outward" means

If the current focus is a function, the map is its module and the
modules that import it. If the focus is a module, the map is its package
or directory and the packages that import it. If the focus is a package,
the map is the bounded context and the contexts that depend on it.

Do not skip layers. The user asked to zoom out one step, not to leap to
the whole-system diagram.
