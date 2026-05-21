// Dependency preflight for praxis-ai.
//
// gentle-ai's installer aborts if curl/git are missing but does NOT install
// system dependencies itself, and it never installs Go (Go is optional —
// the binary download path is used when brew/go are absent). praxis runs
// this preflight before any install side-effect so the user gets one clear,
// actionable error listing every missing dependency with a fix, instead of
// a half-finished install that fails midway.

import { spawnSync } from 'node:child_process';

export interface Dependency {
  name: string;
  /** Executable to probe on PATH. */
  bin: string;
  /** Why praxis/gentle-ai needs it. */
  reason: string;
  /** Install hint: a URL and/or a command per common platform. */
  hint: string;
  /** When true, a missing dep is a warning, not a hard abort. */
  optional?: boolean;
  /** Only required when the gentle-ai bootstrap will run. */
  bootstrapOnly?: boolean;
}

export const DEPENDENCIES: Dependency[] = [
  {
    name: 'node',
    bin: 'node',
    reason: 'praxis-ai and several gentle-ai components run on Node.js (>=18).',
    hint: 'https://nodejs.org/en/download (or `nvm install --lts`)',
  },
  {
    name: 'npm',
    bin: 'npm',
    reason: 'Installs praxis-ai and gentle-ai npm-based components.',
    hint: 'Ships with Node.js — https://nodejs.org/en/download',
  },
  {
    name: 'git',
    bin: 'git',
    reason: 'Required by the gentle-ai installer and for repo operations.',
    hint: 'https://git-scm.com/downloads (macOS: `brew install git`, Debian/Ubuntu: `sudo apt install git`)',
    bootstrapOnly: true,
  },
  {
    name: 'curl',
    bin: 'curl',
    reason: 'The gentle-ai installer downloads its binary via curl.',
    hint: 'https://curl.se/download.html (macOS: `brew install curl`, Debian/Ubuntu: `sudo apt install curl`)',
    bootstrapOnly: true,
  },
  {
    name: 'bash',
    bin: 'bash',
    reason: 'praxis executes the gentle-ai install.sh script via bash.',
    hint: 'Preinstalled on macOS/Linux. On Windows use WSL or Git Bash: https://gitforwindows.org',
    bootstrapOnly: true,
  },
  {
    name: 'go',
    bin: 'go',
    reason:
      'Optional. Only used if you force `gentle-ai`/`engram` install via the Go toolchain; the default binary-download path does not need it.',
    hint: 'https://go.dev/dl/ (optional — safe to skip)',
    optional: true,
    bootstrapOnly: true,
  },
];

export type DepProbe = (bin: string) => boolean;

const defaultProbe: DepProbe = (bin) => {
  // Synchronous PATH probe via `which`/`where`. Cross-platform-ish.
  const finder = process.platform === 'win32' ? 'where' : 'which';
  const res = spawnSync(finder, [bin], { stdio: 'ignore' });
  return res.status === 0;
};

export interface DependencyCheckResult {
  ok: boolean;
  missingRequired: Dependency[];
  missingOptional: Dependency[];
}

export interface DependencyCheckOptions {
  /** Whether the gentle-ai bootstrap will run (gates bootstrap-only deps). */
  includeBootstrap: boolean;
  /** Injectable PATH probe for tests. */
  probe?: DepProbe;
}

export function checkDependencies(opts: DependencyCheckOptions): DependencyCheckResult {
  const probe = opts.probe ?? defaultProbe;
  const missingRequired: Dependency[] = [];
  const missingOptional: Dependency[] = [];

  for (const dep of DEPENDENCIES) {
    if (dep.bootstrapOnly && !opts.includeBootstrap) continue;
    if (probe(dep.bin)) continue;
    if (dep.optional) {
      missingOptional.push(dep);
    } else {
      missingRequired.push(dep);
    }
  }

  return {
    ok: missingRequired.length === 0,
    missingRequired,
    missingOptional,
  };
}

/** Human-readable error block for missing required dependencies. */
export function formatMissingDependencies(missing: Dependency[]): string {
  const lines: string[] = [];
  lines.push('praxis install aborted — missing required dependencies:');
  lines.push('');
  for (const dep of missing) {
    lines.push(`  ✗ ${dep.name}`);
    lines.push(`      ${dep.reason}`);
    lines.push(`      install: ${dep.hint}`);
  }
  lines.push('');
  lines.push('Install the tools above, then re-run `praxis install`.');
  lines.push('To install the praxis overlay only (no gentle-ai bootstrap), use:');
  lines.push('  praxis install --no-gentle-ai');
  return lines.join('\n');
}

/** Human-readable note for missing optional dependencies. */
export function formatOptionalNote(missing: Dependency[]): string {
  if (missing.length === 0) return '';
  const lines: string[] = ['Optional dependencies not found (safe to ignore):'];
  for (const dep of missing) {
    lines.push(`  - ${dep.name}: ${dep.hint}`);
  }
  return lines.join('\n');
}
