import { readFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolvePaths, type PraxisPaths } from './paths.js';

export interface DetectionReport {
  claude: {
    configDirExists: boolean;
    claudeMdExists: boolean;
    settingsJsonExists: boolean;
  };
  gentleAi: {
    binaryPresent: boolean;
    markersFound: string[];
  };
  engram: {
    mcpEnabled: boolean;
  };
  praxis: {
    overlayInstalled: boolean;
    homeDirExists: boolean;
  };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function commandExists(cmd: string): boolean {
  try {
    const result = spawnSync('which', [cmd], { stdio: 'pipe' });
    return result.status === 0;
  } catch {
    return false;
  }
}

function findGentleAiMarkers(content: string): string[] {
  const regex = /<!-- gentle-ai:([\w-]+) -->/g;
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    found.add(match[1]!);
  }
  return [...found];
}

function hasPraxisOverlay(content: string): boolean {
  return content.includes('<!-- praxis:start -->') && content.includes('<!-- praxis:end -->');
}

function isEngramMcpEnabled(settingsJson: string): boolean {
  try {
    const parsed = JSON.parse(settingsJson) as Record<string, unknown>;
    const plugins = parsed.enabledPlugins as Record<string, boolean> | undefined;
    if (plugins && typeof plugins === 'object') {
      for (const key of Object.keys(plugins)) {
        if (key.includes('engram') && plugins[key]) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

export async function detect(paths: PraxisPaths = resolvePaths()): Promise<DetectionReport> {
  const claudeMdExists = await pathExists(paths.claudeMd);
  const settingsJsonExists = await pathExists(paths.settingsJson);

  let markersFound: string[] = [];
  let overlayInstalled = false;
  if (claudeMdExists) {
    const claudeMd = await readFile(paths.claudeMd, 'utf8');
    markersFound = findGentleAiMarkers(claudeMd);
    overlayInstalled = hasPraxisOverlay(claudeMd);
  }

  let engramEnabled = false;
  if (settingsJsonExists) {
    const settings = await readFile(paths.settingsJson, 'utf8');
    engramEnabled = isEngramMcpEnabled(settings);
  }

  return {
    claude: {
      configDirExists: await pathExists(paths.claudeDir),
      claudeMdExists,
      settingsJsonExists,
    },
    gentleAi: {
      binaryPresent: commandExists('gentle-ai'),
      markersFound,
    },
    engram: {
      mcpEnabled: engramEnabled,
    },
    praxis: {
      overlayInstalled,
      homeDirExists: await pathExists(paths.praxisDir),
    },
  };
}

export type InstallMode = 'overlay' | 'partial-overlay' | 'standalone' | 'no-claude-code';

export function installModeFor(report: DetectionReport): InstallMode {
  if (!report.claude.configDirExists) return 'no-claude-code';
  if (report.gentleAi.binaryPresent && report.gentleAi.markersFound.length > 0) {
    return 'overlay';
  }
  if (report.gentleAi.binaryPresent) {
    return 'partial-overlay';
  }
  return 'standalone';
}
