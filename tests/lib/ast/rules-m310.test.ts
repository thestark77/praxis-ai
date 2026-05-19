import { describe, it, expect } from 'vitest';
import { inspectBashCommand } from '../../../src/lib/ast/inspect.js';

describe('git-update-ref', () => {
  it('denies `git update-ref refs/heads/main <sha>`', () => {
    const r = inspectBashCommand('git update-ref refs/heads/main abc123');
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'git-update-ref')).toBe(true);
  });

  it('denies `git update-ref refs/tags/v1.0 <sha>`', () => {
    const r = inspectBashCommand('git update-ref refs/tags/v1.0 abc123');
    expect(r.decision).toBe('deny');
  });

  it('allows `git update-ref refs/notes/commits <sha>` (notes, not branches/tags)', () => {
    const r = inspectBashCommand('git update-ref refs/notes/commits abc123');
    expect(r.decision).toBe('allow');
  });

  it('reports reversibility class history-rewrite', () => {
    const r = inspectBashCommand('git update-ref refs/heads/main abc123');
    expect(r.reason).toContain('history-rewrite');
  });
});

describe('git-filter-branch', () => {
  it('denies any `git filter-branch ...` invocation', () => {
    const r = inspectBashCommand('git filter-branch --tree-filter "rm -rf .secret" HEAD');
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'git-filter-branch')).toBe(true);
  });

  it('allows non-git-filter commands', () => {
    expect(inspectBashCommand('git filter-spec foo').decision).toBe('allow');
  });

  it('reports reversibility class history-rewrite', () => {
    const r = inspectBashCommand('git filter-branch --env-filter "true" HEAD');
    expect(r.reason).toContain('history-rewrite');
  });
});

describe('npm-install-force', () => {
  it('denies `npm install --force`', () => {
    const r = inspectBashCommand('npm install --force');
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'npm-install-force')).toBe(true);
  });

  it('denies `npm i -f some-package`', () => {
    const r = inspectBashCommand('npm i -f react@18');
    expect(r.decision).toBe('deny');
  });

  it('denies `pnpm install --force`', () => {
    const r = inspectBashCommand('pnpm install --force');
    expect(r.decision).toBe('deny');
  });

  it('denies `yarn add --force foo`', () => {
    const r = inspectBashCommand('yarn add --force foo');
    expect(r.decision).toBe('deny');
  });

  it('allows `npm install` without --force', () => {
    expect(inspectBashCommand('npm install').decision).toBe('allow');
  });

  it('allows `npm install react` without --force', () => {
    expect(inspectBashCommand('npm install react').decision).toBe('allow');
  });

  it('reports reversibility class exec-bypass', () => {
    const r = inspectBashCommand('npm install --force');
    expect(r.reason).toContain('exec-bypass');
  });
});
