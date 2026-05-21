# Architecture

praxis-ai is a thin, additive overlay for Claude Code. The runtime
configuration lives in standard Claude Code files
(`~/.claude/CLAUDE.md`, `~/.claude/settings.json`,
`~/.claude/skills/<name>/`); the orchestration code lives in a single
TypeScript-built CLI distributed via npm.

## Install layout

```
~/.claude/
├── CLAUDE.md           # user file. Praxis appends a marker block at the end.
├── settings.json       # praxis appends deny entries + a PreToolUse hook.
└── skills/
    ├── <user's existing skills>
    ├── grill-with-docs/SKILL.md + NOTICE.md   ← M2 lift
    ├── caveman/                                ← M2 lift
    ├── diagnose/                               ← M2 lift
    ├── zoom-out/                               ← M2 lift
    ├── prototype/{SKILL,LOGIC,UI,NOTICE}.md   ← M2 lift
    └── handoff/                                ← M2 lift

~/.praxis/
├── main.md             # the @-imported entry point
├── philosophy.md       # 8 operating principles
├── phase-flow.md       # F0/F1/F2/F3 model
├── skill-invocation-policy.md  # explicit/reflex/contextual
├── precedence-rules.md # praxis vs gentle-ai
├── irreversibility-firewall.md
├── grilling.md         # /grill-with-docs procedure
├── context-conventions.md  # CONTEXT.md + ADR formats
├── presets/balanced.md
├── backups/<timestamp>/    # snapshots of CLAUDE.md + settings.json
└── telemetry.db        # SQLite event log (M4)
```

## CLAUDE.md block

praxis appends a block delimited by two markers:

```
<!-- praxis:start -->
@~/.praxis/main.md
<!-- praxis:end -->
```

The block sits **after** any `gentle-ai:*` blocks so it takes
precedence on conflict via Claude Code's recency rule
([Berglund et al. 2023](references.md)). `main.md` `@`-imports the
loaded modules in a deterministic order.

## settings.json modifications

- `permissions.deny` — praxis appends ~30 entries covering destructive
  rm, force-push variants, history rewrite, `--no-verify`, secrets
  paths, and credentials. User entries are preserved.
- `hooks.PreToolUse[].matcher = "Bash"` — praxis appends a `command`
  hook tagged with `#praxis-ast-hook#` so subsequent installs and the
  uninstall path can find and update it.

Existing `permissions.defaultMode`, `enabledPlugins`, and `model` keys
are left untouched.

## CLI structure (src/)

```
src/
├── cli/
│   ├── index.ts            # commander.js entry; registers all subcommands
│   ├── install.ts
│   ├── uninstall.ts
│   ├── doctor.ts
│   ├── rollback.ts
│   ├── stats.ts            # M4: real telemetry implementation
│   ├── context-usage.ts    # M4: --record + threshold warning
│   ├── sync-pocock.ts      # M2: drift detector
│   ├── upgrade.ts          # stub for v0.2
│   └── ast-hook.ts         # M3: separate dist entry. Reads stdin, writes decision.
├── lib/
│   ├── paths.ts            # resolves ~/.claude, ~/.praxis, skills dirs
│   ├── detector.ts         # detect Claude Code, gentle-ai, engram, mode
│   ├── backup.ts           # backup + restoreLatestBackup
│   ├── claudemd-patcher.ts # marker-bounded block injection
│   ├── settings-patcher.ts # deny entries + PreToolUse hook
│   ├── skeleton-installer.ts # praxis-home + claude-skills templates
│   ├── install.ts          # orchestrator for runInstall / runUninstall / runRollback
│   ├── dependency-check.ts # preflight: required/optional deps + install hints
│   ├── gentle-ai-bootstrap.ts # drives gentle-ai install.sh + install + sync --strict-tdd
│   ├── pocock-sync.ts      # drift detector core
│   ├── telemetry/
│   │   ├── schema.ts
│   │   ├── db.ts
│   │   ├── events.ts
│   │   └── queries.ts
│   └── ast/
│       ├── tokeniser.ts    # quote-aware bash tokeniser
│       ├── rules.ts        # 17 deny rules
│       └── inspect.ts      # orchestrator
└── data/
    ├── firewall-defaults.ts  # ~40 deny entries
    └── pocock-skills.ts      # 6 skill manifest with blob SHAs
```

## Install orchestration (runInstall)

`runInstall` (in `lib/install.ts`) runs these phases in order:

1. **Detect** Claude Code / gentle-ai / engram state; compute mode.
2. **Dependency preflight** (when bootstrapping) — abort with links if a
   required tool is missing.
3. **Backup** `CLAUDE.md` + `settings.json`.
4. **gentle-ai bootstrap** (when `bootstrapGentleAi`) — binary + ecosystem
   + strict TDD, from gentle-ai's source. Non-fatal on failure. Re-detect
   afterward so the reported mode reflects the new state.
5. **Skeleton + skills** into `~/.praxis/` and `~/.claude/skills/`.
6. **Patch** `CLAUDE.md` `@-import` + `settings.json` deny list + AST hook.

The library defaults `bootstrapGentleAi` to **false** so unit/integration
tests stay hermetic; the CLI flips it to **true** unless `--no-gentle-ai`.

## tsup build

Two ESM bundles, both consumed by bin shims:

```
src/cli/index.ts     → dist/index.js     ← bin/praxis.js
src/cli/ast-hook.ts  → dist/ast-hook.js  ← bin/praxis-ast-hook.js
```

Sourcemaps enabled for both. `clean: true` rebuilds from scratch every
time.

## What praxis-ai is not

- **Not a Claude Code fork.** It runs on stock Claude Code.
- **Not a gentle-ai replacement.** It is additive; when gentle-ai is
  present, praxis defers to gentle-ai for the SDD lifecycle and Strict
  TDD enforcement (see [coexistence-with-gentle-ai.md](./coexistence-with-gentle-ai.md)).
- **Not a server.** No background process, no daemon. The telemetry
  DB is a local SQLite file written synchronously when CLI commands
  fire or when the AST hook decides (M3.5 hook→telemetry tie-in lands
  later).
- **Not a wrapper.** praxis does not intercept Claude Code's API
  calls. The firewall lives at Claude Code's permission layer; the
  AST hook is invoked by Claude Code as a registered hook.
