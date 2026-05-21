# Unattended install validation — 2026-05-21 (alpha.6)

End-to-end validation that `praxis install` is fully plug-and-play and
unattended: from the command to a completely installed + configured stack,
zero intervention.

Run against the published `praxis-ai@0.1.0-alpha.6` (`npm install -g`),
with gentle-ai 1.30.6 already on PATH.

## A — Fresh sandbox HOME (full bootstrap fires)

A clean `mktemp -d` HOME with an empty `CLAUDE.md` and `{}` settings.json
(no gentle-ai markers), then `HOME=$sandbox praxis install` with no flags.

**Result: EXIT 0, no prompts, no intervention.**

```
mode: overlay
gentle-ai: binary=false ecosystem=true strict-tdd=true
skeleton: 9 installed, 0 skipped
claude-skills: 14 installed, 0 skipped
CLAUDE.md @-import injected: true
firewall rules added: 40
AST PreToolUse hook registered: true
```

End-state verification (matches the requested config exactly):

| Setting | Requested | Verified |
|---------|-----------|----------|
| agents | claude-code | ✓ |
| persona | neutral | ✓ persona block has neutral guidance, no regional tone |
| preset | full-gentleman | ✓ markers: persona, engram-protocol, sdd-orchestrator, sdd-model-assignments, strict-tdd-mode |
| models | balanced | ✓ opus for sdd-propose/sdd-design, sonnet for most, haiku for archive |
| Strict TDD | enabled | ✓ `Strict TDD Mode: enabled` |
| engram | installed | ✓ `enabledPlugins: {"engram@engram": true}` |
| praxis overlay | firewall + hook + skills | ✓ 40 deny rules, `praxis-ast-hook` registered, 6 lifted skills |

The binary install step was skipped because gentle-ai was already on PATH
(`binary=false`); the ecosystem install and `sync --strict-tdd` both ran
against the sandbox HOME (`ecosystem=true strict-tdd=true`). The mode
re-detected to `overlay` after the bootstrap.

## B — Configured HOME (bootstrap respects existing config)

`praxis uninstall && praxis install` against the real dogfood, where
gentle-ai is already configured.

**Result: bootstrap skipped, config untouched.**

```
gentle-ai: skipped (already configured; use --force to reapply)
...
warning: gentle-ai: gentle-ai is already configured (markers present in
CLAUDE.md). Re-run with --force to reapply praxis defaults.
```

`praxis doctor --verify` → `synthetic deny: PASS`, `status: ✓ overlay
healthy`.

## Conclusion

Detection-driven behaviour is correct in both directions:

- **Fresh HOME** → full unattended bootstrap (binary skipped only because
  already on PATH; ecosystem + strict TDD applied; engram installed).
- **Configured HOME** → bootstrap skipped, user's gentle-ai config
  respected; `--force` reapplies praxis defaults.

No intervention was required at any point in either path. The dependency
preflight (git/curl/bash/node/npm) passed on this machine; a missing
required tool would have aborted with install links before any
side-effect.
