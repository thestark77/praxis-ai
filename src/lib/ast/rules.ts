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
  | 'sudo-escalation';

export interface RuleHit {
  ruleId: string;
  reversibilityClass: ReversibilityClass;
  message: string;
}

export interface Rule {
  id: string;
  inspect(command: string): RuleHit | null;
}

function tokens(command: string): string[] {
  return command.split(/\s+/).filter(Boolean);
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

// Encoded execution patterns. Hash detection on the operative tokens.
const encodedExecution: Rule = {
  id: 'encoded-execution',
  inspect(command) {
    // base64 -d | sh, base64 --decode | bash, xxd -r, etc.
    if (
      /\b(base64|base32|xxd|openssl)\b/.test(command) &&
      /\b(sh|bash|zsh|fish|exec|eval)\b/.test(command)
    ) {
      return {
        ruleId: 'encoded-execution',
        reversibilityClass: 'exec-bypass',
        message:
          'Decoding a payload (base64/xxd/openssl) into a shell or eval is a deny-list bypass pattern.',
      };
    }
    // Hex-encoded printf piped to a shell.
    if (
      /\bprintf\s+["']?\\x[0-9a-fA-F]{2}/.test(command) &&
      /\b(sh|bash|exec|eval)\b/.test(command)
    ) {
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

export const DEFAULT_RULES: Rule[] = [
  rmDangerous,
  findDelete,
  gitForcePush,
  gitResetHard,
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
];
