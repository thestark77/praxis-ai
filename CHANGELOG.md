# Changelog

All notable changes to praxis-ai are documented here.
This project follows [Semantic Versioning](https://semver.org/) and
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added — `praxis update` command
Updates the external pieces praxis depends on, modularly, **without
touching the rest of the praxis overlay** (CLAUDE.md block, firewall,
AST hook, telemetry, `~/.praxis/` skeleton are untouched).

- **gentle-ai** — updated via gentle-ai's own config-preserving
  primitives: `gentle-ai upgrade` (binary self-update; brew installs
  get a `brew upgrade` note) + `gentle-ai sync` (re-applies all
  components incl. **engram** for installed agents, from persisted
  state, so persona / preset / model assignments are preserved). Strict
  TDD is preserved by reading the current state and passing
  `--strict-tdd` only when it is already enabled. Skipped with guidance
  if gentle-ai is not installed.
- **skills** — the six lifted mattpocock skills are refreshed from the
  praxis-ai repo (the canonical source of the lifted, mechanism-pure
  artifacts). Only the six praxis-managed skill dirs are overwritten;
  any other skill in `~/.claude/skills/` is left alone. "Latest" means
  the latest re-lift on praxis-ai `main`, so a mattpocock change reaches
  users as soon as we re-lift + push — no npm release required.
- Modular flags: `praxis update --gentle-ai`, `praxis update --skills`.
  No flag = update both.
- New module `src/lib/update.ts` + 11 tests (mocked runner + fetcher).

### Changed — handoff skill re-lifted from upstream
mattpocock updated the `handoff` skill. Re-lifted mechanism-pure: saves
to the OS temp directory (not the workspace), adds an explicit
redaction step (no API keys / passwords / tokens / PII in the handoff),
and frames suggested skills as a dedicated section. Manifest blob SHA
and repo commit refreshed in `src/data/pocock-skills.ts`; all eight
lifted files are back in sync with upstream (`praxis sync-pocock` →
in-sync 8, changed 0).

### Fixed — `npx praxis-ai@latest install` (could not determine executable to run)
The package exposes two bins (`praxis`, `praxis-ast-hook`), neither
matching the package name. npx's `getBinFromManifest` refuses to run a
multi-bin package when no bin matches the package name, so the
README's primary command `npx praxis-ai@latest install` failed with
`could not determine executable to run` on any machine without a prior
global install. (Global `npm install -g` was unaffected, which is why
it went unnoticed.)

Fix: added a `praxis-ai` bin alias pointing to the same shim as
`praxis`. `npx praxis-ai@latest install` now resolves. A regression
test asserts the package always exposes a bin matching its name.

### Added — Plug-and-play gentle-ai bootstrap (`praxis install`)
`praxis install` no longer just *detects* gentle-ai — it installs and
configures the whole stack from gentle-ai's source of truth, then layers
the praxis overlay. Opt-out with `--no-gentle-ai`.

- `src/lib/gentle-ai-bootstrap.ts` drives, in order:
  1. gentle-ai `scripts/install.sh` (fetched at runtime, executed, discarded — never vendored). Skipped when the binary is present, unless `--force`.
  2. `gentle-ai install --agents claude-code --persona neutral --preset full-gentleman` (9 components incl. engram; balanced models by default).
  3. `gentle-ai sync --agents claude-code --strict-tdd` (Strict TDD; `install` does not expose it, `sync` does).
- Respects an existing gentle-ai config (skips bootstrap unless `--force`). Idempotent — doubles as an updater.
- Non-fatal: bootstrap failures become warnings; the praxis overlay still installs.
- New CLI flags: `--no-gentle-ai`, `--force`, `--ga-persona`, `--ga-preset`, `--ga-agents`, `--no-strict-tdd`.
- Library `runInstall` defaults `bootstrapGentleAi` to false (test hermeticity); the CLI flips it true.

### Added — Dependency preflight
`src/lib/dependency-check.ts` verifies `git`, `curl`, `bash`, `node`, `npm`
before any install side-effect when the gentle-ai bootstrap will run (Go is
optional). If a required tool is missing, `praxis install` **aborts** with
the exact tools and their install links/commands — no half-finished state.
`--no-gentle-ai` only requires `node` + `npm`. Documented in
[docs/dependencies.md](docs/dependencies.md).

### Documentation refresh
- `docs/dependencies.md` (new) — required/optional deps, who installs what, error example.
- `docs/coexistence-with-gentle-ai.md` — plug-and-play bootstrap, applied config table, respecting existing config, failure handling.
- `docs/architecture.md` — install orchestration phases + new modules.
- README — plug-and-play install flow, full sequence, install flags, adaptive modes.

### Tests
- 15 new tests: `gentle-ai-bootstrap` (mocked runner: ordering, skip-when-configured, force, overrides, graceful failure) and `dependency-check` (required/optional gating, abort message). Total 238/238 passing. CLI install test pinned to `--no-gentle-ai` for hermeticity.

### Added — Tier 4 end-to-end test runner
- `tests/scenarios/tier4/` with five Tier 4 scenarios that spawn a real `claude --print` subprocess in a fresh sandbox HOME with `praxis install` applied. Auth is seeded from the real HOME (`.credentials.json` + `.claude.json` only). Scenarios cover TRIVIAL classifier, NON-TRIVIAL classifier, firewall intercept of a real LLM-driven Bash call, skill discovery from a clean install, and `praxis doctor --verify` smoke from a fresh session.
- New runner script `tests/scenarios/tier4/run.sh` + `npm run test:tier4` opt-in. Defaults to Haiku 4.5 (~$0.05–0.10 per full run) but overridable via `PRAXIS_TIER4_MODEL`.
- First Tier 4 run (alpha.4 dogfood): **5 / 5 PASS**. Documented in `tests/scenarios/tier4/results-2026-05-19.md`.

### Added — L1 mirrors M3.10 rules
Three new entries in `FIREWALL_DEFAULTS` matching the L2 AST rules
added in M3.10: history-rewrite (`git update-ref refs/heads/*`,
`git update-ref refs/tags/*`, `git filter-branch*`) and package-manager
lockfile bypass (`npm install --force*`, `npm i -f *`, `pnpm install
--force*`, `yarn add --force*`).

Defence in depth: L2 catches these via the AST hook; L1 is the fallback
if the hook crashes or fails open.

### Added — Hook latency benchmark + CI integration
- `scripts/bench-hook.sh` times the praxis-ast-hook over N invocations across cold-allow, warm-allow, deny-with-telemetry, and deny-without-telemetry paths. Machine-readable `BENCH:<...>` lines per measurement.
- `npm run bench:hook` for local runs.
- CI now runs the bench on every matrix cell (ubuntu-latest + macos-latest × Node 18 / 20 / 22), so cross-platform numbers ship on every push without manual runs.

### Added — M3.10 — three new AST rules
Extends the L2 rule set from 14 to 17:

- `git-update-ref` (history-rewrite): `git update-ref refs/heads/*` or `refs/tags/*` bypasses the porcelain layer.
- `git-filter-branch` (history-rewrite): bulk history rewrite across every commit on every touched ref.
- `npm-install-force` (exec-bypass): `npm install --force`, `npm i -f`, `pnpm install --force`, `yarn add --force`. Skips peer-dependency conflict resolution and writes a misleading lockfile.

14 new tests across the three rules. Total 223/223 passing.

### Fixed — M3.9 — `praxis uninstall` stdout reflects actual filesystem state
`runUninstall` now returns `praxisDirFullyRemoved` (boolean) which the
CLI uses to print one of three accurate messages:

- `~/.praxis/ removed: true (no user data was present)`
- `~/.praxis/ install artefacts removed; backups preserved for `praxis rollback``
- `~/.praxis/ left in place (--keep-skeleton)`

The rollback Tip is suppressed when no backups remain. Replaces the
misleading "~/.praxis/ removed: true" that surfaced in alpha.3 even
when backups survived. Cosmetic-only; functional behaviour unchanged.

### Fixed — M3.8 — `praxis uninstall` preserves `~/.praxis/backups/`
Caught by scenario T14 (install / uninstall / rollback round-trip).

The previous `uninstall` wiped the whole praxis directory, including
`backups/`. That orphaned `praxis rollback` — its only data source was
the directory uninstall had just deleted.

`uninstallSkeleton` now walks the praxis dir and skips a preserve set
(`backups`, `telemetry.db`). When nothing user-owned remains, the dir
is removed entirely so the empty-case behaviour is unchanged. P2
(minimal footprint, reversibility) is restored for the install
lifecycle.

### Fixed — M3.8 — Rules tokens helper is quote-aware
Token-based rules (`rm-recursive-force`, `no-verify`, etc.) split on
whitespace without honouring quotes, so `git commit -m "..."` with
the dangerous keywords inside the body produced those keywords as
separate tokens and the rules tripped on the commit message itself.

`stripQuoted` is now applied before whitespace tokenisation.
Regression tests added for `rm`-pattern and `--no-verify` mentions
inside `git commit -m "..."` bodies.

### Added — End-to-end test scenarios
- `tests/scenarios/` directory with 14 scenarios (T1–T14): firewall L1, AST chain bypass, substitution body, git force-push, --no-verify, encoded-execution, allow path, telemetry deny_hit, skill discovery, doctor --verify, F0 TRIVIAL classifier, F0 NON-TRIVIAL classifier, context-usage threshold, install/uninstall/rollback round-trip.
- `tests/scenarios/results-2026-05-19.md` — aggregate first-run + alpha.3 re-run. 13/14 PASS, 1 ANOMALY (T1 spec-order correction applied), 0 FAIL.
- `docs/firewall.md` corrected: for Bash tool calls the AST PreToolUse hook fires before the permission check; the regex deny list is the fallback. Both layers remain active.

### Added — M3.7 + polish

#### M3.7 — encoded-execution rule tightened
Same false-positive pattern as the curl-pipe-shell fix in M3.6: the
encoded-execution rule required only that `base64`/`xxd`/`openssl` AND
a shell keyword appear anywhere in the command, which triggered on
prose mentions in commit messages and docstrings.

The rule now requires:
- a decoder piped into a shell (`base64 ... | bash`), OR
- `eval`/`exec` of a `$(...)` body containing the decoder, OR
- hex-encoded printf piped into a shell.

Regression test: a commit message body discussing the pattern verbatim no
longer triggers the hook.

#### `praxis doctor --verify`
New flag spawns the registered AST hook with a synthetic `rm -rf`
payload and asserts deny. Useful smoke test after install. Output
includes the resolved hook command for debugging.

#### Hook perf audit
Documented in `docs/firewall.md`:
| Path | Latency |
|---|---|
| Allow (cold) | ~41 ms |
| Allow (warm) | ~43 ms |
| Deny + telemetry | ~60 ms |
| Deny, telemetry disabled | ~39 ms |

Dominant cost is Node startup; rule evaluation is sub-ms. The deny
path adds ~17 ms for the SQLite open+insert+close. `PRAXIS_TELEMETRY_DISABLED=1`
skips the DB write for very hot loops.

#### README polish
Install command is now `npx praxis-ai@latest install`. The local-checkout
path is preserved as a "development install" section.

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
