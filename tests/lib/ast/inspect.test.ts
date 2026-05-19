import { describe, it, expect } from 'vitest';
import { inspectBashCommand } from '../../../src/lib/ast/inspect.js';

describe('inspectBashCommand — safe inputs', () => {
  it('allows a plain echo', () => {
    const r = inspectBashCommand('echo hello');
    expect(r.decision).toBe('allow');
    expect(r.hits).toEqual([]);
  });

  it('allows `rm -f single-file` (force without recursive)', () => {
    const r = inspectBashCommand('rm -f /tmp/single.txt');
    expect(r.decision).toBe('allow');
  });

  it('allows `git push origin main` without force', () => {
    const r = inspectBashCommand('git push origin main');
    expect(r.decision).toBe('allow');
  });

  it('allows base64 by itself without piping to a shell', () => {
    const r = inspectBashCommand('base64 < /tmp/file > /tmp/file.b64');
    expect(r.decision).toBe('allow');
  });
});

describe('inspectBashCommand — rm patterns', () => {
  it('denies `rm -rf <path>`', () => {
    const r = inspectBashCommand('rm -rf /tmp/x');
    expect(r.decision).toBe('deny');
    expect(r.hits[0].ruleId).toBe('rm-recursive-force');
  });

  it('denies `rm -fr <path>`', () => {
    const r = inspectBashCommand('rm -fr /tmp/x');
    expect(r.decision).toBe('deny');
  });

  it('denies `rm -r -f <path>`', () => {
    const r = inspectBashCommand('rm -r -f /tmp/x');
    expect(r.decision).toBe('deny');
  });

  it('denies `rm --recursive --force <path>`', () => {
    const r = inspectBashCommand('rm --recursive --force /tmp/x');
    expect(r.decision).toBe('deny');
  });
});

describe('inspectBashCommand — chain bypass detection', () => {
  it('catches the rm in `safe && rm -rf /tmp/x`', () => {
    const r = inspectBashCommand('safe-cmd && rm -rf /tmp/x');
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'rm-recursive-force')).toBe(true);
  });

  it('catches the rm in `cd /; rm -rf *`', () => {
    const r = inspectBashCommand('cd /; rm -rf *');
    expect(r.decision).toBe('deny');
  });

  it('catches the rm inside `$(...)` substitution', () => {
    const r = inspectBashCommand('echo $(rm -rf /tmp/foo)');
    expect(r.decision).toBe('deny');
  });
});

describe('inspectBashCommand — git rules', () => {
  it('denies git push --force', () => {
    expect(inspectBashCommand('git push --force origin main').decision).toBe('deny');
  });

  it('denies git push -f', () => {
    expect(inspectBashCommand('git push -f origin main').decision).toBe('deny');
  });

  it('denies git push --force-with-lease', () => {
    expect(inspectBashCommand('git push --force-with-lease origin main').decision).toBe('deny');
  });

  it('denies git reset --hard', () => {
    expect(inspectBashCommand('git reset --hard HEAD~1').decision).toBe('deny');
  });
});

describe('inspectBashCommand — bypass patterns', () => {
  it('denies --no-verify', () => {
    expect(inspectBashCommand('git commit --no-verify -m "x"').decision).toBe('deny');
  });

  it('denies sudo', () => {
    expect(inspectBashCommand('sudo apt update').decision).toBe('deny');
  });

  it('denies base64-decoded execution', () => {
    const r = inspectBashCommand('echo cm0gLXJmIC8K | base64 -d | bash');
    expect(r.decision).toBe('deny');
    expect(r.hits.some((h) => h.ruleId === 'encoded-execution')).toBe(true);
  });

  it('denies find -delete', () => {
    expect(inspectBashCommand('find /tmp -name "*.log" -delete').decision).toBe('deny');
  });

  it('denies dd of=/dev/sda', () => {
    expect(inspectBashCommand('dd if=/dev/zero of=/dev/sda bs=1M').decision).toBe('deny');
  });

  it('denies mkfs.ext4', () => {
    expect(inspectBashCommand('mkfs.ext4 /dev/sdb1').decision).toBe('deny');
  });
});

describe('inspectBashCommand — reason rendering', () => {
  it('produces a reason that names each rule that hit', () => {
    const r = inspectBashCommand('rm -rf /tmp/x && git push --force origin main');
    expect(r.decision).toBe('deny');
    expect(r.reason).toContain('rm-recursive-force');
    expect(r.reason).toContain('git-force-push');
    expect(r.reason).toContain('data-loss');
    expect(r.reason).toContain('history-rewrite');
  });
});
