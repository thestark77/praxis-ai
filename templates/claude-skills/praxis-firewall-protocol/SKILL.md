---
name: praxis-firewall-protocol
description: Use when a permission deny rule or the praxis AST hook blocks a command or file access, before reporting it or retrying.
invocation: contextual
praxis-native: true
---

# Praxis-ai — Firewall Block Protocol

The always-loaded firewall rules keep the guard-evasion bans and the anticipatory
pauses. This skill holds the full protocol for the moment a block fires, and the
framing behind the two-layer design.

## When a deny block fires

1. Do NOT auto-retry without the dangerous flag (if `git push --force` is
   blocked, do not silently retry without `--force`).
2. Do NOT attempt creative bypasses: no `eval`, no base64-encoded commands,
   no hex-encoded paths, no sudo escalation, no shell-out wrappers, no
   sneaky alias indirection.
3. Surface the intent to the user in this structure:
   - **What you tried**: the exact command.
   - **Why you tried it**: one sentence.
   - **Why it was blocked**: irreversibility class — history rewrite, data
     loss, publish, delete, secrets, etc.
   - **What the user should do**: run the command themselves, or instruct
     praxis-ai to proceed via an alternative reversible path.
4. Wait for explicit user authorisation before any related retry.

## On framing

This two-layer firewall is praxis-ai's *bet* on irreversibility
containment. The frontier labs converge at the principle level but diverge
at the implementation: OpenAI Operator uses per-action confirmation;
Anthropic computer-use uses model judgment; Google Mariner uses task-class
allowlisting. Praxis-ai picks hard permission-layer deny + AST-level
inspection + soft protocol. This is opinionated. Adjust the deny list and
the protocol if it does not fit your workload.
