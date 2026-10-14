// Narrow auto-approval for `rm` of a session's own temporary files.
//
// Claude Code asks before running some `rm` commands, most notably a
// `bash -c` script it cannot parse ("This shell -c script runs rm and could
// not be checked"). That ask is a built-in safety check: a PreToolUse
// `allow` does not answer it, only a PermissionRequest hook does. An
// unattended session has nobody to answer, so it auto-denies after a
// timeout and stalls.
//
// `evaluateSafeRm` decides whether such a request can be approved without a
// human. It approves only when it fully understands the command and every
// effect is a plain `rm` of an existing, non-directory file inside the
// session's own worktree (`~/worktrees/...`) or a Claude temp dir
// (`/tmp/claude-*/...`). Anything else — a flag beyond `-v`, a glob, a
// variable it cannot resolve, a command substitution, a pipe, `sudo`, any
// command other than `rm`/`echo`/`printf`/`true`/`:`, a path outside the
// roots — returns `allow: false`, and the human prompt stays exactly as it
// was. The parser is deliberately a small subset of shell: an unknown
// construct is a refusal, never a guess.

import { lstatSync, realpathSync, existsSync } from 'node:fs';
import { isAbsolute, relative, sep, dirname } from 'node:path';

export interface SafeRmContext {
  /** Working directory the command runs in (the hook input's `cwd`). */
  cwd: string;
  /** Home directory; `~` expansion and the `~/worktrees` root use it. */
  home: string;
  /** Base of the temp roots. Defaults to `/tmp`. Tests point it elsewhere. */
  tmpBase?: string;
  /** Owner uid the `claude-*` temp dir must have. Defaults to the process uid. */
  uid?: number;
}

export interface SafeRmVerdict {
  allow: boolean;
  /** Why the command was or was not approved. */
  reason: string;
  /** Resolved paths approved for removal (only when `allow`). */
  targets: string[];
}

/** Commands longer than this are never auto-approved. */
const MAX_COMMAND_LENGTH = 16_384;
/** Upper bound on approved targets, so a loop cannot fan out unboundedly. */
const MAX_TARGETS = 256;
/** How many nested `bash -c` hand-offs are followed. */
const MAX_DEPTH = 3;

class Unsupported extends Error {}

function refuse(reason: string): never {
  throw new Unsupported(reason);
}

// ---------------------------------------------------------------------------
// Lexer

type Part =
  { kind: 'lit'; text: string; quoted: boolean } | { kind: 'var'; name: string; quoted: boolean };

type Tok = { t: 'word'; parts: Part[] } | { t: 'op'; v: ';' | '&&' | '||' | '\n' } | { t: 'redir' };

const NAME = /^[A-Za-z_][A-Za-z0-9_]*/;
const GLOB_CHARS = new Set(['*', '?', '[']);

function lex(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  let parts: Part[] | null = null;

  const lit = (text: string, quoted: boolean): void => {
    parts ??= [];
    parts.push({ kind: 'lit', text, quoted });
  };
  const endWord = (): void => {
    if (parts !== null) toks.push({ t: 'word', parts });
    parts = null;
  };
  const readVar = (quoted: boolean): void => {
    // At `$`. Only `$NAME` and `${NAME}` are understood.
    if (src[i + 1] === '{') {
      const m = NAME.exec(src.slice(i + 2));
      if (!m || src[i + 2 + m[0].length] !== '}') refuse('unsupported parameter expansion');
      parts ??= [];
      parts.push({ kind: 'var', name: m[0], quoted });
      i += m[0].length + 3;
      return;
    }
    const m = NAME.exec(src.slice(i + 1));
    if (!m) refuse('command substitution or special parameter');
    parts ??= [];
    parts.push({ kind: 'var', name: m[0], quoted });
    i += m[0].length + 1;
  };
  const isFdPrefix = (): boolean =>
    parts !== null &&
    parts.length === 1 &&
    parts[0].kind === 'lit' &&
    !parts[0].quoted &&
    /^[0-9]$/.test(parts[0].text);
  const readRedirect = (): void => {
    // At `>` or `&>`. Only discarding output or duplicating stdout/stderr
    // is understood: `>/dev/null`, `2>/dev/null`, `&>/dev/null`,
    // `>>/dev/null`, `2>&1`, `>&2`.
    if (src[i] === '&') i++;
    i++; // '>'
    if (src[i] === '>') i++;
    if (src[i] === '&') {
      i++;
      if (!/^[12](?![^\s;&|])/.test(src.slice(i))) refuse('unsupported redirection');
      i++;
    } else {
      while (src[i] === ' ' || src[i] === '\t') i++;
      if (!/^\/dev\/null(?![^\s;&|])/.test(src.slice(i))) {
        refuse('output redirection to a file');
      }
      i += '/dev/null'.length;
    }
    parts = null;
    toks.push({ t: 'redir' });
  };

  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t') {
      endWord();
      i++;
    } else if (c === '\\') {
      if (src[i + 1] === '\n') {
        i += 2;
      } else if (i + 1 < src.length) {
        lit(src[i + 1], true);
        i += 2;
      } else {
        refuse('dangling backslash');
      }
    } else if (c === '\n') {
      endWord();
      toks.push({ t: 'op', v: '\n' });
      i++;
    } else if (c === ';') {
      endWord();
      if (src[i + 1] === ';') refuse('case syntax');
      toks.push({ t: 'op', v: ';' });
      i++;
    } else if (c === '&') {
      if (src[i + 1] === '&') {
        endWord();
        toks.push({ t: 'op', v: '&&' });
        i += 2;
      } else if (src[i + 1] === '>') {
        endWord();
        readRedirect();
      } else {
        refuse('background job');
      }
    } else if (c === '|') {
      endWord();
      if (src[i + 1] !== '|') refuse('pipeline');
      toks.push({ t: 'op', v: '||' });
      i += 2;
    } else if (c === '>') {
      if (!isFdPrefix()) endWord();
      readRedirect();
    } else if (c === '#' && parts === null) {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (c === "'") {
      const end = src.indexOf("'", i + 1);
      if (end < 0) refuse('unterminated quote');
      lit(src.slice(i + 1, end), true);
      i = end + 1;
    } else if (c === '$' && src[i + 1] === "'") {
      i += 2;
      let text = '';
      for (;;) {
        if (i >= src.length) refuse('unterminated quote');
        const d = src[i];
        if (d === "'") break;
        if (d === '\\') {
          const e = src[i + 1];
          const map: Record<string, string> = { n: '\n', t: '\t', '\\': '\\', "'": "'", '"': '"' };
          if (e === undefined || !(e in map)) refuse('unsupported ANSI-C escape');
          text += map[e];
          i += 2;
        } else {
          text += d;
          i++;
        }
      }
      lit(text, true);
      i++;
    } else if (c === '"') {
      i++;
      parts ??= [];
      for (;;) {
        if (i >= src.length) refuse('unterminated quote');
        const d = src[i];
        if (d === '"') break;
        if (d === '\\' && i + 1 < src.length && '$`"\\\n'.includes(src[i + 1])) {
          if (src[i + 1] !== '\n') lit(src[i + 1], true);
          i += 2;
        } else if (d === '$') {
          readVar(true);
        } else if (d === '`') {
          refuse('command substitution');
        } else {
          lit(d, true);
          i++;
        }
      }
      i++;
    } else if (c === '$') {
      readVar(false);
    } else if ('`()<{}'.includes(c)) {
      refuse(`unsupported shell syntax \`${c}\``);
    } else if (GLOB_CHARS.has(c)) {
      refuse('glob pattern');
    } else if (c === '~' && parts === null) {
      const rest = src.slice(i + 1);
      if (rest !== '' && !/^[/\s;&|]/.test(rest)) refuse('`~user` expansion');
      parts = [{ kind: 'var', name: '~', quoted: false }];
      i++;
    } else {
      lit(c, false);
      i++;
    }
  }
  endWord();
  return toks;
}

// ---------------------------------------------------------------------------
// Parser (subset: simple commands, `for NAME in WORDS; do ...; done`, and
// the `;` `&&` `||` newline separators)

type Word = Part[];
type Cmd =
  { kind: 'simple'; words: Word[] } | { kind: 'for'; name: string; items: Word[]; body: Cmd[] };

const RESERVED = new Set([
  'if',
  'then',
  'else',
  'elif',
  'fi',
  'case',
  'esac',
  'while',
  'until',
  'select',
  'function',
  'time',
  'coproc',
  '!',
  '[[',
  ']]',
  'in',
]);

/** The literal text of a word if it is one unquoted literal run. */
function bareWord(w: Word): string | undefined {
  if (w.every((p) => p.kind === 'lit' && !p.quoted)) {
    return w.map((p) => (p as { text: string }).text).join('');
  }
  return undefined;
}

function parse(toks: Tok[]): Cmd[] {
  let pos = 0;
  const skipSeps = (): void => {
    while (pos < toks.length && toks[pos].t === 'op') pos++;
  };
  const parseList = (terminator: string | null): Cmd[] => {
    const cmds: Cmd[] = [];
    for (;;) {
      skipSeps();
      if (pos >= toks.length) {
        if (terminator !== null) refuse(`missing \`${terminator}\``);
        return cmds;
      }
      const tok = toks[pos];
      const head = tok.t === 'word' ? bareWord(tok.parts) : undefined;
      if (terminator !== null && head === terminator) {
        pos++;
        return cmds;
      }
      if (head === 'for') {
        pos++;
        cmds.push(parseFor());
      } else if (head === 'do' || head === 'done') {
        refuse(`unexpected \`${head}\``);
      } else if (head !== undefined && RESERVED.has(head)) {
        refuse(`unsupported shell keyword \`${head}\``);
      } else {
        cmds.push(parseSimple());
      }
    }
  };
  const parseSimple = (): Cmd => {
    const words: Word[] = [];
    while (pos < toks.length && toks[pos].t !== 'op') {
      const tok = toks[pos];
      if (tok.t === 'word') words.push(tok.parts);
      pos++;
    }
    if (words.length === 0) refuse('redirection without a command');
    return { kind: 'simple', words };
  };
  const parseFor = (): Cmd => {
    const nameTok = toks[pos];
    const name = nameTok?.t === 'word' ? bareWord(nameTok.parts) : undefined;
    if (name === undefined || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) refuse('malformed for loop');
    pos++;
    const inTok = toks[pos];
    if (inTok?.t !== 'word' || bareWord(inTok.parts) !== 'in') refuse('for loop without `in`');
    pos++;
    const items: Word[] = [];
    while (pos < toks.length && toks[pos].t === 'word') {
      items.push((toks[pos] as { parts: Part[] }).parts);
      pos++;
    }
    if (pos >= toks.length || toks[pos].t !== 'op') refuse('malformed for loop');
    skipSeps();
    const doTok = toks[pos];
    if (doTok?.t !== 'word' || bareWord(doTok.parts) !== 'do') refuse('for loop without `do`');
    pos++;
    const body = parseList('done');
    return { kind: 'for', name, items, body };
  };
  return parseList(null);
}

// ---------------------------------------------------------------------------
// Evaluation

type Env = Map<string, string>;

interface EvalState {
  ctx: Required<SafeRmContext>;
  findRoot: (p: string) => string | undefined;
  targets: string[];
}

function expand(w: Word, env: Env, home: string): string {
  let out = '';
  for (const p of w) {
    if (p.kind === 'lit') {
      out += p.text;
      continue;
    }
    if (p.name === '~') {
      out += home;
      continue;
    }
    const value = env.get(p.name);
    if (value === undefined) refuse(`variable \`$${p.name}\` cannot be resolved statically`);
    if (!p.quoted && (value === '' || /[\s*?[\]{}~]/.test(value))) {
      refuse(`unquoted \`$${p.name}\` would be split or globbed`);
    }
    out += value;
  }
  return out;
}

const HARMLESS = new Set(['echo', 'printf', 'true', ':']);
const SHELLS = new Set(['bash', 'sh', 'dash']);

function evalList(cmds: Cmd[], env: Env, depth: number, st: EvalState): void {
  for (const cmd of cmds) {
    if (cmd.kind === 'for') {
      const values = cmd.items.map((w) => expand(w, env, st.ctx.home));
      for (const value of values) {
        const inner = new Map(env);
        inner.set(cmd.name, value);
        evalList(cmd.body, inner, depth, st);
      }
      continue;
    }
    const first = cmd.words[0];
    if (
      first.length > 0 &&
      first[0].kind === 'lit' &&
      !first[0].quoted &&
      /^[A-Za-z_]\w*\+?=/.test(first[0].text)
    ) {
      refuse('variable assignment');
    }
    const argv = cmd.words.map((w) => expand(w, env, st.ctx.home));
    const prog = argv[0];
    if (prog === 'rm') {
      checkRm(argv.slice(1), st);
    } else if (HARMLESS.has(prog)) {
      if (prog === 'printf' && argv[1] === '-v') refuse('`printf -v`');
    } else if (SHELLS.has(prog)) {
      evalShell(argv.slice(1), depth, st);
    } else {
      refuse(`\`${prog}\` is not part of the narrow rm exception`);
    }
  }
}

function evalShell(args: string[], depth: number, st: EvalState): void {
  if (depth >= MAX_DEPTH) refuse('shell nesting too deep');
  let k = 0;
  let hasC = false;
  while (k < args.length && !hasC) {
    const a = args[k];
    if (/^-[eux]*c[eux]*$/.test(a)) hasC = true;
    else if (!/^-[eux]+$/.test(a)) refuse(`unsupported shell option \`${a}\``);
    k++;
  }
  if (!hasC || k !== args.length - 1) refuse('shell invocation is not `sh -c SCRIPT`');
  run(args[k], depth + 1, st);
}

function checkRm(args: string[], st: EvalState): void {
  let endOfOptions = false;
  const operands: string[] = [];
  for (const a of args) {
    if (!endOfOptions && a === '--') {
      endOfOptions = true;
    } else if (!endOfOptions && a.startsWith('-') && a !== '-') {
      if (a === '-v' || a === '--verbose') continue;
      if (/^-[^-]*[rRf]/.test(a) || /^--(recursive|force)/.test(a)) {
        refuse(`recursive or force flag \`${a}\``);
      }
      refuse(`rm option \`${a}\` is not part of the narrow exception`);
    } else {
      operands.push(a);
    }
  }
  if (operands.length === 0) refuse('rm without a target');
  for (const op of operands) {
    st.targets.push(resolveTarget(op, st));
    if (st.targets.length > MAX_TARGETS) refuse('too many rm targets');
  }
}

/** Is `p` strictly inside `root`? Both must already be real paths. */
function inside(root: string, p: string): boolean {
  const rel = relative(root, p);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

function resolveTarget(operand: string, st: EvalState): string {
  if (operand === '' || operand.endsWith('/')) refuse(`\`${operand}\` is not a file path`);
  const slash = operand.lastIndexOf('/');
  const base = slash < 0 ? operand : operand.slice(slash + 1);
  if (base === '.' || base === '..') refuse(`\`${operand}\` is a directory`);
  let dirPart = slash < 0 ? '.' : operand.slice(0, slash) || '/';
  if (!isAbsolute(dirPart)) dirPart = `${st.ctx.cwd}/${dirPart}`;
  // `realpathSync.native` is libc realpath(3): it resolves `..` after the
  // symlinks before it, exactly as the kernel will when rm runs. The JS
  // `realpathSync` normalises `..` lexically first and would be fooled by
  // `link/../x`.
  let parent: string;
  try {
    parent = realpathSync.native(dirPart);
  } catch {
    refuse(`\`${operand}\` does not resolve to an existing directory`);
  }
  const full = parent === '/' ? `/${base}` : `${parent}/${base}`;
  let info;
  try {
    info = lstatSync(full);
  } catch {
    refuse(`\`${operand}\` does not exist`);
  }
  if (info.isDirectory()) refuse(`\`${operand}\` is a directory`);
  const checks = [full];
  if (info.isSymbolicLink()) {
    let pointee: string;
    try {
      pointee = realpathSync.native(full);
    } catch {
      refuse(`\`${operand}\` is a dangling symlink`);
    }
    checks.push(pointee);
  }
  for (const p of checks) {
    const root = st.findRoot(p);
    if (root === undefined)
      refuse(`\`${operand}\` resolves outside the session's worktree and temp dirs`);
    if (relative(root, p).split(sep).includes('.git'))
      refuse(`\`${operand}\` is inside a .git directory`);
  }
  return full;
}

function run(script: string, depth: number, st: EvalState): void {
  evalList(parse(lex(script)), new Map(), depth, st);
}

// ---------------------------------------------------------------------------
// Roots

function realOrNull(p: string): string | null {
  try {
    return realpathSync.native(p);
  } catch {
    return null;
  }
}

/**
 * Build the root lookup for a context. A session may delete from:
 *
 * - the git worktree that contains `cwd`, when that worktree sits under
 *   `~/worktrees` (the nearest ancestor of `cwd` holding a `.git` entry);
 * - any real `claude-*` directory directly under the temp base that the
 *   current user owns (Claude Code's per-user scratch tree).
 *
 * Returns the root that contains the real path `p`, or `undefined`.
 */
export function rootFinder(ctx: Required<SafeRmContext>): (p: string) => string | undefined {
  let worktree: string | undefined;
  const worktrees = realOrNull(`${ctx.home}/worktrees`);
  const cwd = realOrNull(ctx.cwd);
  if (worktrees && cwd && (cwd === worktrees || inside(worktrees, cwd))) {
    for (let dir = cwd; inside(worktrees, dir); dir = dirname(dir)) {
      if (existsSync(`${dir}/.git`)) {
        worktree = dir;
        break;
      }
    }
  }
  const tmp = realOrNull(ctx.tmpBase);
  return (p: string): string | undefined => {
    if (worktree !== undefined && inside(worktree, p)) return worktree;
    if (tmp === null || !inside(tmp, p)) return undefined;
    const parts = relative(tmp, p).split(sep);
    if (parts.length < 2 || !/^claude-./.test(parts[0])) return undefined;
    const candidate = `${tmp}/${parts[0]}`;
    try {
      const info = lstatSync(candidate);
      if (!info.isDirectory() || info.uid !== ctx.uid) return undefined;
    } catch {
      return undefined;
    }
    return candidate;
  };
}

// ---------------------------------------------------------------------------
// Entry point

export function evaluateSafeRm(command: string, context: SafeRmContext): SafeRmVerdict {
  const ctx: Required<SafeRmContext> = {
    tmpBase: '/tmp',
    uid: typeof process.getuid === 'function' ? process.getuid() : -1,
    ...context,
  };
  if (command.length > MAX_COMMAND_LENGTH) {
    return { allow: false, reason: 'command too long to check', targets: [] };
  }
  const st: EvalState = { ctx, findRoot: rootFinder(ctx), targets: [] };
  try {
    run(command, 0, st);
  } catch (err) {
    if (err instanceof Unsupported) return { allow: false, reason: err.message, targets: [] };
    throw err;
  }
  if (st.targets.length === 0) return { allow: false, reason: 'no rm target', targets: [] };
  return {
    allow: true,
    reason: 'every rm target is a file inside the session roots',
    targets: st.targets,
  };
}
