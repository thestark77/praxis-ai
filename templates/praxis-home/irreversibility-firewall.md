# Praxis-ai — Irreversibility Firewall

The Claude Code permission layer blocks specific irreversible actions
through the `permissions.deny` list in `~/.claude/settings.json`. A
PreToolUse AST hook adds a second line of defence against command-string
bypasses. When a block fires, follow this protocol. Do not attempt creative
bypasses.

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

## Anticipatory pauses (no deny block needed)

Even when the permission layer does NOT block, pause and confirm before any
of the following:

- Deploy to a production environment.
- Database writes that affect unbounded rows (no `LIMIT`, no `WHERE`
  constraint) or that cannot be dry-run first.
- External send actions (email, Slack, SMS, webhooks to third parties).
- Cloud actions that terminate or delete resources (instances, buckets, DB
  clusters, IAM users).
- Payment or billing operations.
- Changes to shared CI/CD pipeline configuration (`.github/workflows/*`,
  `ci/*`, Terraform state).

## Principle

Reversible action → proceed with monitoring.
Irreversible action → pause and confirm.

This is universal across Anthropic, OpenAI Model Spec, and Google Cloud
architecture guidance. It applies regardless of the configured permission
mode (`defaultMode`).

## On framing

This two-layer firewall is praxis-ai's *bet* on irreversibility
containment. The frontier labs converge at the principle level but diverge
at the implementation: OpenAI Operator uses per-action confirmation;
Anthropic computer-use uses model judgment; Google Mariner uses task-class
allowlisting. Praxis-ai picks hard permission-layer deny + AST-level
inspection + soft protocol. This is opinionated. Adjust the deny list and
the protocol if it does not fit your workload.
