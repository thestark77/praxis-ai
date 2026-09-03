import { tokeniseBash, extractSubstitutions, extractHeredocs } from './tokeniser.js';
import { DEFAULT_RULES, type Rule, type RuleHit } from './rules.js';

export interface InspectionResult {
  decision: 'allow' | 'deny';
  hits: RuleHit[];
  /** Reason string ready to surface to the user. Empty when allowing. */
  reason: string;
}

export interface InspectOptions {
  rules?: Rule[];
}

/**
 * How deep nested substitutions and executable heredocs are followed.
 * A hook runs before every Bash call, so the walk is bounded rather than
 * left open to a pathological input.
 */
const MAX_NESTING = 4;

/**
 * Run the rule set against every command extracted from `commandString`.
 * Returns `deny` as soon as any rule hits; collects all hits for
 * reporting context.
 */
export function inspectBashCommand(
  commandString: string,
  opts: InspectOptions = {},
): InspectionResult {
  const rules = opts.rules ?? DEFAULT_RULES;
  const hits: RuleHit[] = [];

  // Worklist of command text to rule-check. It grows with command
  // substitutions and with heredoc bodies that a shell will execute.
  // Inert heredoc bodies (commit messages, Python, SQL) never enter it,
  // which is what keeps prose from tripping the rules.
  const queue: string[] = [];
  const enqueue = (raw: string, depth: number): void => {
    if (!raw.trim() || depth > MAX_NESTING) return;
    const { stripped, heredocs } = extractHeredocs(raw);
    queue.push(stripped);
    for (const subst of extractSubstitutions(stripped)) {
      enqueue(subst, depth + 1);
    }
    for (const hd of heredocs) {
      if (hd.bodyIsExecutable) enqueue(hd.body, depth + 1);
    }
  };
  enqueue(commandString, 0);

  const seenHits = new Set<string>();
  function addHit(hit: RuleHit): void {
    const key = `${hit.ruleId}:${hit.message}`;
    if (seenHits.has(key)) return;
    seenHits.add(key);
    hits.push(hit);
  }

  for (const raw of queue) {
    // Run rules against the full string first. This catches patterns that
    // span multiple commands joined by `|`, `;`, `&&`, etc. (e.g. base64
    // decoded into a shell pipe).
    for (const rule of rules) {
      const hit = rule.inspect(raw);
      if (hit) addHit(hit);
    }
    // Then run rules against each tokenised command. This catches a
    // dangerous command embedded inside an otherwise-safe chain.
    const tokens = tokeniseBash(raw);
    for (const token of tokens) {
      if (!token.command) continue;
      for (const rule of rules) {
        const hit = rule.inspect(token.command);
        if (hit) addHit(hit);
      }
    }
  }

  if (hits.length === 0) {
    return { decision: 'allow', hits: [], reason: '' };
  }

  const lines: string[] = [];
  lines.push('praxis-ai AST hook blocked this command. Triggered rules:');
  for (const hit of hits) {
    lines.push(`  [${hit.ruleId}] (${hit.reversibilityClass}) ${hit.message}`);
  }
  lines.push('');
  lines.push(
    'If you believe this is a false positive, run the command yourself or explicitly authorise praxis-ai to proceed via a reversible alternative.',
  );

  return { decision: 'deny', hits, reason: lines.join('\n') };
}
