import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  installSkeleton,
  uninstallSkeleton,
  installClaudeSkills,
  uninstallClaudeSkills,
} from '../../src/lib/skeleton-installer.js';

let workDir: string;
let templatesRoot: string;
let praxisDir: string;

async function makeTemplate(rel: string, content: string): Promise<void> {
  const full = join(templatesRoot, rel);
  await mkdir(join(full, '..'), { recursive: true });
  await writeFile(full, content, 'utf8');
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'praxis-skeleton-test-'));
  templatesRoot = join(workDir, 'templates', 'praxis-home');
  praxisDir = join(workDir, 'home', '.praxis');
  await mkdir(templatesRoot, { recursive: true });
});

describe('installSkeleton', () => {
  it('throws when templates directory does not exist', async () => {
    await expect(
      installSkeleton({
        templatesRoot: join(workDir, 'missing'),
        praxisDir,
      }),
    ).rejects.toThrow(/Templates directory not found/);
  });

  it('copies a flat set of templates into the praxis dir', async () => {
    await makeTemplate('main.md', 'main content');
    await makeTemplate('philosophy.md', 'philosophy content');
    const result = await installSkeleton({ templatesRoot, praxisDir });
    expect(result.installed.sort()).toEqual(['main.md', 'philosophy.md']);
    expect(result.skipped).toEqual([]);
    const main = await readFile(join(praxisDir, 'main.md'), 'utf8');
    expect(main).toBe('main content');
  });

  it('recreates nested directory structure (presets subfolder)', async () => {
    await makeTemplate('main.md', 'main');
    await makeTemplate('presets/balanced.md', 'preset content');
    await installSkeleton({ templatesRoot, praxisDir });
    const presetsExists = await stat(join(praxisDir, 'presets'));
    expect(presetsExists.isDirectory()).toBe(true);
    const preset = await readFile(join(praxisDir, 'presets', 'balanced.md'), 'utf8');
    expect(preset).toBe('preset content');
  });

  it('skips existing destination files when overwrite is false (idempotent)', async () => {
    await makeTemplate('main.md', 'fresh content');
    await mkdir(praxisDir, { recursive: true });
    await writeFile(join(praxisDir, 'main.md'), 'user-customised', 'utf8');
    const result = await installSkeleton({ templatesRoot, praxisDir });
    expect(result.installed).toEqual([]);
    expect(result.skipped).toEqual(['main.md']);
    const content = await readFile(join(praxisDir, 'main.md'), 'utf8');
    expect(content).toBe('user-customised');
  });

  it('overwrites existing destinations when overwrite is true', async () => {
    await makeTemplate('main.md', 'fresh content');
    await mkdir(praxisDir, { recursive: true });
    await writeFile(join(praxisDir, 'main.md'), 'user-customised', 'utf8');
    const result = await installSkeleton({ templatesRoot, praxisDir, overwrite: true });
    expect(result.installed).toEqual(['main.md']);
    expect(result.skipped).toEqual([]);
    const content = await readFile(join(praxisDir, 'main.md'), 'utf8');
    expect(content).toBe('fresh content');
  });

  it('creates the praxis dir if missing', async () => {
    await makeTemplate('main.md', 'main');
    await installSkeleton({ templatesRoot, praxisDir });
    const exists = await stat(praxisDir);
    expect(exists.isDirectory()).toBe(true);
  });
});

describe('uninstallSkeleton', () => {
  it('removes the praxis dir recursively', async () => {
    await makeTemplate('main.md', 'main');
    await makeTemplate('presets/balanced.md', 'preset');
    await installSkeleton({ templatesRoot, praxisDir });
    await uninstallSkeleton(praxisDir);
    await expect(stat(praxisDir)).rejects.toThrow();
  });

  it('is safe to call when praxis dir does not exist', async () => {
    await expect(uninstallSkeleton(join(workDir, 'missing'))).resolves.not.toThrow();
  });

  it('preserves backups/ so `praxis rollback` survives uninstall (T14 fix)', async () => {
    await makeTemplate('main.md', 'main');
    await installSkeleton({ templatesRoot, praxisDir });
    // Simulate a backup directory that praxis install would have made
    // alongside the skeleton.
    await mkdir(join(praxisDir, 'backups', '20260519T000000Z'), { recursive: true });
    await writeFile(
      join(praxisDir, 'backups', '20260519T000000Z', 'CLAUDE.md'),
      'backup body',
      'utf8',
    );

    await uninstallSkeleton(praxisDir);

    // Install artefacts gone; backups/ alive.
    await expect(stat(join(praxisDir, 'main.md'))).rejects.toThrow();
    const backupStat = await stat(join(praxisDir, 'backups', '20260519T000000Z', 'CLAUDE.md'));
    expect(backupStat.isFile()).toBe(true);
  });
});

describe('integration: bundled templates resolve at runtime', () => {
  it('the package ships the expected praxis-home templates', async () => {
    // This walks the actual templates directory shipped with the package
    // to ensure the build pipeline preserves them.
    const pkgRoot = join(import.meta.dirname, '..', '..');
    const repoTemplatesRoot = join(pkgRoot, 'templates', 'praxis-home');
    const exists = await stat(repoTemplatesRoot);
    expect(exists.isDirectory()).toBe(true);
    const entries = await readdir(repoTemplatesRoot);
    expect(entries).toContain('main.md');
    expect(entries).toContain('philosophy.md');
    expect(entries).toContain('phase-flow.md');
    expect(entries).toContain('irreversibility-firewall.md');
    expect(entries).toContain('skill-invocation-policy.md');
    expect(entries).toContain('precedence-rules.md');
    expect(entries).toContain('grilling.md');
    expect(entries).toContain('context-conventions.md');
    expect(entries).toContain('presets');
  });
});

describe('installClaudeSkills (HOME sandbox)', () => {
  let workDir: string;
  let templatesRoot: string;
  let claudeSkillsDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'praxis-claude-skills-test-'));
    templatesRoot = join(workDir, 'templates', 'claude-skills');
    claudeSkillsDir = join(workDir, 'home', '.claude', 'skills');
    await mkdir(templatesRoot, { recursive: true });

    // Build a fake two-skill template tree
    await mkdir(join(templatesRoot, 'alpha'), { recursive: true });
    await writeFile(join(templatesRoot, 'alpha', 'SKILL.md'), 'alpha skill', 'utf8');
    await writeFile(join(templatesRoot, 'alpha', 'NOTICE.md'), 'alpha notice', 'utf8');
    await mkdir(join(templatesRoot, 'beta'), { recursive: true });
    await writeFile(join(templatesRoot, 'beta', 'SKILL.md'), 'beta skill', 'utf8');
    await writeFile(join(templatesRoot, 'beta', 'NOTICE.md'), 'beta notice', 'utf8');
  });

  it('throws when templates directory does not exist', async () => {
    await expect(
      installClaudeSkills({
        templatesRoot: join(workDir, 'missing'),
        claudeSkillsDir,
      }),
    ).rejects.toThrow(/Claude skills templates directory not found/);
  });

  it('copies all skill dirs and preserves the per-skill directory structure', async () => {
    const result = await installClaudeSkills({ templatesRoot, claudeSkillsDir });
    expect(result.installed.sort()).toEqual(
      ['alpha/SKILL.md', 'alpha/NOTICE.md', 'beta/SKILL.md', 'beta/NOTICE.md'].sort(),
    );
    expect(result.skipped).toEqual([]);
    const alphaSkill = await readFile(join(claudeSkillsDir, 'alpha', 'SKILL.md'), 'utf8');
    expect(alphaSkill).toBe('alpha skill');
  });

  it('restricts installation to the configured skills subset', async () => {
    const result = await installClaudeSkills({
      templatesRoot,
      claudeSkillsDir,
      skills: ['alpha'],
    });
    expect(result.installed.sort()).toEqual(['alpha/NOTICE.md', 'alpha/SKILL.md'].sort());
    await expect(stat(join(claudeSkillsDir, 'beta'))).rejects.toThrow();
  });

  it('skips existing destination files when overwrite is false (idempotent)', async () => {
    await mkdir(join(claudeSkillsDir, 'alpha'), { recursive: true });
    await writeFile(join(claudeSkillsDir, 'alpha', 'SKILL.md'), 'user-customised', 'utf8');
    const result = await installClaudeSkills({ templatesRoot, claudeSkillsDir });
    expect(result.skipped).toContain('alpha/SKILL.md');
    const preserved = await readFile(join(claudeSkillsDir, 'alpha', 'SKILL.md'), 'utf8');
    expect(preserved).toBe('user-customised');
  });

  it('overwrites existing destinations when overwrite is true', async () => {
    await mkdir(join(claudeSkillsDir, 'alpha'), { recursive: true });
    await writeFile(join(claudeSkillsDir, 'alpha', 'SKILL.md'), 'user-customised', 'utf8');
    await installClaudeSkills({ templatesRoot, claudeSkillsDir, overwrite: true });
    const overwritten = await readFile(join(claudeSkillsDir, 'alpha', 'SKILL.md'), 'utf8');
    expect(overwritten).toBe('alpha skill');
  });

  it('uninstallClaudeSkills removes only the named skill dirs', async () => {
    await installClaudeSkills({ templatesRoot, claudeSkillsDir });
    const removed = await uninstallClaudeSkills(claudeSkillsDir, ['alpha']);
    expect(removed).toEqual(['alpha']);
    await expect(stat(join(claudeSkillsDir, 'alpha'))).rejects.toThrow();
    const betaSkill = await stat(join(claudeSkillsDir, 'beta'));
    expect(betaSkill.isDirectory()).toBe(true);
  });

  it('uninstallClaudeSkills is safe when target dirs do not exist', async () => {
    const removed = await uninstallClaudeSkills(claudeSkillsDir, ['ghost']);
    expect(removed).toEqual([]);
  });
});

describe('integration: bundled claude-skills resolve at runtime', () => {
  it('the package ships the six lifted skills with SKILL.md and NOTICE.md', async () => {
    const pkgRoot = join(import.meta.dirname, '..', '..');
    const repoSkillsRoot = join(pkgRoot, 'templates', 'claude-skills');
    const exists = await stat(repoSkillsRoot);
    expect(exists.isDirectory()).toBe(true);
    const entries = await readdir(repoSkillsRoot);
    for (const name of [
      'grill-with-docs',
      'caveman',
      'diagnose',
      'zoom-out',
      'prototype',
      'handoff',
    ]) {
      expect(entries).toContain(name);
      const files = await readdir(join(repoSkillsRoot, name));
      expect(files, `${name} missing SKILL.md`).toContain('SKILL.md');
      expect(files, `${name} missing NOTICE.md`).toContain('NOTICE.md');
    }
  });
});
