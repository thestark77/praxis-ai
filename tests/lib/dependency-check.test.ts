import { describe, it, expect } from 'vitest';
import {
  checkDependencies,
  formatMissingDependencies,
  formatOptionalNote,
  DEPENDENCIES,
  type Dependency,
} from '../../src/lib/dependency-check.js';

/** A probe that reports every bin in `present` as found, others missing. */
function probeOf(present: string[]) {
  const set = new Set(present);
  return (bin: string) => set.has(bin);
}

const ALL = DEPENDENCIES.map((d) => d.bin);

describe('checkDependencies', () => {
  it('passes when everything is present (bootstrap on)', () => {
    const r = checkDependencies({ includeBootstrap: true, probe: probeOf(ALL) });
    expect(r.ok).toBe(true);
    expect(r.missingRequired).toEqual([]);
    expect(r.missingOptional).toEqual([]);
  });

  it('flags missing required bootstrap deps (git, curl, bash)', () => {
    const r = checkDependencies({
      includeBootstrap: true,
      probe: probeOf(['node', 'npm', 'go']),
    });
    expect(r.ok).toBe(false);
    const names = r.missingRequired.map((d) => d.name).sort();
    expect(names).toEqual(['bash', 'curl', 'git']);
  });

  it('treats go as optional, not a hard failure', () => {
    const r = checkDependencies({
      includeBootstrap: true,
      probe: probeOf(['node', 'npm', 'git', 'curl', 'bash']),
    });
    expect(r.ok).toBe(true);
    expect(r.missingOptional.map((d) => d.name)).toEqual(['go']);
  });

  it('skips bootstrap-only deps when bootstrap is off', () => {
    // Only node + npm matter for the praxis-overlay-only path.
    const r = checkDependencies({
      includeBootstrap: false,
      probe: probeOf(['node', 'npm']),
    });
    expect(r.ok).toBe(true);
    expect(r.missingRequired).toEqual([]);
    expect(r.missingOptional).toEqual([]);
  });

  it('still requires node + npm even when bootstrap is off', () => {
    const r = checkDependencies({ includeBootstrap: false, probe: probeOf([]) });
    expect(r.ok).toBe(false);
    expect(r.missingRequired.map((d) => d.name).sort()).toEqual(['node', 'npm']);
  });
});

describe('formatMissingDependencies', () => {
  it('renders an actionable block with reason + install hint per dep', () => {
    const missing: Dependency[] = DEPENDENCIES.filter((d) => d.name === 'git');
    const out = formatMissingDependencies(missing);
    expect(out).toContain('missing required dependencies');
    expect(out).toContain('✗ git');
    expect(out).toContain('git-scm.com');
    expect(out).toContain('praxis install --no-gentle-ai');
  });
});

describe('formatOptionalNote', () => {
  it('is empty when nothing optional is missing', () => {
    expect(formatOptionalNote([])).toBe('');
  });

  it('lists optional deps with hints', () => {
    const go = DEPENDENCIES.filter((d) => d.name === 'go');
    const out = formatOptionalNote(go);
    expect(out).toContain('Optional dependencies');
    expect(out).toContain('go');
    expect(out).toContain('go.dev/dl');
  });
});
