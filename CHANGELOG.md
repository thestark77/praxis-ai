# Changelog

All notable changes to praxis-ai are documented here.
This project follows [Semantic Versioning](https://semver.org/) and
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added — M3.6 AST rule coverage extension
- Five new AST PreToolUse rules to close documented coverage gaps:
  - `chmod-recursive-permissive` — `chmod -R 777`, `-R 666`, `-R a+w`, etc. Catches world-writable trees that are hard to walk back without an audit.
  - `chown-recursive` — `chown -R user /`, `/usr`, `/etc`, `/var`. Catches catastrophic ownership flips of system trees.
  - `tar-absolute-names` — `tar -x --absolute-names` or `tar -xPf` (extract with `-P`). Catches path-traversal extraction.
  - `curl-pipe-shell` — `curl | sh`, `wget | bash`, etc. RCE pattern over the network.
  - `pip-install-target-root` — `pip install --target /` / `/usr` / `/etc`. Overwrites system files.
- Total rules now 14 (was 9). All rules ship with a reversibility class surfaced in the deny reason.
- 21 new tests covering pass + fail per rule. Total 203/203 passing (was 182).

### Added — M3.5 Hook ↔ Telemetry tie-in
- `praxis-ast-hook` now writes a `deny_hit` event to `~/.praxis/telemetry.db` for every rule that fires on a denied command. One row per hit (so a chained command that trips multiple rules produces multiple rows). The deny decision is emitted FIRST; telemetry is best-effort after — failure to open or write the DB does not turn a deny into an allow.
- Honours `PRAXIS_TELEMETRY_DISABLED=1` to suppress writes (useful for tests).
- `praxis stats` will now show deny-hit counts populated automatically when the hook fires (was zero pending this tie-in).

### Changed — Hook command resolution
- `praxis install` now resolves the AST hook command to an absolute `node <abs path>` when invoked from a local checkout (sibling `praxis-ast-hook.js` exists next to `process.argv[1]`). When invoked from an npm install, the bare `praxis-ast-hook` PATH lookup is preserved. This fixes a regression where the dogfood install registered a non-resolvable bare name.

### Added — M5 Docs + version bump
- README rewritten for alpha state: real install instructions, CLI surface listing, "how it works" overview, status badges.
- `docs/philosophy.md` — long-form rationale for the 8 operating principles.
- `docs/architecture.md` — install layout, CLAUDE.md block model, settings.json modifications, module map, tsup build, anti-claims.
- `docs/firewall.md` — two-layer firewall model: regex deny list + AST PreToolUse hook. Per-rule table with reversibility classes.
- `docs/coexistence-with-gentle-ai.md` — domain ownership, precedence rules, detection logic, what praxis touches and does not.
- `docs/references.md` — bibliography of frontier-lab, academic, and practitioner work that shaped the design.
- Version bumped 0.1.0-alpha.0 → 0.1.0-alpha.1 (pending npm publish; package still has `"private": true`).

### Added — M3 AST PreToolUse Hook
- `praxis-ast-hook` binary — second line of defence against creative bypasses the regex deny list silently misses. Reads Claude Code PreToolUse JSON via stdin, inspects Bash commands, emits a `permissionDecision` JSON on stdout.
- Custom dependency-light bash tokeniser (`src/lib/ast/tokeniser.ts`) splits on `;`, `&&`, `||`, `|`, `&` while respecting quote and substitution contexts. `$(...)` and backtick bodies are also extracted and rule-checked.
- Rules: `rm-recursive-force`, `find-delete`, `git-force-push` (incl. `--force-with-lease`), `git-reset-hard`, `no-verify` / `no-gpg-sign`, `sudo-escalation`, `encoded-execution` (base64/xxd/openssl/printf-hex piped into sh/bash/eval), `dd-block-device`, `mkfs`. Each rule maps to a reversibility class (history-rewrite, data-loss, exec-bypass, etc.) the user sees in the deny reason.
- Hook is auto-registered on `praxis install` via a new `hooks.PreToolUse` block in settings.json with a `#praxis-ast-hook#` marker. Idempotent; existing user hooks preserved. Removed on `praxis uninstall`.
- 41 new tests (tokeniser 12, rules+inspect 22, settings-patcher hook 7, hook binary 6 — all sandboxed). Total 178/178 passing.
- New package bin: `praxis-ast-hook` (in addition to `praxis`). tsup config produces two entries.

### Added — M4 Telemetry Foundation
- SQLite telemetry at `~/.praxis/telemetry.db` via `better-sqlite3`. Single events table with typed JSON payload (`session_start`, `session_end`, `phase_transition`, `tool_invocation`, `deny_hit`, `context_sample`). WAL mode, schema_version stamping, idempotent migrations.
- `src/lib/telemetry/` module: `schema.ts` (DDL + event kinds), `db.ts` (lazy open + migration), `events.ts` (typed record helpers), `queries.ts` (`statsSummary`, `latestContextSample`, `resetEvents`).
- `praxis stats` — real implementation. Reports total events, sessions, tool invocations grouped by outcome, deny hits, phase transitions, context samples, time bounds. `--json` for machine-readable output. `--reset` to truncate events.
- `praxis context-usage` — real implementation. `--record <used> --budget <budget>` to append a sample, default reads latest sample and warns when usage crosses the balanced-preset 75% threshold. `--json` for machine-readable output.
- 17 new tests (4 db, 7 events, 6 queries + 5 CLI smoke for telemetry + reset), all sandboxed via `mkdtemp`. Total 130/130 tests passing.

### Added — M2 Skill Lifts
- Lifted six skills from `mattpocock/skills` with mechanism-pure body rewrite, per-file blob SHA pin, and per-skill `NOTICE.md`: `grill-with-docs`, `caveman`, `diagnose`, `zoom-out`, `prototype`, `handoff`. Each skill ships with praxis-specific `invocation:` frontmatter (`explicit` for phase-marking skills; `reflex` with objective triggers for `caveman` and `diagnose`).
- `praxis sync-pocock` command — checks per-file blob SHAs against an upstream ref, reports drift, exits non-zero when any lifted file has changed upstream. Does not auto-rewrite (mechanism-pure rewrites require human review).
- `installClaudeSkills` / `uninstallClaudeSkills` in the skeleton installer, plus a new `claudeSkillsDir` path resolution to `~/.claude/skills/`. Wired into `praxis install` / `praxis uninstall` (with `--keep-skills` opt-out). Idempotent and `HOME`-sandbox-safe.
- 22 new tests across `pocock-sync`, `lifted-skills`, `skeleton-installer` (claude-skills branch), and CLI smoke tests. All exercise `mkdtemp + HOME` sandbox; no test touches the real `~/.claude`.

### Added — M0 Foundation
- TypeScript Node CLI scaffolding with commander.js.
- Build toolchain: tsup, tsc, vitest, eslint, prettier.
- GitHub Actions CI workflow (typecheck, build, test on Node 18/20/22).
- Seven CLI command stubs: `install`, `uninstall`, `upgrade`, `doctor`, `rollback`, `stats`, `context-usage`.
- MIT LICENSE and NOTICE with attribution to gentle-ai, mattpocock/skills, RTK, and research influences.
- README skeleton describing phased autonomy model and adaptive install behavior.

## [0.1.0-alpha.0] — Pending

First release with installable functionality. See roadmap in README.
