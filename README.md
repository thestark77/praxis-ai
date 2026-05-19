# praxis-ai

> Phased-autonomy harness layer for Claude Code.
> **Indagatory** at task start. **Autonomous** in execution. **Hard-stop** at irreversibility.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Status: alpha](https://img.shields.io/badge/status-alpha-yellow.svg)](#)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](#)
[![CI](https://github.com/thestark77/praxis-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/thestark77/praxis-ai/actions)

praxis-ai is an additive overlay for Claude Code that fuses three things no
single existing tool combines cleanly:

- **Indagatory task startup** — surface ambiguity before code is written, in
  the spirit of [mattpocock/skills](https://github.com/mattpocock/skills).
- **Autonomous structured execution** — leans on
  [gentle-ai](https://github.com/Gentleman-Programming/gentle-ai)'s SDD
  workflow and Strict TDD when present.
- **Irreversibility containment** — hard-deny firewall at the Claude Code
  permission layer plus an AST-level PreToolUse hook that catches the
  creative bypasses regex silently misses.

praxis-ai is a **purely additive overlay**: no forks, no patches on
gentle-ai or mattpocock/skills. It survives upstream sync because it uses
Claude Code's own `@-import` directive and HTML-marker conventions.

## Status

**0.1.0-alpha.** M0 → M4 shipped. The install engine, six lifted skills,
two-layer firewall, AST PreToolUse hook, and local SQLite telemetry all
work. M5 (npm publish + cross-platform validation) is in progress. See
[CHANGELOG.md](CHANGELOG.md).

## Philosophy in one line

> Deliberate action informed by theory. Ask before assuming. Execute
> before perfecting. Stop before destroying.

Eight operating principles in [`~/.praxis/philosophy.md`](templates/praxis-home/philosophy.md);
the long-form rationale lives in [docs/philosophy.md](docs/philosophy.md).

## How it works

praxis-ai installs three things into your `~/.claude/`:

1. **A CLAUDE.md block** at the end of your existing `CLAUDE.md`, imported
   via Claude Code's `@-import` directive. This loads the phase model,
   skill-invocation policy, irreversibility firewall protocol, and the
   chosen preset (default: `balanced`).
2. **A `permissions.deny` list extension** in `settings.json` — 30 deny
   patterns covering destructive `rm`, force-push, history rewrite,
   `--no-verify` bypasses, secrets paths, and credential locations. Your
   existing deny entries are preserved and praxis entries are appended.
3. **A PreToolUse hook** in `settings.json` (`praxis-ast-hook`) that
   inspects every Bash command via a token-aware AST walker. Catches
   chain bypasses (`safe && rm -rf /tmp/x`), encoded payloads
   (`base64 -d | bash`), substitution payloads (`$(rm -rf /)`), and more.

Plus six skills lifted from mattpocock/skills into `~/.claude/skills/`
(`grill-with-docs`, `caveman`, `diagnose`, `zoom-out`, `prototype`,
`handoff`) with per-skill `NOTICE.md` attribution and mechanism-pure
bodies that don't fight gentle-ai's autonomous orchestrator.

## Installation

```bash
npx praxis-ai@latest install
```

That's it. The installer:

- Backs up `~/.claude/CLAUDE.md` and `~/.claude/settings.json` to
  `~/.praxis/backups/<timestamp>/`.
- Appends a `@-import` block to `CLAUDE.md` (preserves existing content
  and any gentle-ai blocks).
- Appends ~30 deny entries to `settings.json` `permissions.deny`.
- Registers the `praxis-ast-hook` PreToolUse hook on the `Bash` matcher.
- Installs `~/.praxis/` with the phase model, firewall protocol, presets,
  and the six lifted skills (into `~/.claude/skills/`).

The installer detects whether
[gentle-ai](https://github.com/Gentleman-Programming/gentle-ai) is present
and adapts:

- **gentle-ai present, sdd-init done**: full overlay mode (the recommended
  path).
- **gentle-ai present, sdd-init missing**: praxis installs; `praxis doctor`
  reports the missing pieces.
- **gentle-ai absent**: standalone mode — firewall, lifted skills,
  telemetry, AST hook, and precedence rules work; SDD workflow and engram
  persistence are unavailable.

### Development install (from a local checkout)

```bash
git clone https://github.com/thestark77/praxis-ai.git
cd praxis-ai
npm install
npm run build
node bin/praxis.js install
```

The local-checkout install registers the AST hook with an absolute
`node <abs-path>` command so the hook resolves without depending on a
global `praxis-ast-hook` on PATH.

## CLI surface

```text
praxis install [--dry-run] [--force]   Install overlay; idempotent.
praxis uninstall [--keep-skeleton]     Remove block + firewall + skills.
                 [--keep-skills]
praxis doctor                          Diagnose install + mode.
praxis rollback [--list]               Restore from the latest backup.
praxis stats [--json] [--reset]        Read local telemetry.
praxis context-usage --record <used>   Record a context-usage sample.
                     --budget <b>
praxis sync-pocock --ref <ref>         Drift-check the six lifted skills.
                   --against-lift      against an upstream ref.
```

The hook binary `praxis-ast-hook` is registered automatically during
install; you should not need to invoke it directly.

## Roadmap

- **v0.1.0-alpha (shipped)** — install/uninstall, six lifted skills with
  attribution, two-layer firewall + AST hook, SQLite telemetry, balanced
  preset.
- **v0.1.0** — cross-platform CI (macOS / Linux / WSL), npm publish,
  README polish, docs/* complete.
- **v0.2** — three switchable presets (autonomous / interactive /
  balanced), `.praxis.yml` per-project overrides, hook → telemetry tie-in
  (deny_hits recorded automatically).
- **v1.0** — public npm release, brew formula, threat-model doc, third-party
  security review of the firewall + AST hook.

## License

[MIT](LICENSE). Lifted skill bodies retain mattpocock's MIT notice in
their per-skill `NOTICE.md`.

## Credits

praxis-ai stands on the work of
[gentle-ai](https://github.com/Gentleman-Programming/gentle-ai),
[mattpocock/skills](https://github.com/mattpocock/skills), and
[RTK](https://github.com/rtk-ai/rtk). See [NOTICE](NOTICE) for full
attribution and the bibliography of frontier-lab and practitioner research
that shaped the design.
