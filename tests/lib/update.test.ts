import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolvePaths } from '../../src/lib/paths.js';
import {
  runUpdate,
  liftedFilesFor,
  parseToolVersion,
  PRAXIS_SKILLS_BASE_URL,
  EXPECTED_GENTLE_AI_VERSION,
  EXPECTED_ENGRAM_VERSION,
} from '../../src/lib/update.js';
import type { CommandResult } from '../../src/lib/gentle-ai-bootstrap.js';
import { PRAXIS_NATIVE_SKILL_NAMES } from '../../src/data/praxis-native-skills.js';

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'praxis-update-test-'));
  await mkdir(join(home, '.claude'), { recursive: true });
});

function fakeRun(results: Record<string, CommandResult> = {}) {
  const calls: Array<{ command: string; args: string[] }> = [];
  const run = async (command: string, args: string[]): Promise<CommandResult> => {
    calls.push({ command, args });
    // Most specific key wins: "<command> <subcommand>", then "<subcommand>".
    const specific = results[`${command} ${args[0]}`] ?? results[args[0] ?? command];
    if (specific) return specific;
    // Version probes default to the expected versions (no drift).
    if (args[0] === 'version') {
      const v = command === 'engram' ? EXPECTED_ENGRAM_VERSION : EXPECTED_GENTLE_AI_VERSION;
      return { code: 0, stdout: `${command} ${v}\n`, stderr: '' };
    }
    return { code: 0, stdout: '', stderr: '' };
  };
  return { run, calls };
}

// Fetcher that returns deterministic content per URL, or null for 404.
//
// For a praxis-native skill's SKILL.md (currently just away-mode), the
// fetched content must carry the `name: <skill>` + `praxis-native: true`
// marker itself, since refreshSkillFile validates the fetched content when
// ownership checking is on — not just the pre-existing on-disk file.
function fakeFetch(missing: string[] = []) {
  const fetched: string[] = [];
  const fetchFile = async (url: string): Promise<string | null> => {
    fetched.push(url);
    if (missing.some((m) => url.includes(m))) return null;
    const nativeName = PRAXIS_NATIVE_SKILL_NAMES.find((name) => url.includes(`/${name}/SKILL.md`));
    if (nativeName) {
      return `---\nname: ${nativeName}\npraxis-native: true\n---\ncontent-of:${url}`;
    }
    return `content-of:${url}`;
  };
  return { fetchFile, fetched };
}

// Fetcher that always returns marker-less content, regardless of skill —
// used to exercise the fetched-content validation rejecting a native
// skill's SKILL.md when the fetch itself is not a praxis-native skill.
function fakeFetchMarkerless() {
  const fetched: string[] = [];
  const fetchFile = async (url: string): Promise<string | null> => {
    fetched.push(url);
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

    // gentle-ai: upgrade (scoped to gentle-ai only) then sync --strict-tdd.
    expect(calls[0]).toEqual({ command: 'gentle-ai', args: ['upgrade', 'gentle-ai'] });
    expect(calls[1]).toEqual({ command: 'gentle-ai', args: ['sync', '--strict-tdd'] });
    expect(result.gentleAi?.strictTddPreserved).toBe(true);

    // skills: every lifted file fetched from the praxis-ai repo + written.
    expect(fetched.every((u) => u.startsWith(PRAXIS_SKILLS_BASE_URL))).toBe(true);
    expect(result.skills?.failedFiles).toEqual([]);
    expect(result.skills!.updatedFiles).toContain('handoff/SKILL.md');
    expect(result.skills!.updatedFiles).toContain('prototype/UI.md');
    // The praxis-native away-mode skill refreshes alongside the lifted ones,
    // without a NOTICE.md fetch (native skills have no upstream to attribute).
    expect(result.skills!.updatedFiles).toContain('away-mode/SKILL.md');
    expect(result.skills!.updatedFiles).not.toContain('away-mode/NOTICE.md');

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

describe('expected versions', () => {
  it('pins gentle-ai 3.7.0 and engram 2.1.0', () => {
    expect(EXPECTED_GENTLE_AI_VERSION).toBe('3.7.0');
    expect(EXPECTED_ENGRAM_VERSION).toBe('2.1.0');
  });
});

describe('parseToolVersion', () => {
  it('extracts the version from `<tool> <version>` output', () => {
    expect(parseToolVersion('gentle-ai 3.7.0\n')).toBe('3.7.0');
    expect(parseToolVersion('engram 2.0.0-rc.4')).toBe('2.0.0-rc.4');
    expect(parseToolVersion('engram v2.1.0')).toBe('2.1.0');
  });

  it('returns null when no version is present', () => {
    expect(parseToolVersion('')).toBeNull();
    expect(parseToolVersion('command not found')).toBeNull();
  });
});

describe('runUpdate — skills ownership (native skills only)', () => {
  it('leaves a user-authored away-mode/SKILL.md in place and reports it skipped', async () => {
    const paths = resolvePaths(home);
    await writeFile(paths.claudeMd, '', 'utf8');
    await mkdir(join(paths.claudeSkillsDir, 'away-mode'), { recursive: true });
    await writeFile(
      join(paths.claudeSkillsDir, 'away-mode', 'SKILL.md'),
      '---\nname: away-mode\ndescription: my own thing\n---\nmy own body\n',
      'utf8',
    );
    const { run } = fakeRun();
    const { fetchFile, fetched } = fakeFetch();

    const result = await runUpdate({
      paths,
      gentleAi: false,
      run,
      fetchFile,
      hasGentleAi: () => true,
    });

    expect(result.skills!.skippedNotOwned.some((f) => f.includes('away-mode/SKILL.md'))).toBe(true);
    expect(result.skills!.updatedFiles).not.toContain('away-mode/SKILL.md');
    // Never fetched at all: the ownership check short-circuits before the request.
    expect(fetched.some((u) => u.includes('away-mode/SKILL.md'))).toBe(false);
    const preserved = await readFile(join(paths.claudeSkillsDir, 'away-mode', 'SKILL.md'), 'utf8');
    expect(preserved).toContain('my own body');
    // Lifted skills are unaffected.
    expect(result.skills!.updatedFiles).toContain('handoff/SKILL.md');
  });

  it('overwrites a praxis-owned away-mode/SKILL.md (marker + matching name present)', async () => {
    const paths = resolvePaths(home);
    await writeFile(paths.claudeMd, '', 'utf8');
    await mkdir(join(paths.claudeSkillsDir, 'away-mode'), { recursive: true });
    await writeFile(
      join(paths.claudeSkillsDir, 'away-mode', 'SKILL.md'),
      '---\nname: away-mode\npraxis-native: true\n---\nold body\n',
      'utf8',
    );
    const { run } = fakeRun();
    const { fetchFile } = fakeFetch();

    const result = await runUpdate({
      paths,
      gentleAi: false,
      run,
      fetchFile,
      hasGentleAi: () => true,
    });

    expect(result.skills!.updatedFiles).toContain('away-mode/SKILL.md');
    expect(result.skills!.skippedNotOwned).toEqual([]);
    const written = await readFile(join(paths.claudeSkillsDir, 'away-mode', 'SKILL.md'), 'utf8');
    expect(written).toContain('content-of:');
  });

  it('writes away-mode/SKILL.md normally when nothing exists at the destination yet', async () => {
    const paths = resolvePaths(home);
    await writeFile(paths.claudeMd, '', 'utf8');
    const { run } = fakeRun();
    const { fetchFile } = fakeFetch();
    const result = await runUpdate({
      paths,
      gentleAi: false,
      run,
      fetchFile,
      hasGentleAi: () => true,
    });
    expect(result.skills!.updatedFiles).toContain('away-mode/SKILL.md');
    expect(result.skills!.skippedNotOwned).toEqual([]);
  });

  it('rejects a marker-less fetched away-mode/SKILL.md instead of writing it', async () => {
    const paths = resolvePaths(home);
    await writeFile(paths.claudeMd, '', 'utf8');
    const { run } = fakeRun();
    const { fetchFile } = fakeFetchMarkerless();

    const result = await runUpdate({
      paths,
      gentleAi: false,
      run,
      fetchFile,
      hasGentleAi: () => true,
    });

    expect(result.skills!.updatedFiles).not.toContain('away-mode/SKILL.md');
    expect(
      result.skills!.failedFiles.some(
        (f) => f.includes('away-mode/SKILL.md') && f.includes('not a praxis-native skill'),
      ),
    ).toBe(true);
    await expect(stat(join(paths.claudeSkillsDir, 'away-mode', 'SKILL.md'))).rejects.toThrow();
    // Lifted skills are unaffected: they have no marker requirement.
    expect(result.skills!.updatedFiles).toContain('handoff/SKILL.md');
  });

  it('rejects a marker-less fetch even when overwriting an existing praxis-owned file', async () => {
    const paths = resolvePaths(home);
    await writeFile(paths.claudeMd, '', 'utf8');
    await mkdir(join(paths.claudeSkillsDir, 'away-mode'), { recursive: true });
    await writeFile(
      join(paths.claudeSkillsDir, 'away-mode', 'SKILL.md'),
      '---\nname: away-mode\npraxis-native: true\n---\nold body\n',
      'utf8',
    );
    const { run } = fakeRun();
    const { fetchFile } = fakeFetchMarkerless();

    const result = await runUpdate({
      paths,
      gentleAi: false,
      run,
      fetchFile,
      hasGentleAi: () => true,
    });

    expect(result.skills!.updatedFiles).not.toContain('away-mode/SKILL.md');
    expect(result.skills!.failedFiles.some((f) => f.includes('away-mode/SKILL.md'))).toBe(true);
    const preserved = await readFile(join(paths.claudeSkillsDir, 'away-mode', 'SKILL.md'), 'utf8');
    expect(preserved).toContain('old body');
  });
});

describe('runUpdate — scoped upgrade + version drift', () => {
  it('never upgrades engram: the upgrade is filtered to gentle-ai', async () => {
    const paths = resolvePaths(home);
    await writeFile(paths.claudeMd, '', 'utf8');
    const { run, calls } = fakeRun();
    const { fetchFile } = fakeFetch();
    await runUpdate({ paths, skills: false, run, fetchFile, hasGentleAi: () => true });
    const upgrades = calls.filter((c) => c.args[0] === 'upgrade');
    expect(upgrades).toEqual([{ command: 'gentle-ai', args: ['upgrade', 'gentle-ai'] }]);
  });

  it('reports installed versions and no warning when they match', async () => {
    const paths = resolvePaths(home);
    await writeFile(paths.claudeMd, '', 'utf8');
    const { run, calls } = fakeRun();
    const { fetchFile } = fakeFetch();
    const result = await runUpdate({
      paths,
      skills: false,
      run,
      fetchFile,
      hasGentleAi: () => true,
    });
    expect(calls).toContainEqual({ command: 'gentle-ai', args: ['version'] });
    expect(calls).toContainEqual({ command: 'engram', args: ['version'] });
    expect(result.gentleAi?.versions).toEqual([
      { tool: 'gentle-ai', expected: '3.7.0', installed: '3.7.0' },
      { tool: 'engram', expected: '2.1.0', installed: '2.1.0' },
    ]);
    expect(result.warnings.filter((w) => /expects/.test(w))).toEqual([]);
  });

  it('warns when installed versions differ from the expected ones', async () => {
    const paths = resolvePaths(home);
    await writeFile(paths.claudeMd, '', 'utf8');
    const { run } = fakeRun({
      'gentle-ai version': { code: 0, stdout: 'gentle-ai 3.8.0\n', stderr: '' },
      'engram version': { code: 0, stdout: 'engram 2.0.0-rc.4\n', stderr: '' },
    });
    const { fetchFile } = fakeFetch();
    const result = await runUpdate({
      paths,
      skills: false,
      run,
      fetchFile,
      hasGentleAi: () => true,
    });
    expect(result.warnings).toContainEqual(
      expect.stringMatching(/gentle-ai 3\.8\.0 is installed; praxis expects 3\.7\.0/),
    );
    expect(result.warnings).toContainEqual(
      expect.stringMatching(/engram 2\.0\.0-rc\.4 is installed; praxis expects 2\.1\.0/),
    );
  });

  it('warns when a version cannot be determined (e.g. engram missing)', async () => {
    const paths = resolvePaths(home);
    await writeFile(paths.claudeMd, '', 'utf8');
    const { run } = fakeRun({
      'engram version': { code: 127, stdout: '', stderr: 'spawn engram ENOENT' },
    });
    const { fetchFile } = fakeFetch();
    const result = await runUpdate({
      paths,
      skills: false,
      run,
      fetchFile,
      hasGentleAi: () => true,
    });
    expect(result.gentleAi?.versions?.[1]).toEqual({
      tool: 'engram',
      expected: '2.1.0',
      installed: null,
    });
    expect(result.warnings).toContainEqual(
      expect.stringMatching(/could not determine the installed engram version/),
    );
  });
});

describe('runUpdate — keeps the praxis block last after gentle-ai sync', () => {
  const praxisBlock = '<!-- praxis:start -->\n@~/custom/praxis/main.md\n<!-- praxis:end -->';

  // A run that mimics gentle-ai sync appending a new managed section at the
  // end of CLAUDE.md, below the praxis block.
  function syncAppends(claudeMdPath: string) {
    const { run: base, calls } = fakeRun();
    const run = async (command: string, args: string[]): Promise<CommandResult> => {
      if (command === 'gentle-ai' && args[0] === 'sync') {
        const current = await readFile(claudeMdPath, 'utf8');
        await writeFile(
          claudeMdPath,
          current + '\n<!-- gentle-ai:new-section -->\nNEW\n<!-- /gentle-ai:new-section -->\n',
          'utf8',
        );
      }
      return base(command, args);
    };
    return { run, calls };
  }

  it('moves the praxis block back below a section sync appended, keeping its import path', async () => {
    const paths = resolvePaths(home);
    await writeFile(
      paths.claudeMd,
      `<!-- gentle-ai:persona -->\nP\n<!-- /gentle-ai:persona -->\n\n${praxisBlock}\n`,
      'utf8',
    );
    const { run } = syncAppends(paths.claudeMd);
    const { fetchFile } = fakeFetch();
    const result = await runUpdate({
      paths,
      skills: false,
      run,
      fetchFile,
      hasGentleAi: () => true,
    });

    const after = await readFile(paths.claudeMd, 'utf8');
    expect(after).toContain('<!-- /gentle-ai:new-section -->');
    expect(after.trimEnd().endsWith(praxisBlock)).toBe(true);
    expect(after.match(/<!-- praxis:start -->/g)).toHaveLength(1);
    expect(result.gentleAi?.claudeMdRepatched).toBe(true);
  });

  it('does not add a praxis block when CLAUDE.md has none', async () => {
    const paths = resolvePaths(home);
    await writeFile(
      paths.claudeMd,
      '<!-- gentle-ai:persona -->\nP\n<!-- /gentle-ai:persona -->\n',
      'utf8',
    );
    const { run } = syncAppends(paths.claudeMd);
    const { fetchFile } = fakeFetch();
    const result = await runUpdate({
      paths,
      skills: false,
      run,
      fetchFile,
      hasGentleAi: () => true,
    });

    expect(await readFile(paths.claudeMd, 'utf8')).not.toContain('praxis:start');
    expect(result.gentleAi?.claudeMdRepatched).toBe(false);
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

  it('records a missing upstream away-mode file as a per-file failure while lifted skills still update', async () => {
    const paths = resolvePaths(home);
    await writeFile(paths.claudeMd, '', 'utf8');
    const { run } = fakeRun();
    const { fetchFile } = fakeFetch(['away-mode/SKILL.md']);
    const result = await runUpdate({
      paths,
      gentleAi: false,
      run,
      fetchFile,
      hasGentleAi: () => true,
    });
    expect(
      result.skills!.failedFiles.some(
        (f) => f.includes('away-mode/SKILL.md') && f.includes('not found upstream'),
      ),
    ).toBe(true);
    // Lifted skills are a separate loop and are unaffected by away-mode's failure.
    expect(result.skills!.updatedFiles).toContain('handoff/SKILL.md');
    expect(result.skills!.updatedFiles).toContain('caveman/SKILL.md');
    expect(result.skills!.updatedFiles).toContain('prototype/UI.md');
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
