// Lightweight bash command tokeniser.
//
// Purpose: split a single shell command string into the discrete commands
// the shell would actually execute, so a PreToolUse hook can inspect each
// command individually. This catches multi-step chains that a single
// regex match against the full string would miss
// (e.g. `cd /; rm *`, `safe-cmd && rm -rf /`).
//
// This is intentionally NOT a full bash parser. It handles the operators
// that change which executable runs (`;`, `&&`, `||`, `|`, `&`,
// command substitution boundaries) and recognises that those operators
// inside quoted strings are inert. It does not attempt to expand
// variables, glob, or evaluate `$(...)` recursively.

export interface Token {
  /** The command text, stripped of leading/trailing whitespace. */
  command: string;
  /** Operator that preceded this token, if any. `null` for the first. */
  precedingOperator: '|' | '&&' | '||' | ';' | '&' | null;
  /** True when this token was extracted from inside `$(...)` or backticks. */
  insideSubstitution: boolean;
}

/**
 * Tokenise a shell command string into discrete commands. Returns at
 * least one token even for an empty input (a single empty command).
 */
export function tokeniseBash(input: string): Token[] {
  const tokens: Token[] = [];
  let buf = '';
  let i = 0;
  let precedingOperator: Token['precedingOperator'] = null;
  // Stack of quote / substitution contexts. The top of the stack tells
  // us whether `;`, `&&`, etc. should split the command.
  const contextStack: Array<'single' | 'double' | 'subst-paren' | 'subst-back'> = [];

  function flush(): void {
    const trimmed = buf.trim();
    if (trimmed.length > 0 || tokens.length === 0) {
      tokens.push({
        command: trimmed,
        precedingOperator,
        insideSubstitution: false,
      });
    }
    buf = '';
  }

  while (i < input.length) {
    const ch = input[i];
    const next = i + 1 < input.length ? input[i + 1] : '';
    const ctx = contextStack[contextStack.length - 1];

    // Inside single quotes, nothing escapes; only the closing quote
    // pops the context.
    if (ctx === 'single') {
      if (ch === "'") {
        contextStack.pop();
      }
      buf += ch;
      i++;
      continue;
    }

    // Inside double quotes, only `\`, `$`, `"` and backticks matter.
    if (ctx === 'double') {
      if (ch === '\\' && next) {
        buf += ch + next;
        i += 2;
        continue;
      }
      if (ch === '"') {
        contextStack.pop();
        buf += ch;
        i++;
        continue;
      }
      if (ch === '$' && next === '(') {
        contextStack.push('subst-paren');
        buf += '$(';
        i += 2;
        continue;
      }
      if (ch === '`') {
        contextStack.push('subst-back');
        buf += ch;
        i++;
        continue;
      }
      buf += ch;
      i++;
      continue;
    }

    // Inside a `$(...)` substitution, recurse via the same loop but
    // popping on the matching `)`. Splitting operators inside the
    // substitution still subdivide the inner command list, but those
    // splits stay inside the substitution buffer; we surface the full
    // substitution body as part of the outer command. The outer
    // tokeniser exposes the substituted command via a separate scan
    // (see extractSubstitutions).
    if (ctx === 'subst-paren') {
      if (ch === ')') {
        contextStack.pop();
      } else if (ch === '(') {
        contextStack.push('subst-paren');
      } else if (ch === "'") {
        contextStack.push('single');
      } else if (ch === '"') {
        contextStack.push('double');
      }
      buf += ch;
      i++;
      continue;
    }

    if (ctx === 'subst-back') {
      if (ch === '`') {
        contextStack.pop();
      }
      buf += ch;
      i++;
      continue;
    }

    // Top-level (no quote/substitution context).
    if (ch === '\\' && next) {
      buf += ch + next;
      i += 2;
      continue;
    }
    if (ch === "'") {
      contextStack.push('single');
      buf += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      contextStack.push('double');
      buf += ch;
      i++;
      continue;
    }
    if (ch === '$' && next === '(') {
      contextStack.push('subst-paren');
      buf += '$(';
      i += 2;
      continue;
    }
    if (ch === '`') {
      contextStack.push('subst-back');
      buf += ch;
      i++;
      continue;
    }

    // Splitting operators.
    if (ch === '&' && next === '&') {
      flush();
      precedingOperator = '&&';
      i += 2;
      continue;
    }
    if (ch === '|' && next === '|') {
      flush();
      precedingOperator = '||';
      i += 2;
      continue;
    }
    if (ch === ';') {
      flush();
      precedingOperator = ';';
      i++;
      continue;
    }
    if (ch === '|') {
      flush();
      precedingOperator = '|';
      i++;
      continue;
    }
    if (ch === '&') {
      flush();
      precedingOperator = '&';
      i++;
      continue;
    }

    buf += ch;
    i++;
  }

  flush();
  return tokens;
}

/**
 * Extract the bodies of all `$(...)` and backtick substitutions from a
 * command string. Returns the inner command text only (not the
 * surrounding parens). Used by inspect.ts so substitution payloads are
 * also rule-checked.
 */
export function extractSubstitutions(input: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < input.length) {
    if (input[i] === '$' && input[i + 1] === '(') {
      let depth = 1;
      let j = i + 2;
      const start = j;
      while (j < input.length && depth > 0) {
        if (input[j] === '\\' && j + 1 < input.length) {
          j += 2;
          continue;
        }
        if (input[j] === '(') depth++;
        else if (input[j] === ')') {
          depth--;
          if (depth === 0) break;
        }
        j++;
      }
      out.push(input.slice(start, j));
      i = j + 1;
      continue;
    }
    if (input[i] === '`') {
      let j = i + 1;
      const start = j;
      while (j < input.length && input[j] !== '`') {
        if (input[j] === '\\' && j + 1 < input.length) {
          j += 2;
          continue;
        }
        j++;
      }
      out.push(input.slice(start, j));
      i = j + 1;
      continue;
    }
    i++;
  }
  return out;
}
