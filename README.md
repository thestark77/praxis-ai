# praxis-ai

> Phased-autonomy harness layer for Claude Code.
> **Indagatory** at task start. **Autonomous** in execution. **Hard-stop** at irreversibility.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Status: pre-alpha](https://img.shields.io/badge/status-pre--alpha-orange.svg)](#)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](#)

praxis-ai is an additive overlay for Claude Code that fuses three things that none of the existing tools combine cleanly:

- **Indagatory task startup** — surface ambiguity before code is written, in the spirit of [mattpocock/skills](https://github.com/mattpocock/skills).
- **Autonomous structured execution** — leans on [gentle-ai](https://github.com/Gentleman-Programming/gentle-ai)'s SDD workflow and Strict TDD when present.
- **Irreversibility containment** — hard-deny firewall at the Claude Code permission layer plus AST-level command inspection, informed by Anthropic and OpenAI Model Spec guidance on agent autonomy bounds.

It is built as a **purely additive overlay**: no forks, no patches on gentle-ai or mattpocock/skills. It survives upstream sync because it uses Claude Code's own `@-import` directive and HTML-marker convention.

## Status

**Pre-alpha. Scaffolding only.** This repository currently contains the TypeScript Node CLI scaffold and the CI workflow. The install engine, firewall, skill lifter, and telemetry are scheduled milestones. See [CHANGELOG.md](CHANGELOG.md) for progress.

## Philosophy in one line

> Deliberate action informed by theory. Ask before assuming. Execute before perfecting. Stop before destroying.

## Installation (once v0.1 ships)

```bash
npx praxis-ai@latest install
```

The installer detects whether [gentle-ai](https://github.com/Gentleman-Programming/gentle-ai) is present and adapts:

- **gentle-ai present, sdd-init done**: full overlay mode (the recommended path).
- **gentle-ai present, sdd-init missing**: praxis installs, `praxis doctor` reports the missing pieces.
- **gentle-ai absent**: standalone mode — firewall, lifted skills, telemetry, and precedence rules work; SDD workflow and engram persistence are unavailable.

## Roadmap

- **v0.1 alpha** — marker injection, 6 lifted skills (mechanism-only bodies), two-layer firewall with AST hook, hardcoded balanced preset, local SQLite telemetry, `praxis doctor`, `praxis rollback`.
- **v0.2** — mini local eval harness, three switchable presets (autonomous / interactive / balanced), `.praxis.yml` per-project overrides, `sync-pocock`, grilling-trigger refinement using v0.1 telemetry.
- **v1.0** — threat model documentation, cross-platform testing (macOS / Linux / WSL), brew formula, community polish, public npm publish.

See the full design rationale in [docs/architecture.md](docs/architecture.md) (coming with M5).

## License

[MIT](LICENSE). Lifted skill bodies retain mattpocock's MIT notice in their per-skill `NOTICE.md`.

## Credits

praxis-ai stands on the work of [gentle-ai](https://github.com/Gentleman-Programming/gentle-ai), [mattpocock/skills](https://github.com/mattpocock/skills), and [RTK](https://github.com/rtk-ai/rtk). See [NOTICE](NOTICE) for the full attribution and the bibliography of frontier-lab and practitioner research that shaped the design.
