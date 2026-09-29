import { tokeniseBash, extractSubstitutions, extractHeredocs } from './tokeniser.js';
import {
  DEFAULT_RULES,
  normalizeSegment,
  extractNestedCommand,
  type Rule,
  type RuleHit,
} from './rules.js';

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
 * How deep nested substitutions, executable heredocs, and shell hand-offs
 * (`sh -c`, `eval`, `env -S`) are followed. A hook runs before every Bash
 * call, so the walk is bounded rather than left open to a pathological
 * input. Exceeding the bound is fail-closed: content that deep was never
 * actually inspected, so `enqueue` below denies rather than silently
 * letting it through unexamined.
 */
const MAX_NESTING = 4;

interface QueueItem {
  raw: string;
  depth: number;
}

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
  const seenHits = new Set<string>();
  function addHit(hit: RuleHit): void {
    const key = `${hit.ruleId}:${hit.message}`;
    if (seenHits.has(key)) return;
    seenHits.add(key);
    hits.push(hit);
  }

  // Worklist of command text to rule-check. It grows with command
  // substitutions, heredoc bodies that a shell will execute, and — per
  // segment, below — a shell/`eval`/`env -S` hand-off surfaced by
  // `extractNestedCommand`. Inert heredoc bodies (commit messages,
  // Python, SQL) never enter it, which is what keeps prose from tripping
  // the rules.
  const queue: QueueItem[] = [];
  const enqueue = (raw: string, depth: number): void => {
    if (!raw.trim()) return;
    if (depth > MAX_NESTING) {
      // Fail closed: this content was never actually inspected, so treat
      // the command as untrusted rather than silently allowing it through
      // because nothing deeper ever got looked at.
      addHit({
        ruleId: 'nesting-too-deep',
        reversibilityClass: 'guard-evasion',
        message: 'command nesting too deep to inspect',
      });
      return;
    }
    const { stripped, heredocs } = extractHeredocs(raw);
    queue.push({ raw: stripped, depth });
    for (const subst of extractSubstitutions(stripped)) {
      enqueue(subst, depth + 1);
    }
    for (const hd of heredocs) {
      if (hd.bodyIsExecutable) enqueue(hd.body, depth + 1);
    }
  };
  enqueue(commandString, 0);

  for (const item of queue) {
    const raw = item.raw;
    // Run rules against the full string first. This catches patterns that
    // span multiple commands joined by `|`, `;`, `&&`, etc. (e.g. base64
    // decoded into a shell pipe).
    for (const rule of rules) {
      const hit = rule.inspect(raw);
      if (hit) addHit(hit);
    }
    // Then run rules against each tokenised command segment: the raw
    // form, so existing prose-insensitive behaviour is unchanged, and
    // `normalizeSegment`'s wrapper-stripped, unescaped/unquoted form, so a
    // rule that only ever checks `toks[0]` (most of them) also sees
    // through `env`, `timeout`, `xargs`, a path-form wrapper, and
    // backslash/quote escaping of the program word.
    const tokens = tokeniseBash(raw);
    for (const token of tokens) {
      if (!token.command) continue;
      for (const rule of rules) {
        const hit = rule.inspect(token.command);
        if (hit) addHit(hit);
      }
      const normalized = normalizeSegment(token.command);
      if (normalized !== token.command) {
        for (const rule of rules) {
          const hit = rule.inspect(normalized);
          if (hit) addHit(hit);
        }
      }
      // A shell/`eval`/`env -S` hand-off means this segment's own tokens
      // are not the whole story: the real command lives in the body it
      // hands off to. Enqueue it for full re-inspection — tokenising,
      // segment splitting, substitutions, normalization, every rule —
      // instead of a rule ever only checking the body's first word.
      const nested = extractNestedCommand(token.command);
      if (nested !== undefined) {
        enqueue(nested, item.depth + 1);
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
