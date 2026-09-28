// Rules for the praxis-ai AST PreToolUse hook.
//
// Each rule inspects a single tokenised command (after the bash
// tokeniser has split chains). A rule returns null when the command is
// safe, or a `RuleHit` describing what the rule matched and why.
//
// The deny list in settings.json catches simple regex patterns. These
// rules are the second line of defence: they catch the bypasses regex
// silently misses (encoded payloads, indirect execution, multi-command
// chains, recursive deletes via tools the regex never names).

export type ReversibilityClass =
  | 'history-rewrite'
  | 'data-loss'
  | 'publish'
  | 'delete'
  | 'secrets'
  | 'exec-bypass'
  | 'sudo-escalation'
  | 'guard-evasion';

export interface RuleHit {
  ruleId: string;
  reversibilityClass: ReversibilityClass;
  message: string;
}

export interface Rule {
  id: string;
  inspect(command: string): RuleHit | null;
}

/**
 * Strip single- and double-quoted regions from a command string so a
 * downstream whitespace split sees only the operative tokens.
 *
 * Without this, rules like `rm-recursive-force` or `no-verify` fire on
 * prose tokens inside `git commit -m "..."`: the message body is one
 * shell word but a naive `split(/\s+/)` treats every space inside it as
 * a token boundary. The original tokeniser in `tokeniser.ts` already
 * respects quote contexts; this helper does the same minimal job for
 * the simpler token-based rules so they aren't fooled by commit
 * messages or docstrings discussing the dangerous pattern verbatim.
 */
function stripQuoted(command: string): string {
  let out = '';
  let i = 0;
  while (i < command.length) {
    const ch = command[i];
    if (ch === "'") {
      const end = command.indexOf("'", i + 1);
      if (end === -1) {
        out += ch;
        i++;
        continue;
      }
      i = end + 1;
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      while (j < command.length) {
        if (command[j] === '\\' && j + 1 < command.length) {
          j += 2;
          continue;
        }
        if (command[j] === '"') break;
        j++;
      }
      i = j + 1;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

function tokens(command: string): string[] {
  return stripQuoted(command).split(/\s+/).filter(Boolean);
}

/** Last path segment of a token, whichever slash style it uses. */
function basename(word: string): string {
  const cut = Math.max(word.lastIndexOf('/'), word.lastIndexOf('\\'));
  return cut === -1 ? word : word.slice(cut + 1);
}

// rm -rf in any form: -rf, -r -f, -fr, -Rf, --recursive --force, etc.
const rmDangerous: Rule = {
  id: 'rm-recursive-force',
  inspect(command) {
    const toks = tokens(command);
    if (toks[0] !== 'rm') return null;
    let recursive = false;
    let force = false;
    for (const t of toks.slice(1)) {
      if (t === '--recursive' || t === '-r' || t === '-R') recursive = true;
      else if (t === '--force' || t === '-f') force = true;
      else if (t.startsWith('-') && !t.startsWith('--')) {
        for (const ch of t.slice(1)) {
          if (ch === 'r' || ch === 'R') recursive = true;
          if (ch === 'f') force = true;
        }
      }
    }
    if (recursive && force) {
      return {
        ruleId: 'rm-recursive-force',
        reversibilityClass: 'data-loss',
        message: '`rm` with both recursive and force flags. This is irreversible.',
      };
    }
    return null;
  },
};

// find ... -delete or find ... -exec rm
const findDelete: Rule = {
  id: 'find-delete',
  inspect(command) {
    const toks = tokens(command);
    if (toks[0] !== 'find') return null;
    if (toks.includes('-delete')) {
      return {
        ruleId: 'find-delete',
        reversibilityClass: 'data-loss',
        message: '`find -delete` removes files matching a pattern. Irreversible.',
      };
    }
    const execIdx = toks.indexOf('-exec');
    if (execIdx >= 0 && toks[execIdx + 1] === 'rm') {
      return {
        ruleId: 'find-delete',
        reversibilityClass: 'data-loss',
        message: '`find -exec rm` removes files matching a pattern. Irreversible.',
      };
    }
    return null;
  },
};

// git force-push variants (--force, -f, --force-with-lease)
const gitForcePush: Rule = {
  id: 'git-force-push',
  inspect(command) {
    const toks = tokens(command);
    if (toks[0] !== 'git') return null;
    if (toks[1] !== 'push') return null;
    for (const t of toks.slice(2)) {
      if (t === '--force' || t === '-f' || t.startsWith('--force-with-lease')) {
        return {
          ruleId: 'git-force-push',
          reversibilityClass: 'history-rewrite',
          message:
            'Force-push overwrites remote history. Even `--force-with-lease` rewrites published commits.',
        };
      }
    }
    return null;
  },
};

// git reset --hard
const gitResetHard: Rule = {
  id: 'git-reset-hard',
  inspect(command) {
    const toks = tokens(command);
    if (toks[0] !== 'git' || toks[1] !== 'reset') return null;
    if (toks.includes('--hard')) {
      return {
        ruleId: 'git-reset-hard',
        reversibilityClass: 'data-loss',
        message: '`git reset --hard` discards uncommitted changes. Irreversible.',
      };
    }
    return null;
  },
};

// Any `--no-verify` (skips hooks/signing)
const noVerify: Rule = {
  id: 'no-verify',
  inspect(command) {
    if (tokens(command).some((t) => t === '--no-verify' || t === '--no-gpg-sign')) {
      return {
        ruleId: 'no-verify',
        reversibilityClass: 'exec-bypass',
        message:
          '`--no-verify` or `--no-gpg-sign` bypasses pre-commit hooks or signature requirements.',
      };
    }
    return null;
  },
};

// sudo + anything in this prompt-mode (we never need sudo)
const sudoEscalation: Rule = {
  id: 'sudo-escalation',
  inspect(command) {
    const toks = tokens(command);
    if (toks[0] === 'sudo' || toks[0] === 'doas') {
      return {
        ruleId: 'sudo-escalation',
        reversibilityClass: 'sudo-escalation',
        message: 'Privilege escalation via sudo/doas is blocked in praxis-ai sessions.',
      };
    }
    return null;
  },
};

// Encoded execution patterns.
//
// The rules require an ACTUAL pipe (or eval/exec invocation) between the
// decoder and the shell — not just keyword co-occurrence anywhere in the
// command. This prevents prose-level false positives where a commit
// message or docstring discusses the pattern verbatim. Same tightening
// applied to curl-pipe-shell in M3.6.
const encodedExecution: Rule = {
  id: 'encoded-execution',
  inspect(command) {
    // Decoder piped into a shell: base64/base32/xxd/openssl … | (sh|bash|...).
    if (
      /\b(base64|base32|xxd|openssl)\b\s+[^|]*\|\s*(sh|bash|zsh|fish|exec|eval)\b/.test(command)
    ) {
      return {
        ruleId: 'encoded-execution',
        reversibilityClass: 'exec-bypass',
        message:
          'Decoding a payload (base64/xxd/openssl) into a shell or eval is a deny-list bypass pattern.',
      };
    }
    // Decoder result passed as the operand of eval/exec/$(...) | sh.
    // e.g. eval "$(echo cm0gLXJmIC8= | base64 -d)"
    if (/\b(eval|exec)\s+["']?\$\([^)]*\b(base64|base32|xxd|openssl)\b[^)]*\)/.test(command)) {
      return {
        ruleId: 'encoded-execution',
        reversibilityClass: 'exec-bypass',
        message:
          'eval/exec of a command-substitution body that decodes a payload is a deny-list bypass pattern.',
      };
    }
    // Hex-encoded printf piped to a shell.
    if (/\bprintf\s+["']?\\x[0-9a-fA-F]{2}[^|]*\|\s*(sh|bash|exec|eval)\b/.test(command)) {
      return {
        ruleId: 'encoded-execution',
        reversibilityClass: 'exec-bypass',
        message: 'Hex-encoded printf piped to a shell is a deny-list bypass pattern.',
      };
    }
    return null;
  },
};

// dd to a block device
const ddDevice: Rule = {
  id: 'dd-block-device',
  inspect(command) {
    if (!/^\s*dd\b/.test(command)) return null;
    if (/of=\/dev\/(sd|nvme|hd|disk)/.test(command)) {
      return {
        ruleId: 'dd-block-device',
        reversibilityClass: 'data-loss',
        message: '`dd of=/dev/sdX` overwrites a block device. Irreversible.',
      };
    }
    return null;
  },
};

// Disk-format tools
const mkfs: Rule = {
  id: 'mkfs',
  inspect(command) {
    if (/^\s*(mkfs|mkfs\.\w+|wipefs|shred)\b/.test(command)) {
      return {
        ruleId: 'mkfs',
        reversibilityClass: 'data-loss',
        message: 'Filesystem creation, wipe, or shred is irreversible.',
      };
    }
    return null;
  },
};

// chmod -R 777 / 666 — recursive world-writable permissions
const chmodPermissive: Rule = {
  id: 'chmod-recursive-permissive',
  inspect(command) {
    const toks = tokens(command);
    if (toks[0] !== 'chmod') return null;
    let recursive = false;
    let permissive = false;
    for (const t of toks.slice(1)) {
      if (t === '-R' || t === '--recursive') recursive = true;
      else if (t.startsWith('-') && !t.startsWith('--')) {
        if (t.includes('R')) recursive = true;
      }
      // 4-digit (with setuid/sticky) or 3-digit octal modes ending in 6 or 7
      // for the world byte indicate world-writable.
      if (/^[0-7]{3,4}$/.test(t)) {
        const worldDigit = t.slice(-1);
        if (worldDigit === '6' || worldDigit === '7') permissive = true;
      }
      if (t === '777' || t === '666' || t.endsWith(',o+w') || t === 'a+w') permissive = true;
    }
    if (recursive && permissive) {
      return {
        ruleId: 'chmod-recursive-permissive',
        reversibilityClass: 'data-loss',
        message:
          '`chmod -R` to a world-writable mode (e.g. 777, 666) exposes the tree to any user. Hard to walk back without an audit.',
      };
    }
    return null;
  },
};

// chown -R against an unbounded path — risk of catastrophic ownership flip
const chownRecursive: Rule = {
  id: 'chown-recursive',
  inspect(command) {
    const toks = tokens(command);
    if (toks[0] !== 'chown') return null;
    let recursive = false;
    let rootlikeTarget = false;
    for (const t of toks.slice(1)) {
      if (t === '-R' || t === '--recursive') recursive = true;
      else if (t.startsWith('-') && !t.startsWith('--')) {
        if (t.includes('R')) recursive = true;
      }
      // Catch unbounded targets that flip ownership of the world.
      if (t === '/' || t === '/*' || t === '/usr' || t === '/etc' || t === '/var') {
        rootlikeTarget = true;
      }
    }
    if (recursive && rootlikeTarget) {
      return {
        ruleId: 'chown-recursive',
        reversibilityClass: 'data-loss',
        message:
          '`chown -R` against `/`, `/usr`, `/etc`, or `/var` rewrites system ownership. Hard to recover without a known-good backup.',
      };
    }
    return null;
  },
};

// tar with --absolute-names / -P / -C / over an unsafe directory
const tarAbsolute: Rule = {
  id: 'tar-absolute-names',
  inspect(command) {
    const toks = tokens(command);
    if (toks[0] !== 'tar') return null;
    let absolute = false;
    let extracting = false;
    for (const t of toks.slice(1)) {
      if (t === '--absolute-names' || t === '-P') absolute = true;
      // -x or any flag bundle containing x means extract
      if (t === '-x' || t === '--extract' || t === '--get') extracting = true;
      else if (t.startsWith('-') && !t.startsWith('--')) {
        if (t.includes('x')) extracting = true;
        if (t.includes('P')) absolute = true;
      }
    }
    if (absolute && extracting) {
      return {
        ruleId: 'tar-absolute-names',
        reversibilityClass: 'data-loss',
        message:
          '`tar -x --absolute-names` writes outside the current working directory at archive-controlled paths. Path-traversal risk.',
      };
    }
    return null;
  },
};

// curl | sh and wget | sh — remote-code-execution patterns.
// The regex requires whitespace + at least one non-pipe arg after
// curl/wget/fetch so prose mentions of the pattern (e.g. in commit
// messages or docstrings) like `curl|sh` are not false-positives.
const curlPipeShell: Rule = {
  id: 'curl-pipe-shell',
  inspect(command) {
    if (/\b(curl|wget|fetch)\s+[^|]+\|\s*(sh|bash|zsh|fish|exec|eval)\b/.test(command)) {
      return {
        ruleId: 'curl-pipe-shell',
        reversibilityClass: 'exec-bypass',
        message:
          'Piping a download (curl/wget/fetch) directly into a shell executes remote code without inspection.',
      };
    }
    return null;
  },
};

// pip install --target /
const pipInstallTarget: Rule = {
  id: 'pip-install-target-root',
  inspect(command) {
    const toks = tokens(command);
    if (toks[0] !== 'pip' && toks[0] !== 'pip3') return null;
    if (toks[1] !== 'install') return null;
    for (let i = 2; i < toks.length; i++) {
      const t = toks[i];
      if ((t === '--target' || t === '-t') && toks[i + 1]) {
        const dest = toks[i + 1];
        if (dest === '/' || dest.startsWith('/usr') || dest.startsWith('/etc')) {
          return {
            ruleId: 'pip-install-target-root',
            reversibilityClass: 'data-loss',
            message: '`pip install --target` to `/`, `/usr`, or `/etc` overwrites system files.',
          };
        }
      }
    }
    return null;
  },
};

// git update-ref against refs/heads/* or refs/tags/* — bypasses the
// porcelain layer, rewrites a ref to an arbitrary commit, leaves no
// reflog entry for the previous tip in many cases.
const gitUpdateRef: Rule = {
  id: 'git-update-ref',
  inspect(command) {
    const toks = tokens(command);
    if (toks[0] !== 'git' || toks[1] !== 'update-ref') return null;
    // Look for a ref argument that looks like refs/heads or refs/tags.
    for (const t of toks.slice(2)) {
      if (t.startsWith('refs/heads/') || t.startsWith('refs/tags/')) {
        return {
          ruleId: 'git-update-ref',
          reversibilityClass: 'history-rewrite',
          message:
            '`git update-ref` against `refs/heads/*` or `refs/tags/*` bypasses the porcelain layer and rewrites a ref to an arbitrary commit. Hard to walk back.',
        };
      }
    }
    return null;
  },
};

// git filter-branch — rewrites every commit on every ref the filter
// touches. Bulk history rewrite.
const gitFilterBranch: Rule = {
  id: 'git-filter-branch',
  inspect(command) {
    const toks = tokens(command);
    if (toks[0] !== 'git' || toks[1] !== 'filter-branch') return null;
    return {
      ruleId: 'git-filter-branch',
      reversibilityClass: 'history-rewrite',
      message:
        '`git filter-branch` rewrites every commit on every ref it touches. Recovery requires the reflog to still hold the old tips.',
    };
  },
};

// npm install --force / -f — skips peer-dependency conflict resolution
// and silently overwrites the lockfile contract. Often used to mask
// a real dependency-graph problem.
const npmInstallForce: Rule = {
  id: 'npm-install-force',
  inspect(command) {
    const toks = tokens(command);
    if (toks[0] !== 'npm' && toks[0] !== 'pnpm' && toks[0] !== 'yarn') return null;
    if (toks[1] !== 'install' && toks[1] !== 'i' && toks[1] !== 'add') return null;
    for (const t of toks.slice(2)) {
      if (t === '--force' || t === '-f') {
        return {
          ruleId: 'npm-install-force',
          reversibilityClass: 'exec-bypass',
          message:
            '`npm install --force` (or pnpm/yarn equivalent) skips peer-dependency conflict resolution. Often masks a real dependency-graph problem and writes a lockfile that lies.',
        };
      }
    }
    return null;
  },
};

// Wrappers that run the next word as the program. Together with leading
// `VAR=value` assignments, they would otherwise hide a path-form git from
// a check that only looks at the first token (`env /usr/bin/git ...`).
//
// `sudo` and `doas` are deliberately absent: they are already denied
// outright by `sudo-escalation` regardless of what they wrap, so adding
// them here would be redundant, not more thorough.
const PROGRAM_WRAPPERS = new Set([
  'env',
  'command',
  'exec',
  'nohup',
  'nice',
  'time',
  'builtin',
  'timeout',
  'stdbuf',
  'setsid',
  'xargs',
]);

/**
 * Wrapper flags that consume a separate following argument as their value
 * (`env -u NAME`, not `env -uNAME`), so that argument must not be
 * mistaken for the program name. Flags not listed here are assumed to take
 * no value and are skipped on their own (`stdbuf -oL`, `nice -5`), and an
 * *attached* value (`xargs -I{}`, no space) needs no entry either — it is
 * one token and the generic flag-skip in `resolveEffectiveInvocation`
 * consumes it whole.
 *
 * `env`'s `-S`/`--split-string` is deliberately NOT listed here even
 * though it takes a value: that value is not an inert argument to skip
 * past, it is itself a full command line (the shebang-line idiom
 * `#!/usr/bin/env -S python3 -u`). `resolveEffectiveInvocation` special-
 * cases it so the value is handed back as a nested command to inspect,
 * not silently skipped.
 */
const WRAPPER_VALUE_FLAGS: Record<string, Set<string>> = {
  env: new Set(['-u', '--unset', '-C', '--chdir']),
  timeout: new Set(['-k', '--kill-after', '--signal', '-s']),
  xargs: new Set(['-I', '-a', '-d', '-E', '-L', '-n', '-P', '-s']),
};

/** Shells whose `-c <body>` argument is a nested command line, not a plain program name. */
const SHELL_INTERPRETERS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);

/**
 * One parsed argv entry together with its `[start, end)` span in the
 * original command string. Spans are what let `normalizeSegment` rewrite
 * only the program word and leave everything after it — including a
 * commit message's original quoting — byte-for-byte untouched.
 */
interface ArgSpan {
  value: string;
  start: number;
  end: number;
}

/**
 * Parse `command` into shell-like argv entries with spans: unquoted runs
 * split on whitespace, while single- and double-quoted regions each
 * become part of the surrounding argument with their quotes removed (so a
 * quoted value containing whitespace, such as a `sh -c "..."` body, stays
 * one entry instead of being split apart).
 *
 * Outside quotes, a backslash escapes the next character — including a
 * quote, which is what lets the standard `'\''` idiom (close a single-
 * quoted run, emit one literal `'` via escape, reopen) round-trip
 * correctly instead of being misread as an empty quoted segment. This
 * matters for real evasions, not just cosmetics: a nested
 * `bash -c '...'\''...'` chain built with this idiom is exactly the shape
 * an attacker (or an agent probing for gaps) would reach for to smuggle a
 * dangerous inner command past a naive quote scanner, and it is valid
 * input a real shell accepts. The one exception is `\<newline>`, a line
 * continuation: real shells elide the pair entirely rather than emitting
 * a literal newline, which is what keeps `rm \<newline>  -rf x` one token
 * instead of splitting into a bogus newline-only entry.
 */
function argvWithSpans(command: string): ArgSpan[] {
  const args: ArgSpan[] = [];
  let buf = '';
  let hasContent = false;
  let start = -1;
  let i = 0;
  const flush = (end: number): void => {
    if (hasContent) {
      args.push({ value: buf, start, end });
    }
    buf = '';
    hasContent = false;
    start = -1;
  };
  while (i < command.length) {
    const ch = command[i]!;
    if (ch === '\\' && i + 1 < command.length) {
      const next = command[i + 1]!;
      if (next === '\n') {
        // Line continuation: elided, not an escaped literal newline.
        i += 2;
        continue;
      }
      if (start === -1) start = i;
      buf += next;
      hasContent = true;
      i += 2;
      continue;
    }
    if (ch === "'") {
      if (start === -1) start = i;
      const end = command.indexOf("'", i + 1);
      buf += end === -1 ? command.slice(i + 1) : command.slice(i + 1, end);
      hasContent = true;
      i = end === -1 ? command.length : end + 1;
      continue;
    }
    if (ch === '"') {
      if (start === -1) start = i;
      let j = i + 1;
      while (j < command.length) {
        if (command[j] === '\\' && j + 1 < command.length) {
          buf += command[j + 1];
          j += 2;
          continue;
        }
        if (command[j] === '"') break;
        buf += command[j];
        j++;
      }
      hasContent = true;
      i = j < command.length ? j + 1 : command.length;
      continue;
    }
    if (/\s/.test(ch)) {
      flush(i);
      i++;
      continue;
    }
    if (start === -1) start = i;
    buf += ch;
    hasContent = true;
    i++;
  }
  flush(command.length);
  return args;
}

/** Argv values only, for callers that do not need original-text spans. */
function argv(command: string): string[] {
  return argvWithSpans(command).map((s) => s.value);
}

/**
 * Search a shell's own argv (everything after the shell word itself) for
 * a `-c`/`-lc`/`-o pipefail -c`-style flag cluster and return the command
 * string that follows it. Returns `undefined` when no such flag is
 * present (`bash script.sh`, `bash -n script.sh`) — a positional argument
 * reached before any `-c` cluster means this is not a `-c` invocation.
 */
function findShellCArgument(rest: string[]): string | undefined {
  for (let i = 0; i < rest.length; i++) {
    const t = rest[i]!;
    if (t === '-o') {
      i++;
      continue;
    }
    if (/^-[A-Za-z]+$/.test(t) && t.includes('c')) {
      return rest[i + 1];
    }
    if (!t.startsWith('-')) break;
  }
  return undefined;
}

interface EffectiveInvocation {
  /** Index into the argv array of the actual program token, after skipping
   *  `VAR=value` assignments and `PROGRAM_WRAPPERS` prefixes. */
  programIndex?: number;
  /**
   * A command line this invocation hands off to another shell for
   * execution: a shell's `-c`/`-lc`/`-o pipefail -c` body, `eval`'s
   * concatenated arguments, or `env -S`'s split-string value. The caller
   * enqueues it for full re-inspection instead of treating this segment's
   * own tokens as the whole story.
   */
  nestedCommand?: string;
}

/**
 * Resolve what a command segment actually runs: walk past `VAR=value`
 * assignments and `PROGRAM_WRAPPERS` (matched by basename, so a path-form
 * wrapper counts too) to find the effective program, and — when that
 * program is a shell, `eval`, or `env -S` — surface the command line it
 * hands off to as `nestedCommand` instead of silently treating this
 * segment's own argv as the complete picture.
 *
 * This does not itself follow `nestedCommand` recursively: unlike the
 * inspector's own worklist (bounded by `MAX_NESTING`, which also splits
 * chains and substitutions inside the nested body), a second call here
 * would only ever look at the nested body's first word, missing a tail
 * after `&&`/`;`/`|`. The caller (`inspect.ts`) re-enters the inspector on
 * the nested command instead — see `extractNestedCommand`.
 */
function resolveEffectiveInvocation(argvList: string[]): EffectiveInvocation {
  let i = 0;
  let currentWrapper: string | undefined;
  while (i < argvList.length) {
    const t = argvList[i]!;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) {
      i++;
      continue;
    }
    if (currentWrapper === 'env' && (t === '-S' || t === '--split-string')) {
      return argvList[i + 1] !== undefined ? { nestedCommand: argvList[i + 1] } : {};
    }
    if (currentWrapper) {
      const valueFlags = WRAPPER_VALUE_FLAGS[currentWrapper];
      if (valueFlags?.has(t)) {
        i += 2;
        continue;
      }
      // Skip a bare numeric argument the wrapper consumes as its own value
      // rather than as the program to run (`timeout 5 ...`, `nice -n 5 ...`
      // once `-n` itself has been skipped as a flag): a duration or a
      // niceness level, not a program name.
      if (t.startsWith('-') || /^\d+[a-zA-Z]*$/.test(t)) {
        i++;
        continue;
      }
    }
    // Matched by basename, so a path-form wrapper (`/usr/bin/env`,
    // `/usr/bin/timeout`, ...) is recognised as a wrapper instead of being
    // mistaken for the effective program itself — which would stop the
    // walk one token too early and let a path-form git hide behind a
    // path-form wrapper undetected.
    if (PROGRAM_WRAPPERS.has(basename(t))) {
      currentWrapper = basename(t);
      i++;
      continue;
    }
    const base = basename(t);
    const rest = argvList.slice(i + 1);
    if (base === 'eval') {
      return { programIndex: i, nestedCommand: rest.length > 0 ? rest.join(' ') : undefined };
    }
    if (SHELL_INTERPRETERS.has(base)) {
      return { programIndex: i, nestedCommand: findShellCArgument(rest) };
    }
    return { programIndex: i };
  }
  return {};
}

/**
 * The wrapper-stripped, unquoted/unescaped form of a command segment: the
 * effective program word (`\git`, `g\it`, `"git"`, `'git'` all become
 * `git` — already unescaped and unquoted by `argvWithSpans` itself)
 * followed by everything after it in the ORIGINAL text, untouched.
 * Preserving the original tail — rather than rebuilding it from parsed
 * argv — is what keeps a commit message's quoting intact, so a rule like
 * `no-verify` does not start firing on `--no-verify` mentioned in prose
 * once it is no longer shielded by a wrapper prefix ahead of it.
 *
 * Returns `command` unchanged when there is nothing to resolve (`env -S`,
 * whose value replaces the rest of the invocation entirely rather than
 * leaving a program word in this segment) or nothing to strip (no wrapper
 * prefix, no escaping on the program word).
 */
export function normalizeSegment(command: string): string {
  const spans = argvWithSpans(command);
  const { programIndex } = resolveEffectiveInvocation(spans.map((s) => s.value));
  if (programIndex === undefined) return command;
  const span = spans[programIndex]!;
  return span.value + command.slice(span.end);
}

/**
 * A nested command line this segment hands off to another shell for
 * execution (`sh -c "..."`, `eval "..."`, `env -S "..."`), or `undefined`
 * when this segment runs a plain program. The caller (`inspect.ts`)
 * enqueues the result for full re-inspection — tokenising, segment
 * splitting, substitutions, normalization, and every rule — closing the
 * `bash -c "rm -rf /"` gap that a rule matching only `toks[0]` can never
 * see through on its own.
 */
export function extractNestedCommand(command: string): string | undefined {
  return resolveEffectiveInvocation(argv(command)).nestedCommand;
}

// git invoked by an absolute or relative path (e.g. `/usr/bin/git`,
// `./git`, `~/bin/git`) instead of the bare `git` on PATH. The only reason
// to spell it this way is to route around a shim installed on PATH under
// the name `git` — the shim never sees the call, so a rule that only
// checks `git`-branded subcommands (force-push, reset --hard, ...) is
// trivially bypassed by this one invocation shape. This rule denies the
// shape itself, regardless of subcommand: a bypass path that only fires on
// dangerous subcommands still lets an agent probe which subcommands are
// covered.
//
// This rule only ever looks at `toks[0]` of whatever text it is given. It
// catches a wrapped, escaped, or quoted path-form git only because the
// inspector (`inspect.ts`) runs every rule against both the raw segment
// and `normalizeSegment`'s wrapper-stripped, unescaped form — see that
// module's worklist loop. A path that merely appears as an *argument* to
// a non-executing command (`ls -l /usr/bin/git`, `which git`) is not
// `toks[0]` and stays allowed.
const gitPathInvocation: Rule = {
  id: 'git-path-invocation',
  inspect(command) {
    const prog = tokens(command)[0];
    if (!prog || !prog.includes('/')) return null;
    if (basename(prog) !== 'git') return null;
    return {
      ruleId: 'git-path-invocation',
      reversibilityClass: 'guard-evasion',
      message:
        `Invoking git via a path (\`${prog}\`) instead of the bare \`git\` on PATH routes ` +
        'around any shim installed under that name. Use plain `git`.',
    };
  },
};

/**
 * Words in a command, including quoted content — unlike `tokens()`, which
 * strips quoted regions away entirely for the simpler prose-insensitive
 * rules. Quoted content is itself split on whitespace, so a quoted path
 * (`"$HOME/.../bypass.token"`) stays one word when it has no internal
 * space, while quoted prose (`"bypass token"`) still splits into the two
 * separate words a human would read it as. This is what lets
 * `read-bypass-token` see through quoting without also flagging prose.
 */
function wordsIncludingQuoted(command: string): string[] {
  const words: string[] = [];
  let buf = '';
  const flushBuf = (): void => {
    if (buf.length > 0) words.push(buf);
    buf = '';
  };
  const appendQuoted = (inner: string): void => {
    const parts = inner.split(/\s+/);
    if (parts.length === 1) {
      buf += parts[0];
      return;
    }
    buf += parts[0];
    flushBuf();
    for (let k = 1; k < parts.length - 1; k++) {
      if (parts[k]) words.push(parts[k]);
    }
    buf = parts[parts.length - 1] ?? '';
  };
  let i = 0;
  while (i < command.length) {
    const ch = command[i]!;
    if (ch === "'") {
      const end = command.indexOf("'", i + 1);
      appendQuoted(end === -1 ? command.slice(i + 1) : command.slice(i + 1, end));
      i = end === -1 ? command.length : end + 1;
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      let inner = '';
      while (j < command.length) {
        if (command[j] === '\\' && j + 1 < command.length) {
          inner += command[j + 1];
          j += 2;
          continue;
        }
        if (command[j] === '"') break;
        inner += command[j];
        j++;
      }
      appendQuoted(inner);
      i = j < command.length ? j + 1 : command.length;
      continue;
    }
    if (/\s/.test(ch)) {
      flushBuf();
      i++;
      continue;
    }
    buf += ch;
    i++;
  }
  flushBuf();
  return words;
}

// Reading, copying, dumping, or otherwise touching a bypass-token file —
// e.g. `~/.local/state/iris-worktrees/bypass.token`, the token that lets a
// session skip the Iris git-worktree guard. The check is basename-based so
// it catches every reader (`cat`, `head`, `less`, `cp`, `base64`, `xxd`,
// redirection `< path`, ...) without enumerating them.
//
// The basename must contain `bypass` AND end with the literal `.token`
// extension (case-insensitive). An earlier version matched any basename
// containing both substrings anywhere, which denied unrelated commands
// that merely mention both words — a branch named `feat/bypass-token`, a
// grep for `bypass_token`, a `--grep=bypass-token` filter — none of which
// touch the actual token file. Requiring the `.token` suffix keeps the
// rule aimed at the file shape it exists to catch.
//
// It inspects `wordsIncludingQuoted`, not the quote-stripping `tokens()`,
// so a quoted path (`cat "$HOME/.../bypass.token"`, `cat '/x/bypass.token'`)
// cannot evade it by quoting alone — quoted prose ("bypass token" in a
// commit message, as two separate words) still stays allowed, because
// quoted content is itself split on whitespace before the basename check.
// A word starting with `-` is checked past its `=`, so `--opt=<path>`
// values are covered instead of every flag-shaped word being skipped.
// A word that exists only inside quotes must also look like a path
// (contain `/`, or start with `~` or `$`), so a commit message that merely
// names `bypass.token` stays allowed while `cat "./bypass.token"` does not.
// This filter still earns its keep under the narrower `.token`-suffix
// check above: without it, a quoted prose mention like `"remove
// bypass.token handling"` would itself parse as a bare `bypass.token`
// word and get denied.
//
// This is still a syntactic, basename-based check: a glob that avoids
// spelling the words out (e.g. `by*` expanding to the token file) cannot
// be caught here, and neither can a quote-concatenated or otherwise
// obfuscated name (e.g. `"byp"'ass.to'"ken"`) that never appears as one
// literal word. That residual gap is intent-level, not a parsing bug —
// see Layer 1 (`FIREWALL_DEFAULTS`) and the anticipatory-pause protocol in
// `templates/praxis-home/irreversibility-firewall.md` for the broader net.
const readBypassToken: Rule = {
  id: 'read-bypass-token',
  inspect(command) {
    const unquoted = new Set(tokens(command));
    for (const word of wordsIncludingQuoted(command)) {
      if (!unquoted.has(word) && !/\/|^[~$]/.test(word)) continue;
      let candidate = word;
      if (word.startsWith('-')) {
        const eq = word.indexOf('=');
        if (eq === -1) continue;
        candidate = word.slice(eq + 1);
      }
      const base = basename(candidate).toLowerCase();
      if (base.includes('bypass') && base.endsWith('.token')) {
        return {
          ruleId: 'read-bypass-token',
          reversibilityClass: 'secrets',
          message:
            `Touching a bypass-token path (\`${word}\`) is denied. A bypass token ` +
            '(e.g. `~/.local/state/iris-worktrees/bypass.token`) exists to let a session ' +
            'skip a guard; reading, printing, copying, or exfiltrating it defeats that ' +
            'guard for every session that trusts it.',
        };
      }
    }
    return null;
  },
};

// Git global options that take a separate value before the subcommand
// (`git -C repo branch ...`, `git -c k=v branch ...`). Their `--flag=value`
// spelling is handled separately: any leading `--xxx=yyy` token is skipped
// on its own regardless of which flag it is.
const GIT_GLOBAL_OPTS_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace']);

/**
 * Index of git's subcommand (`branch`, `push`, ...) in `argvList`, given
 * the index of `git` itself. Walks past global options — both the
 * space-separated form (`-C repo`, `--git-dir .git`) and the `--flag=value`
 * form — so `git -C repo branch -D x` is not missed by a check that only
 * ever looked at `argvList[gitIndex + 1]`.
 */
function gitSubcommandIndex(argvList: string[], gitIndex: number): number {
  let i = gitIndex + 1;
  while (i < argvList.length) {
    const t = argvList[i]!;
    if (t.startsWith('--') && t.includes('=')) {
      i++;
      continue;
    }
    if (GIT_GLOBAL_OPTS_WITH_VALUE.has(t)) {
      i += 2;
      continue;
    }
    if (t.startsWith('-')) {
      i++;
      continue;
    }
    break;
  }
  return i;
}

// `git branch -D` (and every spelling of delete+force: `--delete --force`,
// `-d --force`/`-f`, combined `-df`/`-Df`, and the unambiguous long-option
// abbreviations git itself accepts, e.g. `--del`, `--forc`) skips the
// merge check that plain `-d` enforces. `-d` alone stays allowed; so does
// `--merged`, which only lists branches.
//
// This rule only ever looks at `args[0]` of whatever text it is given —
// same as `git-path-invocation` above, it relies on the inspector running
// it against both the raw segment and `normalizeSegment`'s wrapper-
// stripped form to catch `env git branch -D x`, `GIT_DIR=... git branch
// -D x`, or a path-form wrapper. It still walks git's OWN global options
// itself (`-C repo`, `-c k=v`, `--git-dir=...`) via `gitSubcommandIndex`,
// since those are arguments git itself consumes before its subcommand,
// not a wrapper prefix normalization strips.
const gitBranchForceDelete: Rule = {
  id: 'git-branch-force-delete',
  inspect(command) {
    const args = argv(command);
    if (args[0] !== 'git') return null;
    const subIndex = gitSubcommandIndex(args, 0);
    if (args[subIndex] !== 'branch') return null;
    let deleting = false;
    let forced = false;
    for (const t of args.slice(subIndex + 1)) {
      if (t === '-D') {
        deleting = true;
        forced = true;
        continue;
      }
      if (t === '-d') {
        deleting = true;
        continue;
      }
      if (t === '-f') {
        forced = true;
        continue;
      }
      if (t.startsWith('-') && !t.startsWith('--')) {
        for (const ch of t.slice(1)) {
          if (ch === 'd' || ch === 'D') deleting = true;
          if (ch === 'D' || ch === 'f') forced = true;
        }
        continue;
      }
      // An unambiguous prefix of `--delete` or `--force` — git itself
      // accepts any long option abbreviated down to the shortest prefix
      // that still identifies it uniquely. Length 4 keeps `--d`/`--f` (too
      // short to be unambiguous against git's fuller option set) excluded
      // while still catching `--del`, `--delet`, `--forc`, and the like.
      if (t.startsWith('--') && t.length >= 4) {
        if ('--delete'.startsWith(t)) deleting = true;
        else if ('--force'.startsWith(t)) forced = true;
      }
    }
    if (deleting && forced) {
      return {
        ruleId: 'git-branch-force-delete',
        reversibilityClass: 'delete',
        message:
          '`git branch -D` (or `--delete`/`-d` combined with `--force`/`-f`, including their ' +
          'unambiguous abbreviations) deletes a branch even if it is not merged, discarding ' +
          'its commits with no reflog entry pointing back at them from any other ref. Verify ' +
          'first with `git branch --merged`, then delete with `-d`.',
      };
    }
    return null;
  },
};

export const DEFAULT_RULES: Rule[] = [
  rmDangerous,
  findDelete,
  gitForcePush,
  gitResetHard,
  gitUpdateRef,
  gitFilterBranch,
  gitBranchForceDelete,
  gitPathInvocation,
  readBypassToken,
  noVerify,
  sudoEscalation,
  encodedExecution,
  ddDevice,
  mkfs,
  chmodPermissive,
  chownRecursive,
  tarAbsolute,
  curlPipeShell,
  pipInstallTarget,
  npmInstallForce,
];
