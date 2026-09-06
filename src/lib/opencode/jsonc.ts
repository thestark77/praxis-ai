/**
 * A string-aware JSONC reader.
 *
 * OpenCode accepts comments and trailing commas in `opencode.jsonc`, and this
 * user's live config uses both. `JSON.parse` does not, so praxis was reporting
 * a fully armed firewall as `0/89` rules active — the dangerous direction for
 * a doctor to be wrong in, because it invites a reinstall over a config that
 * was already correct.
 *
 * Everything here is one scanner that knows when it is inside a string
 * literal. That is not a detail: a stripper that does not track strings eats
 * the `//` out of every URL in the file, which is exactly how this user's
 * `$schema` was destroyed once before. Offsets are preserved by replacing
 * comment bytes with spaces, so a syntax error still points at the real
 * column of the original file.
 */

interface Scan {
  /** The source with comment bytes blanked out and trailing commas removed. */
  text: string;
  /** Whether any comment was actually removed (a URL's `//` does not count). */
  commentsFound: boolean;
}

function scan(source: string): Scan {
  const out = source.split('');
  let commentsFound = false;
  let i = 0;

  while (i < source.length) {
    const ch = source[i];

    if (ch === '"') {
      // Walk the whole string literal so nothing inside it is ever inspected
      // as syntax. A backslash escapes exactly one character, including
      // another backslash, so consuming two at a time is correct.
      i += 1;
      while (i < source.length) {
        if (source[i] === '\\') {
          i += 2;
          continue;
        }
        if (source[i] === '"') {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    if (ch === '/' && source[i + 1] === '/') {
      commentsFound = true;
      while (i < source.length && source[i] !== '\n') {
        out[i] = ' ';
        i += 1;
      }
      continue;
    }

    if (ch === '/' && source[i + 1] === '*') {
      commentsFound = true;
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      while (i < stop) {
        // Newlines survive so reported line numbers still match the file.
        if (source[i] !== '\n') out[i] = ' ';
        i += 1;
      }
      continue;
    }

    i += 1;
  }

  return { text: dropTrailingCommas(out.join('')), commentsFound };
}

/**
 * Remove a comma whose next significant character closes its container.
 *
 * Runs on comment-blanked text, so a comma that only *looked* trailing
 * because a comment sat between it and the brace is handled correctly.
 */
function dropTrailingCommas(source: string): string {
  const out = source.split('');
  let i = 0;

  while (i < source.length) {
    if (source[i] === '"') {
      i += 1;
      while (i < source.length) {
        if (source[i] === '\\') {
          i += 2;
          continue;
        }
        if (source[i] === '"') {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    if (source[i] === ',') {
      let j = i + 1;
      while (j < source.length && /\s/.test(source[j])) j += 1;
      if (source[j] === '}' || source[j] === ']') out[i] = ' ';
    }

    i += 1;
  }

  return out.join('');
}

/** Parse JSON with comments and trailing commas. Throws like `JSON.parse`. */
export function parseJsonc(source: string): unknown {
  return JSON.parse(scan(source).text);
}

/**
 * Whether the source carries comments praxis would destroy by rewriting it.
 *
 * Callers use this to warn before a write, never to decide how to parse:
 * parsing is unconditional.
 */
export function hasComments(source: string): boolean {
  return scan(source).commentsFound;
}
