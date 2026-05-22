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

`praxis install` is **plug-and-play**. With a single command it bootstraps
the whole stack and then layers its own overlay:

1. **Dependency preflight** — verifies `git`, `curl`, `bash`, `node`, `npm`
   are present (Go is optional). If any required tool is missing, the
   install aborts with the exact tools and their install links — no
   half-finished state. See [docs/dependencies.md](docs/dependencies.md).
2. **gentle-ai bootstrap** (unless `--no-gentle-ai`) — installs/updates
   gentle-ai from its **official source** and configures it headlessly:
   - Binary via gentle-ai's `scripts/install.sh` (downloaded at runtime,
     never vendored here).
   - `gentle-ai install --agents claude-code --persona neutral --preset full-gentleman`
     — installs the 9 ecosystem components, including **engram** (persistent
     memory), with **balanced** model assignments (gentle-ai's default).
   - `gentle-ai sync --agents claude-code --strict-tdd` — enables Strict TDD.
   - If gentle-ai is already configured, this step is skipped to respect
     your existing choices (use `--force` to reapply praxis defaults).
3. **praxis overlay** into `~/.claude/`:
   - A marker-bounded `@-import` block at the end of `CLAUDE.md` (loads the
     phase model, skill-invocation policy, irreversibility firewall
     protocol, and the balanced preset). Existing content and gentle-ai
     blocks are preserved.
   - ~40 `permissions.deny` patterns in `settings.json` (destructive `rm`,
     force-push, history rewrite, `--no-verify` bypasses, package-manager
     `--force`, secrets paths, and more). Your existing deny entries are
     preserved.
   - The `praxis-ast-hook` PreToolUse hook — inspects every Bash command
     via a token-aware AST walker. Catches chain bypasses
     (`safe && rm -rf /tmp/x`), encoded payloads (`base64 -d | bash`),
     substitution payloads (`$(rm -rf /)`), and more (17 rules).
   - Six skills lifted from mattpocock/skills into `~/.claude/skills/`
     (`grill-with-docs`, `caveman`, `diagnose`, `zoom-out`, `prototype`,
     `handoff`) with per-skill `NOTICE.md` attribution and mechanism-pure
     bodies that don't fight gentle-ai's autonomous orchestrator.

Nothing external is vendored: the gentle-ai binary comes from its official
installer, its components are downloaded by gentle-ai itself, and the
mattpocock skill lifts are mechanism-pure rewrites refreshed from upstream
via `praxis sync-pocock`.

## Installation

```bash
npx praxis-ai@latest install
```

That's it — gentle-ai, engram, the firewall, and the lifted skills are all
set up and configured. The installer also doubles as an **updater**:
re-running it updates each piece from its source.

### What the install does (full sequence)

1. Dependency preflight (abort with links if anything required is missing).
2. Back up `~/.claude/CLAUDE.md` + `~/.claude/settings.json` to
   `~/.praxis/backups/<timestamp>/`.
3. Bootstrap + configure gentle-ai (binary + 9 components + engram +
   strict TDD), unless `--no-gentle-ai`.
4. Patch `CLAUDE.md` with the praxis `@-import` block.
5. Append the firewall deny list + register the AST hook in
   `settings.json`.
6. Install `~/.praxis/` skeleton + the six lifted skills into
   `~/.claude/skills/`.

### Install flags

```text
--no-gentle-ai          install the praxis overlay only (skip the bootstrap)
--force                 overwrite ~/.praxis/ + reapply gentle-ai praxis defaults
--ga-persona <p>        gentle-ai persona: gentleman | neutral | custom   (default neutral)
--ga-preset <p>         gentle-ai preset: full-gentleman | ecosystem-only | minimal | custom
                        (default full-gentleman)
--ga-agents <csv>       gentle-ai agents                                  (default claude-code)
--no-strict-tdd         do not enable gentle-ai Strict TDD
--dry-run               preview without writing (skips the bootstrap)
```

## Updating

`praxis install` doubles as an updater, but the dedicated `praxis update`
command updates the external dependencies **modularly without touching
the rest of the praxis overlay** (your CLAUDE.md block, firewall, AST
hook, telemetry, and `~/.praxis/` skeleton are left alone):

```bash
praxis update              # update both gentle-ai and the lifted skills
praxis update --gentle-ai  # only gentle-ai (binary + components + engram)
praxis update --skills     # only the six lifted mattpocock skills
```

- **gentle-ai** is updated through its own config-preserving primitives
  (`gentle-ai upgrade` for the binary, `gentle-ai sync` for components +
  engram). Your persona, preset, model assignments, and Strict TDD
  setting are preserved. (Homebrew installs update the binary via
  `brew upgrade gentle-ai`.)
- **skills** are refreshed from the praxis-ai repo — the canonical source
  of the mechanism-pure lifts. Only the six praxis-managed skill dirs are
  overwritten; any other skill you have is left untouched.

To also update praxis-ai itself: `npm install -g praxis-ai@latest`
(or `npx praxis-ai@latest ...`).

### Adaptive modes

The installer detects gentle-ai state and adapts:

- **gentle-ai present + configured**: full overlay mode. Bootstrap is
  skipped (your config is respected); use `--force` to reapply defaults.
- **gentle-ai present, not configured**: bootstrap configures it
  (persona/preset/models/TDD), then the overlay installs.
- **gentle-ai absent**: bootstrap installs and configures it from scratch.
  With `--no-gentle-ai` praxis runs in standalone mode — firewall, lifted
  skills, telemetry, AST hook, and precedence rules work; SDD workflow and
  engram persistence are unavailable.

### Reconfiguring gentle-ai later

The bootstrap applies a sensible default config (neutral persona,
full-gentleman preset, balanced models, strict TDD). You can change any of
it at any time by launching gentle-ai's own interactive TUI:

```bash
gentle-ai
```

This opens gentle-ai's installer/configurator where you re-pick the
persona, ecosystem preset, per-phase Claude model assignments, Strict TDD,
and which agents are managed — the same screens praxis automated for you.
praxis does not lock any of these; gentle-ai stays fully in control of its
own configuration. Re-run `praxis install --force` if you instead want to
reset to the praxis defaults.

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

## Testing

praxis-ai has a four-tier test pyramid documented in
[docs/testing.md](docs/testing.md). Quick summary:

- **Tier 1 + 2** — Vitest unit + integration. 223 tests, free, <2 s.
  `npm test`.
- **Tier 3** — sub-agent scenarios that share the parent Claude Code
  session and exercise the firewall against live `Bash` calls.
  Free, ~60 s, 14 scenarios in `tests/scenarios/T*.md`. Latest run:
  13 / 14 PASS, 1 ANOMALY (documented spec correction).
- **Tier 4** — real `claude --print` subprocess in an isolated HOME.
  Cold-start session, exercises the F0 classifier + skill auto-discovery
  + firewall against a real LLM-driven Bash call. Opt-in via
  `npm run test:tier4`. Defaults to Haiku 4.5 (~$0.05–0.10 per full
  run). Latest run (alpha.5): 5 / 5 PASS.

Cross-platform hook-latency benchmark runs on every push (`ubuntu-latest`
+ `macos-latest` × Node 18 / 20 / 22). Numbers documented in
[docs/firewall.md](docs/firewall.md).

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
