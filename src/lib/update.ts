// `praxis update` — refresh the external pieces praxis depends on, to
// their latest, modularly, without touching the rest of the praxis
// overlay (CLAUDE.md block, firewall deny list, AST hook, telemetry,
// ~/.praxis skeleton are all left untouched).
//
// Two independent targets:
//
//   gentle-ai — updated via gentle-ai's OWN config-preserving primitives:
//     1. `gentle-ai upgrade`  (binary self-update; brew installs are
//        instructed to `brew upgrade` instead — surfaced as a note)
//     2. `gentle-ai sync`     (re-applies all components incl. engram for
//        the installed agents from persisted state — preserves persona,
//        preset, and model assignments). Strict TDD is preserved by
//        reading the current state and passing --strict-tdd only when it
//        is already enabled.
//
//   skills — the six lifted mattpocock skills are refreshed from the
//     praxis-ai repo (the canonical source of the *lifted*,
//     mechanism-pure artifacts). "Latest" means the latest re-lift on
//     praxis-ai main, so a mattpocock change reaches users as soon as we
//     re-lift + push — no npm release required. Only the six
//     praxis-managed skill dirs are overwritten; any other skill in
//     ~/.claude/skills/ is left alone.

import { spawnSync } from 'node:child_process';
import { resolvePaths, type PraxisPaths } from './paths.js';
import { detect } from './detector.js';
import { POCOCK_SKILLS } from '../data/pocock-skills.js';
import {
  defaultCommandRunner,
  type CommandRunner,
  type CommandResult,
} from './gentle-ai-bootstrap.js';

export const PRAXIS_SKILLS_BASE_URL =
  'https://raw.githubusercontent.com/thestark77/praxis-ai/main/templates/claude-skills';

/** Fetch a text file. Returns null on 404, throws on other network errors. */
export type FileFetcher = (url: string) => Promise<string | null>;

export interface UpdateOptions {
  paths?: PraxisPaths;
  /** Update gentle-ai (binary + components + engram). Default true. */
  gentleAi?: boolean;
  /** Update the lifted skills from the praxis-ai repo. Default true. */
  skills?: boolean;
  /** Injectable command runner (tests). */
  run?: CommandRunner;
  /** Injectable file fetcher (tests). */
  fetchFile?: FileFetcher;
  /** Injectable PATH probe for the gentle-ai binary (tests). */
  hasGentleAi?: () => boolean;
}

export interface GentleAiUpdateResult {
  attempted: boolean;
  skippedReason?: string;
  upgrade?: CommandResult;
  sync?: CommandResult;
  strictTddPreserved: boolean;
  warnings: string[];
}

export interface SkillsUpdateResult {
  updatedFiles: string[];
  failedFiles: string[];
}

export interface UpdateResult {
  gentleAi: GentleAiUpdateResult | null;
  skills: SkillsUpdateResult | null;
  warnings: string[];
}

/** The lifted files praxis manages per skill: upstream basenames + NOTICE.md. */
export function liftedFilesFor(skillName: string): string[] {
  const skill = POCOCK_SKILLS.find((s) => s.name === skillName);
  if (!skill) return [];
  const basenames = new Set<string>();
  for (const f of skill.files) {
    const parts = f.upstreamPath.split('/');
    basenames.add(parts[parts.length - 1]);
  }
  basenames.add('NOTICE.md');
  return [...basenames];
}

const defaultFetchFile: FileFetcher = async (url) => {
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`fetch ${url}: HTTP ${res.status}`);
  return res.text();
};

function probeGentleAi(): boolean {
  const finder = process.platform === 'win32' ? 'where' : 'which';
  return spawnSync(finder, ['gentle-ai'], { stdio: 'ignore' }).status === 0;
}

/** Read the current Strict TDD state from the gentle-ai marker in CLAUDE.md. */
async function strictTddEnabled(claudeMdPath: string): Promise<boolean> {
  try {
    const { readFile } = await import('node:fs/promises');
    const content = await readFile(claudeMdPath, 'utf8');
    const m = content.match(
      /<!-- gentle-ai:strict-tdd-mode -->([\s\S]*?)<!-- \/gentle-ai:strict-tdd-mode -->/,
    );
    if (!m) return false;
    return /enabled/i.test(m[1]);
  } catch {
    return false;
  }
}

async function updateGentleAi(
  paths: PraxisPaths,
  run: CommandRunner,
  hasGentleAi: () => boolean,
): Promise<GentleAiUpdateResult> {
  const result: GentleAiUpdateResult = {
    attempted: false,
    strictTddPreserved: false,
    warnings: [],
  };

  if (!hasGentleAi()) {
    result.skippedReason =
      'gentle-ai is not installed. Run `praxis install` first to bootstrap it.';
    return result;
  }

  result.attempted = true;

  // 1. Binary self-update. Non-fatal; brew installs get a note instead.
  const upgrade = await run('gentle-ai', ['upgrade']);
  result.upgrade = upgrade;
  if (upgrade.code !== 0) {
    result.warnings.push(
      `gentle-ai upgrade exited ${upgrade.code} (brew installs update via \`brew upgrade gentle-ai\`). ${upgrade.stderr.slice(0, 200)}`,
    );
  }

  // 2. Component + engram refresh, preserving persona/preset/models.
  const tdd = await strictTddEnabled(paths.claudeMd);
  result.strictTddPreserved = tdd;
  const syncArgs = ['sync'];
  if (tdd) syncArgs.push('--strict-tdd');
  const sync = await run('gentle-ai', syncArgs);
  result.sync = sync;
  if (sync.code !== 0) {
    result.warnings.push(`gentle-ai sync exited ${sync.code}. ${sync.stderr.slice(0, 200)}`);
  }

  return result;
}

async function updateSkills(
  paths: PraxisPaths,
  fetchFile: FileFetcher,
): Promise<SkillsUpdateResult> {
  const { mkdir, writeFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const result: SkillsUpdateResult = { updatedFiles: [], failedFiles: [] };

  for (const skill of POCOCK_SKILLS) {
    const destDir = join(paths.claudeSkillsDir, skill.name);
    for (const file of liftedFilesFor(skill.name)) {
      const rel = `${skill.name}/${file}`;
      const url = `${PRAXIS_SKILLS_BASE_URL}/${rel}`;
      try {
        const content = await fetchFile(url);
        if (content === null) {
          result.failedFiles.push(`${rel} (not found upstream)`);
          continue;
        }
        await mkdir(destDir, { recursive: true });
        await writeFile(join(paths.claudeSkillsDir, skill.name, file), content, 'utf8');
        result.updatedFiles.push(rel);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.failedFiles.push(`${rel} (${message})`);
      }
    }
  }

  return result;
}

export async function runUpdate(opts: UpdateOptions = {}): Promise<UpdateResult> {
  const paths = opts.paths ?? resolvePaths();
  const doGentleAi = opts.gentleAi ?? true;
  const doSkills = opts.skills ?? true;
  const run = opts.run ?? defaultCommandRunner;
  const fetchFile = opts.fetchFile ?? defaultFetchFile;
  const hasGentleAi = opts.hasGentleAi ?? probeGentleAi;

  const result: UpdateResult = { gentleAi: null, skills: null, warnings: [] };

  // Guard: praxis must be installed (Claude Code config dir exists).
  const report = await detect(paths);
  if (!report.claude.configDirExists) {
    throw new Error(
      `Claude Code config dir not found at ${paths.claudeDir}. Run \`praxis install\` first.`,
    );
  }

  if (doGentleAi) {
    result.gentleAi = await updateGentleAi(paths, run, hasGentleAi);
    result.warnings.push(...result.gentleAi.warnings.map((w) => `gentle-ai: ${w}`));
    if (result.gentleAi.skippedReason) {
      result.warnings.push(`gentle-ai: ${result.gentleAi.skippedReason}`);
    }
  }

  if (doSkills) {
    result.skills = await updateSkills(paths, fetchFile);
    for (const f of result.skills.failedFiles) {
      result.warnings.push(`skills: ${f}`);
    }
  }

  return result;
}
