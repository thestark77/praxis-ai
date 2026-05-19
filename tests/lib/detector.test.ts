import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detect, installModeFor } from '../../src/lib/detector.js';
import { resolvePaths } from '../../src/lib/paths.js';

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'praxis-detect-test-'));
});

describe('detect', () => {
  it('reports fully missing state when ~/.claude does not exist', async () => {
    const paths = resolvePaths(workDir);
    const report = await detect(paths);
    expect(report.claude.configDirExists).toBe(false);
    expect(report.claude.claudeMdExists).toBe(false);
    expect(report.claude.settingsJsonExists).toBe(false);
    expect(report.gentleAi.markersFound).toEqual([]);
    expect(report.praxis.overlayInstalled).toBe(false);
  });

  it('finds gentle-ai markers in CLAUDE.md', async () => {
    const paths = resolvePaths(workDir);
    await mkdir(paths.claudeDir, { recursive: true });
    const claudeMd = `<!-- gentle-ai:persona -->\npersona\n<!-- /gentle-ai:persona -->\n\n<!-- gentle-ai:engram-protocol -->\nengram\n<!-- /gentle-ai:engram-protocol -->\n`;
    await writeFile(paths.claudeMd, claudeMd, 'utf8');
    const report = await detect(paths);
    expect(report.claude.claudeMdExists).toBe(true);
    expect(report.gentleAi.markersFound.sort()).toEqual(['engram-protocol', 'persona']);
  });

  it('detects an existing praxis overlay', async () => {
    const paths = resolvePaths(workDir);
    await mkdir(paths.claudeDir, { recursive: true });
    const claudeMd = `something\n\n<!-- praxis:start -->\n@~/.praxis/main.md\n<!-- praxis:end -->\n`;
    await writeFile(paths.claudeMd, claudeMd, 'utf8');
    const report = await detect(paths);
    expect(report.praxis.overlayInstalled).toBe(true);
  });

  it('detects engram MCP via enabledPlugins in settings.json', async () => {
    const paths = resolvePaths(workDir);
    await mkdir(paths.claudeDir, { recursive: true });
    await writeFile(
      paths.settingsJson,
      JSON.stringify({ enabledPlugins: { 'engram@engram': true } }),
      'utf8',
    );
    const report = await detect(paths);
    expect(report.engram.mcpEnabled).toBe(true);
  });

  it('reports engram disabled when plugins map is absent', async () => {
    const paths = resolvePaths(workDir);
    await mkdir(paths.claudeDir, { recursive: true });
    await writeFile(paths.settingsJson, JSON.stringify({ model: 'opus' }), 'utf8');
    const report = await detect(paths);
    expect(report.engram.mcpEnabled).toBe(false);
  });

  it('survives malformed settings.json without throwing', async () => {
    const paths = resolvePaths(workDir);
    await mkdir(paths.claudeDir, { recursive: true });
    await writeFile(paths.settingsJson, '{ not valid json', 'utf8');
    const report = await detect(paths);
    expect(report.engram.mcpEnabled).toBe(false);
  });
});

describe('installModeFor', () => {
  it('returns no-claude-code when ~/.claude is absent', () => {
    const mode = installModeFor({
      claude: { configDirExists: false, claudeMdExists: false, settingsJsonExists: false },
      gentleAi: { binaryPresent: false, markersFound: [] },
      engram: { mcpEnabled: false },
      praxis: { overlayInstalled: false, homeDirExists: false },
    });
    expect(mode).toBe('no-claude-code');
  });

  it('returns standalone when claude present but no gentle-ai', () => {
    const mode = installModeFor({
      claude: { configDirExists: true, claudeMdExists: true, settingsJsonExists: true },
      gentleAi: { binaryPresent: false, markersFound: [] },
      engram: { mcpEnabled: false },
      praxis: { overlayInstalled: false, homeDirExists: false },
    });
    expect(mode).toBe('standalone');
  });

  it('returns partial-overlay when gentle-ai binary is present but no markers', () => {
    const mode = installModeFor({
      claude: { configDirExists: true, claudeMdExists: true, settingsJsonExists: true },
      gentleAi: { binaryPresent: true, markersFound: [] },
      engram: { mcpEnabled: false },
      praxis: { overlayInstalled: false, homeDirExists: false },
    });
    expect(mode).toBe('partial-overlay');
  });

  it('returns overlay when gentle-ai binary + markers are both present', () => {
    const mode = installModeFor({
      claude: { configDirExists: true, claudeMdExists: true, settingsJsonExists: true },
      gentleAi: { binaryPresent: true, markersFound: ['persona', 'sdd-orchestrator'] },
      engram: { mcpEnabled: true },
      praxis: { overlayInstalled: false, homeDirExists: false },
    });
    expect(mode).toBe('overlay');
  });
});
