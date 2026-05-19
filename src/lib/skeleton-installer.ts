import { mkdir, readdir, copyFile, stat, rm } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const DEFAULT_TEMPLATES_ROOT = resolvePath(__dirname, '..', 'templates', 'praxis-home');
export const DEFAULT_CLAUDE_SKILLS_TEMPLATES_ROOT = resolvePath(
  __dirname,
  '..',
  'templates',
  'claude-skills',
);

export interface InstallSkeletonOptions {
  templatesRoot: string;
  praxisDir: string;
  overwrite?: boolean;
}

export interface InstallClaudeSkillsOptions {
  templatesRoot: string;
  claudeSkillsDir: string;
  /** Restrict to a subset of top-level skill directories. Default: install all. */
  skills?: string[];
  overwrite?: boolean;
}

export interface SkeletonResult {
  installed: string[];
  skipped: string[];
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function walkDir(root: string): Promise<string[]> {
  const out: string[] = [];
  async function recurse(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await recurse(full);
      } else if (entry.isFile()) {
        out.push(full);
      }
    }
  }
  await recurse(root);
  return out;
}

export async function installSkeleton(opts: InstallSkeletonOptions): Promise<SkeletonResult> {
  const templatesExists = await pathExists(opts.templatesRoot);
  if (!templatesExists) {
    throw new Error(`Templates directory not found: ${opts.templatesRoot}`);
  }

  await mkdir(opts.praxisDir, { recursive: true });

  const sources = await walkDir(opts.templatesRoot);
  const installed: string[] = [];
  const skipped: string[] = [];

  for (const source of sources) {
    const relativeTo = relative(opts.templatesRoot, source);
    const dest = join(opts.praxisDir, relativeTo);
    await mkdir(dirname(dest), { recursive: true });
    if (!opts.overwrite && (await pathExists(dest))) {
      skipped.push(relativeTo);
      continue;
    }
    await copyFile(source, dest);
    installed.push(relativeTo);
  }

  return { installed, skipped };
}

/**
 * Subdirectories of the praxis dir that are USER data, not install
 * artefacts. They must survive an uninstall — otherwise `praxis
 * rollback` (which reads from `backups/`) is orphaned by the very
 * operation it's supposed to recover from. This was caught by the
 * T14 round-trip scenario.
 */
const PRESERVED_ON_UNINSTALL: ReadonlySet<string> = new Set(['backups', 'telemetry.db']);

export async function uninstallSkeleton(praxisDir: string): Promise<void> {
  if (!(await pathExists(praxisDir))) return;
  const entries = await readdir(praxisDir, { withFileTypes: true });
  let preservedCount = 0;
  for (const entry of entries) {
    if (PRESERVED_ON_UNINSTALL.has(entry.name)) {
      preservedCount++;
      continue;
    }
    const fullPath = join(praxisDir, entry.name);
    await rm(fullPath, { recursive: true, force: true });
  }
  // If nothing user-owned remains, fully remove the dir so the old
  // "absence after uninstall" expectation still holds in the empty case.
  if (preservedCount === 0) {
    await rm(praxisDir, { recursive: true, force: true });
  }
}

export async function installClaudeSkills(
  opts: InstallClaudeSkillsOptions,
): Promise<SkeletonResult> {
  const templatesExists = await pathExists(opts.templatesRoot);
  if (!templatesExists) {
    throw new Error(`Claude skills templates directory not found: ${opts.templatesRoot}`);
  }

  await mkdir(opts.claudeSkillsDir, { recursive: true });

  const topLevelEntries = await readdir(opts.templatesRoot, { withFileTypes: true });
  const installed: string[] = [];
  const skipped: string[] = [];

  for (const entry of topLevelEntries) {
    if (!entry.isDirectory()) continue;
    if (opts.skills && !opts.skills.includes(entry.name)) continue;

    const sourceDir = join(opts.templatesRoot, entry.name);
    const destDir = join(opts.claudeSkillsDir, entry.name);
    await mkdir(destDir, { recursive: true });

    const sources = await walkDir(sourceDir);
    for (const source of sources) {
      const relativeTo = relative(opts.templatesRoot, source);
      const dest = join(opts.claudeSkillsDir, relativeTo);
      await mkdir(dirname(dest), { recursive: true });
      if (!opts.overwrite && (await pathExists(dest))) {
        skipped.push(relativeTo);
        continue;
      }
      await copyFile(source, dest);
      installed.push(relativeTo);
    }
  }

  return { installed, skipped };
}

export async function uninstallClaudeSkills(
  claudeSkillsDir: string,
  skills: string[],
): Promise<string[]> {
  const removed: string[] = [];
  for (const name of skills) {
    const dir = join(claudeSkillsDir, name);
    if (await pathExists(dir)) {
      await rm(dir, { recursive: true, force: true });
      removed.push(name);
    }
  }
  return removed;
}
