import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installSkeleton, uninstallSkeleton } from '../../src/lib/skeleton-installer.js';

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
