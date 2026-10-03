# Praxis-ai — Irreversibility Firewall

The Claude Code permission layer blocks specific irreversible actions
through the `permissions.deny` list in `~/.claude/settings.json`. A
PreToolUse AST hook adds a second line of defence against command-string
bypasses. When a block fires, follow this protocol. Do not attempt creative
bypasses.


## When a deny block fires

Do NOT auto-retry without the dangerous flag (if `git push --force` is
blocked, do not silently retry without `--force`) and do NOT attempt
creative bypasses (`eval`, encoded commands, sudo escalation, shell-out
wrappers, alias indirection). Tell the user what you tried, why, why it was
blocked, and what they should do, then wait for explicit authorisation.
Full report format: skill `praxis-firewall-protocol`.

## Guard-evasion bans (do not attempt, even without a deny block)

- Never invoke `git` by an absolute or relative path (`/usr/bin/git`,
  `./git`, `~/bin/git`) to route around a `git` shim installed on PATH.
  Always use the bare `git` command.
- Never read, print, copy, or exfiltrate a bypass token — a file whose job
  is to let a session skip a guard, such as Iris's git-worktree-guard token
  at `~/.local/state/iris-worktrees/bypass.token`. This applies to any
  reader (`cat`, `head`, `less`, `cp`, `base64`, `xxd`, redirection into a
  command), not just the ones the deny list happens to name — and it
  applies just as much to a path spelled to avoid the word (a glob like
  `by*`, or splitting the name across variables) as to the literal name.
  The rules below can only catch the literal spelling; this line is what
  covers the intent.
- Delete branches only with `git branch -d` after verifying the merge
  (`git branch --merged`). Never use `-D`, `-d --force`/`-f`, or any
  combined-flag spelling of force-delete.

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
