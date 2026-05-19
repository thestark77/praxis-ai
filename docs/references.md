# References

praxis-ai's design distils published research and engineering posts
from frontier labs and practitioners. None of their source code is
forked or modified; the influence is on architecture and operating
principles.

## Frontier labs

### Anthropic

- Building Effective Agents (engineering blog, 2024)
- Claude Code Best Practices (documentation, 2024)
- Building Trustworthy Agents (research, 2024)
- Measuring Agent Autonomy (research, 2024)
- Computer-Use Sonnet 4 — model-judgment irreversibility framing

### OpenAI

- Model Spec (instruction hierarchy, irreversibility class)
- Practices for Governing Agentic AI Systems (2024)
- The Instruction Hierarchy (research note)
- Operator — per-action confirmation framing

### Google Cloud

- Choose a Design Pattern for Agentic AI (architecture guide)
- Lessons from 2025 on Agents and Trust (engineering blog)
- Mariner — task-class allowlisting framing

## Academic foundations

- ReAct: Synergizing Reasoning and Acting in Language Models
  (Yao et al., 2022)
- Reflexion: Language Agents with Verbal Reinforcement Learning
  (Shinn et al., 2023)
- Plan-and-Solve Prompting (Wang et al., 2023)
- Lost in the Middle: How Language Models Use Long Contexts
  (Liu et al., 2023)
- SWE-agent: Agent-Computer Interfaces (Yang et al., 2024)
- The Reversal Curse (Berglund et al., 2023) — informs the
  praxis-block placement at the end of CLAUDE.md so recency favours
  praxis instructions on conflict

## Practitioner work

- Matt Pocock — [mattpocock/skills](https://github.com/mattpocock/skills).
  Six skills lifted with mechanism-pure rewrite. See per-skill
  `NOTICE.md` in `templates/claude-skills/<name>/`.
- Simon Willison — agent-coding pattern essays
- Andrej Karpathy — model-as-OS framing
- Geoffrey Litt — end-user-programming and tool-bottleneck framing
- Thorsten Ball — Writing An Interpreter In Go (parser inspiration
  for the AST tokeniser)
- Steve Yegge — agent ergonomics essays
- Paul Gauthier — aider engineering posts
- swyx — context-engineering essays

## Critical perspectives

- Cognition AI — Don't Build Multi-Agents (2025). Informs praxis-ai's
  single-thread orchestration default and sub-agent-only-when-necessary
  rule.
- Drew Breunig — How Long Contexts Fail (2025). Informs praxis-ai's
  context-budget warning at 75 % and the phase-pruning convention in
  F2.

## Ecosystem dependencies

- [gentle-ai](https://github.com/Gentleman-Programming/gentle-ai) —
  Gentleman Programming. SDD orchestrator + Strict TDD + engram
  protocol. praxis-ai integrates as an additive overlay; see
  [coexistence-with-gentle-ai.md](./coexistence-with-gentle-ai.md).
- [RTK (Rust Token Killer)](https://github.com/rtk-ai/rtk) —
  recommended as orthogonal tooling for shell-output compression.
  Not bundled; praxis-ai detects its presence.

## Tooling

- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) —
  synchronous SQLite for Node.js. Used by the telemetry layer.
- [commander.js](https://github.com/tj/commander.js) — CLI surface.
- [tsup](https://github.com/egoist/tsup) — ESM build.
- [vitest](https://github.com/vitest-dev/vitest) — test runner.
