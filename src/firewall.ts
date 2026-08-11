/**
 * Public entry point for the praxis AST firewall engine.
 *
 * This exists so non-Claude-Code harnesses can run the SAME rule engine
 * in-process instead of forking it. The OpenCode plugin praxis emits into
 * `~/.config/opencode/plugins/praxis-firewall.ts` imports the built
 * `dist/firewall.js` produced from this file.
 *
 * Two constraints keep this module honest:
 *   1. Side-effect free. `dist/ast-hook.js` self-invokes on import (it is a
 *      hook binary), so a plugin must never import that one.
 *   2. Dependency free. It is loaded by Bun inside OpenCode, where native
 *      modules such as better-sqlite3 are not available.
 */

export {
  inspectBashCommand,
  type InspectionResult,
  type InspectOptions,
} from './lib/ast/inspect.js';
export {
  DEFAULT_RULES,
  type Rule,
  type RuleHit,
  type ReversibilityClass,
} from './lib/ast/rules.js';
