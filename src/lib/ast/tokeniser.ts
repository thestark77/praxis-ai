// Lightweight bash command tokeniser.
//
// Purpose: split a single shell command string into the discrete commands
// the shell would actually execute, so a PreToolUse hook can inspect each
// command individually. This catches multi-step chains that a single
// regex match against the full string would miss
// (e.g. `cd /; rm *`, `safe-cmd && rm -rf /`).
//
// This is intentionally NOT a full bash parser. It handles the operators
// that change which executable runs (`;`, `&&`, `||`, `|`, `&`, newline,
// command substitution boundaries) and recognises that those operators
// inside quoted strings are inert. It does not attempt to expand
// variables, glob, or evaluate `$(...)` recursively.
//
// Two structural facts the shell honours and a naive splitter does not:
//
//   1. A newline separates commands exactly like `;` does. A hook that
//      splits only on `;`/`&&` reads a three-line script as one command,
//      matches its rules against the first word, and lets every later
//      line through unexamined.
//   2. A heredoc body is data, not a command list — unless the thing
//      consuming it is a shell. `git commit -F - <<'EOF'` carries prose
//      that must not be rule-checked; `bash <<'EOF'` carries a script
//      that must be. Ignoring the distinction produces false positives
//      on commit messages and false negatives on shell heredocs at the
//      same time.
//
// Heredoc bodies are therefore lifted out before tokenising, and handed
// back separately so the caller can re-inspect only the executable ones.

export interface Token {
  /** The command text, stripped of leading/trailing whitespace. */
  command: string;
  /** Operator that preceded this token, if any. `null` for the first. */
  precedingOperator: '|' | '&&' | '||' | ';' | '&' | '\n' | null;
  /** True when this token was extracted from inside `$(...)` or backticks. */
  insideSubstitution: boolean;
}

/**
 * Tokenise a shell command string into discrete commands. Returns at
 * least one token even for an empty input (a single empty command).
 */
export function tokeniseBash(input: string): Token[] {
  // Heredoc bodies are data at this layer. Lifting them out first stops a
  // commit message or a Python docstring from being split into "commands".
  // Callers that need the executable ones back use `extractHeredocs`.
  const { stripped } = extractHeredocs(input);
  return tokeniseStripped(stripped);
}

function tokeniseStripped(input: string): Token[] {
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
    //
    // A newline ends a command exactly as `;` does. It is checked after the
    // backslash branch above, so an escaped newline stays a line
    // continuation and does not split the command it continues.
    if (ch === '\n' || ch === '\r') {
      flush();
      precedingOperator = '\n';
      i++;
      continue;
    }
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

// --- Heredocs -------------------------------------------------------------

/**
 * Programs whose heredoc body is a shell script, and therefore still has
 * to be rule-checked. Everything else (`git commit -F -`, `python -`,
 * `cat > file`, `jq`, `psql`) receives the body as inert data.
 *
 * `ssh` is included deliberately: `ssh host <<'EOF'` runs the body in a
 * shell, and that the shell is remote makes the action less reversible,
 * not more.
 */
const SHELL_CONSUMERS = new Set([
  'sh',
  'bash',
  'zsh',
  'dash',
  'ksh',
  'ash',
  'fish',
  'eval',
  'source',
  '.',
  'ssh',
]);

export interface Heredoc {
  /** The delimiter word, with any quoting removed. */
  delimiter: string;
  /** Body text, excluding the terminator line. */
  body: string;
  /** The logical line that opened the heredoc, minus the body. */
  ownerLine: string;
  /**
   * True when a shell (or ssh) consumes the body, making it executable
   * and therefore worth inspecting. False means the body is data.
   */
  bodyIsExecutable: boolean;
}

export interface HeredocExtraction {
  /** The input with every heredoc body removed. */
  stripped: string;
  heredocs: Heredoc[];
}

function basename(word: string): string {
  const cut = Math.max(word.lastIndexOf('/'), word.lastIndexOf('\\'));
  return cut === -1 ? word : word.slice(cut + 1);
}

/**
 * Does any word on the opening line hand this body to a shell?
 *
 * The whole line is examined, not just the word before `<<`, because the
 * consumer is frequently downstream of a pipe: `cat <<'EOF' | bash` is
 * owned by `cat` but executed by `bash`.
 */
function lineFeedsAShell(line: string): boolean {
  const withoutOperator = line.replace(/<<-?\s*(['"]?)[^\s;&|<>()]*\1/g, ' ');
  const words = withoutOperator.split(/[\s;&|()<>]+/).filter(Boolean);
  return words.some((w) => SHELL_CONSUMERS.has(basename(w)));
}

function readDelimiter(input: string, start: number): { value: string; end: number } | null {
  if (start >= input.length) return null;
  const quote = input[start];
  if (quote === "'" || quote === '"') {
    const end = input.indexOf(quote, start + 1);
    if (end === -1) return null;
    return { value: input.slice(start + 1, end), end: end + 1 };
  }
  let j = start;
  let value = '';
  while (j < input.length && !/[\s;&|<>()]/.test(input[j]!)) {
    if (input[j] === '\\' && j + 1 < input.length) {
      value += input[j + 1];
      j += 2;
      continue;
    }
    value += input[j];
    j++;
  }
  return value.length > 0 ? { value, end: j } : null;
}

/**
 * Consume body lines from `start` until the terminator line. An
 * unterminated heredoc (the input was truncated, as a hook excerpt may
 * be) yields the remainder as the body rather than throwing.
 */
function consumeBody(
  input: string,
  start: number,
  delimiter: string,
  allowIndent: boolean,
): { body: string; next: number } {
  let body = '';
  let i = start;
  while (i < input.length) {
    const nl = input.indexOf('\n', i);
    const isLast = nl === -1;
    const line = input.slice(i, isLast ? input.length : nl);
    const candidate = (allowIndent ? line.replace(/^[ \t]+/, '') : line).replace(/\r$/, '');
    if (candidate === delimiter) {
      return { body, next: isLast ? input.length : nl + 1 };
    }
    body += line + (isLast ? '' : '\n');
    if (isLast) return { body, next: input.length };
    i = nl + 1;
  }
  return { body, next: input.length };
}

/**
 * Lift every heredoc body out of `input`.
 *
 * Returns the command text with the bodies removed, plus the bodies
 * themselves tagged with whether a shell consumes them. Quoted regions
 * are respected, so a `<<` inside a string is not mistaken for a
 * redirect, and `<<<` (herestring) is left alone.
 */
export function extractHeredocs(input: string): HeredocExtraction {
  const heredocs: Heredoc[] = [];
  let stripped = '';
  let i = 0;
  let lineStart = 0;
  let quote: "'" | '"' | null = null;
  let pending: Array<{ delimiter: string; allowIndent: boolean; index: number }> = [];

  while (i < input.length) {
    const ch = input[i]!;

    if (quote) {
      if (quote === '"' && ch === '\\' && i + 1 < input.length) {
        stripped += ch + input[i + 1];
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      stripped += ch;
      i++;
      continue;
    }

    if (ch === '\\' && i + 1 < input.length) {
      stripped += ch + input[i + 1];
      i += 2;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      stripped += ch;
      i++;
      continue;
    }

    // `<<` opens a heredoc; `<<<` is a herestring and stays untouched.
    // The whole run of `<` is measured first, so the scanner cannot land
    // on the trailing two angles of a herestring and read its operand as
    // a delimiter.
    if (ch === '<') {
      let run = 0;
      while (input[i + run] === '<') run++;
      if (run !== 2) {
        stripped += input.slice(i, i + run);
        i += run;
        continue;
      }
      let j = i + 2;
      let allowIndent = false;
      if (input[j] === '-') {
        allowIndent = true;
        j++;
      }
      while (j < input.length && (input[j] === ' ' || input[j] === '\t')) j++;
      const delim = readDelimiter(input, j);
      if (delim) {
        stripped += input.slice(i, delim.end);
        pending.push({ delimiter: delim.value, allowIndent, index: heredocs.length });
        heredocs.push({ delimiter: delim.value, body: '', ownerLine: '', bodyIsExecutable: false });
        i = delim.end;
        continue;
      }
    }

    if (ch === '\n') {
      stripped += ch;
      const ownerLine = input.slice(lineStart, i);
      i++;
      if (pending.length > 0) {
        const executable = lineFeedsAShell(ownerLine);
        // Multiple heredocs on one line are filled in the order opened.
        for (const p of pending) {
          const consumed = consumeBody(input, i, p.delimiter, p.allowIndent);
          const hd = heredocs[p.index]!;
          hd.body = consumed.body;
          hd.ownerLine = ownerLine;
          hd.bodyIsExecutable = executable;
          i = consumed.next;
        }
        pending = [];
      }
      lineStart = i;
      continue;
    }

    stripped += ch;
    i++;
  }

  // A heredoc opened but never fed a newline (truncated input) has no body.
  return { stripped, heredocs };
}
