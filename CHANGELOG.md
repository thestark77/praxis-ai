# Changelog

All notable changes to praxis-ai are documented here.
This project follows [Semantic Versioning](https://semver.org/) and
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
