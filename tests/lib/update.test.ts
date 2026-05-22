import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolvePaths } from '../../src/lib/paths.js';
import { runUpdate, liftedFilesFor, PRAXIS_SKILLS_BASE_URL } from '../../src/lib/update.js';
import type { CommandResult } from '../../src/lib/gentle-ai-bootstrap.js';

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'praxis-update-test-'));
  await mkdir(join(home, '.claude'), { recursive: true });
});

function fakeRun(results: Record<string, CommandResult> = {}) {
  const calls: Array<{ command: string; args: string[] }> = [];
  const run = async (command: string, args: string[]): Promise<CommandResult> => {
    calls.push({ command, args });
    const key = args[0] ?? command;
    return results[key] ?? { code: 0, stdout: '', stderr: '' };
  };
  return { run, calls };
}

// Fetcher that returns deterministic content per URL, or null for 404.
function fakeFetch(missing: string[] = []) {
  const fetched: string[] = [];
  const fetchFile = async (url: string): Promise<string | null> => {
    fetched.push(url);
    if (missing.some((m) => url.includes(m))) return null;
    return `content-of:${url}`;
  };
  return { fetchFile, fetched };
}

describe('liftedFilesFor', () => {
  it('returns SKILL.md + NOTICE.md for a simple skill', () => {
    expect(liftedFilesFor('caveman').sort()).toEqual(['NOTICE.md', 'SKILL.md']);
  });

  it('returns SKILL.md + LOGIC.md + UI.md + NOTICE.md for prototype', () => {
    expect(liftedFilesFor('prototype').sort()).toEqual([
      'LOGIC.md',
      'NOTICE.md',
      'SKILL.md',
      'UI.md',
    ]);
  });

  it('returns empty for an unknown skill', () => {
    expect(liftedFilesFor('nope')).toEqual([]);
  });
});

describe('runUpdate — both targets', () => {
  it('updates gentle-ai (upgrade + sync) and writes all skill files', async () => {
    const paths = resolvePaths(home);
    // strict TDD enabled marker present.
    await writeFile(
      paths.claudeMd,
      '<!-- gentle-ai:strict-tdd-mode -->\nStrict TDD Mode: enabled\n<!-- /gentle-ai:strict-tdd-mode -->\n',
      'utf8',
    );
    const { run, calls } = fakeRun();
    const { fetchFile, fetched } = fakeFetch();

    const result = await runUpdate({
      paths,
      run,
      fetchFile,
      hasGentleAi: () => true,
    });

    // gentle-ai: upgrade then sync --strict-tdd (TDD preserved).
    expect(calls[0]).toEqual({ command: 'gentle-ai', args: ['upgrade'] });
    expect(calls[1]).toEqual({ command: 'gentle-ai', args: ['sync', '--strict-tdd'] });
    expect(result.gentleAi?.strictTddPreserved).toBe(true);

    // skills: every lifted file fetched from the praxis-ai repo + written.
    expect(fetched.every((u) => u.startsWith(PRAXIS_SKILLS_BASE_URL))).toBe(true);
    expect(result.skills?.failedFiles).toEqual([]);
    expect(result.skills!.updatedFiles).toContain('handoff/SKILL.md');
    expect(result.skills!.updatedFiles).toContain('prototype/UI.md');

    const written = await readFile(join(paths.claudeSkillsDir, 'caveman', 'SKILL.md'), 'utf8');
    expect(written).toContain('content-of:');
  });

  it('does NOT pass --strict-tdd when TDD is disabled (preserves config)', async () => {
    const paths = resolvePaths(home);
    await writeFile(
      paths.claudeMd,
      '<!-- gentle-ai:strict-tdd-mode -->\nStrict TDD Mode: disabled\n<!-- /gentle-ai:strict-tdd-mode -->\n',
      'utf8',
    );
    const { run, calls } = fakeRun();
    const { fetchFile } = fakeFetch();
    const result = await runUpdate({ paths, run, fetchFile, hasGentleAi: () => true });
    expect(result.gentleAi?.strictTddPreserved).toBe(false);
    expect(calls.find((c) => c.args[0] === 'sync')!.args).toEqual(['sync']);
  });
});

describe('runUpdate — gentle-ai not installed', () => {
  it('skips gentle-ai with a guidance message, still updates skills', async () => {
    const paths = resolvePaths(home);
    await writeFile(paths.claudeMd, '', 'utf8');
    const { run, calls } = fakeRun();
    const { fetchFile } = fakeFetch();
    const result = await runUpdate({ paths, run, fetchFile, hasGentleAi: () => false });
    expect(result.gentleAi?.attempted).toBe(false);
    expect(result.gentleAi?.skippedReason).toMatch(/not installed/i);
    expect(calls).toEqual([]); // no gentle-ai commands run
    expect(result.skills!.updatedFiles.length).toBeGreaterThan(0);
  });
});

describe('runUpdate — modular', () => {
  it('skills only: no gentle-ai commands', async () => {
    const paths = resolvePaths(home);
    await writeFile(paths.claudeMd, '', 'utf8');
    const { run, calls } = fakeRun();
    const { fetchFile } = fakeFetch();
    const result = await runUpdate({
      paths,
      gentleAi: false,
      skills: true,
      run,
      fetchFile,
      hasGentleAi: () => true,
    });
    expect(result.gentleAi).toBeNull();
    expect(calls).toEqual([]);
    expect(result.skills!.updatedFiles.length).toBeGreaterThan(0);
  });

  it('gentle-ai only: no skill files fetched', async () => {
    const paths = resolvePaths(home);
    await writeFile(paths.claudeMd, '', 'utf8');
    const { run } = fakeRun();
    const { fetchFile, fetched } = fakeFetch();
    const result = await runUpdate({
      paths,
      gentleAi: true,
      skills: false,
      run,
      fetchFile,
      hasGentleAi: () => true,
    });
    expect(result.skills).toBeNull();
    expect(fetched).toEqual([]);
    expect(result.gentleAi?.attempted).toBe(true);
  });
});

describe('runUpdate — guards + failures', () => {
  it('throws when ~/.claude does not exist', async () => {
    const missingHome = await mkdtemp(join(tmpdir(), 'praxis-update-nohome-'));
    const paths = resolvePaths(missingHome);
    await expect(runUpdate({ paths, hasGentleAi: () => false })).rejects.toThrow(
      /Claude Code config dir not found/,
    );
  });

  it('records a failed skill file when the fetch 404s', async () => {
    const paths = resolvePaths(home);
    await writeFile(paths.claudeMd, '', 'utf8');
    const { run } = fakeRun();
    const { fetchFile } = fakeFetch(['handoff/NOTICE.md']);
    const result = await runUpdate({
      paths,
      gentleAi: false,
      run,
      fetchFile,
      hasGentleAi: () => true,
    });
    expect(result.skills!.failedFiles.some((f) => f.includes('handoff/NOTICE.md'))).toBe(true);
  });

  it('does not touch the praxis overlay (only skill dirs are written)', async () => {
    const paths = resolvePaths(home);
    await writeFile(paths.claudeMd, 'PRAXIS BLOCK UNTOUCHED', 'utf8');
    await writeFile(paths.settingsJson, '{"sentinel":true}', 'utf8');
    const { run } = fakeRun();
    const { fetchFile } = fakeFetch();
    await runUpdate({ paths, gentleAi: false, run, fetchFile, hasGentleAi: () => true });
    expect(await readFile(paths.claudeMd, 'utf8')).toBe('PRAXIS BLOCK UNTOUCHED');
    expect(await readFile(paths.settingsJson, 'utf8')).toBe('{"sentinel":true}');
    // skills dir was created/written
    const s = await stat(join(paths.claudeSkillsDir, 'caveman'));
    expect(s.isDirectory()).toBe(true);
  });
});
