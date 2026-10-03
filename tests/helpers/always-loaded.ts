import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

// Renders the always-loaded praxis payload the way Claude Code does. It
// expands every @-import at launch, so an import never reduces context cost:
// whatever main.md pulls in is paid on every turn of every session. These
// numbers hold that payload under a budget so the layer cannot silently grow
// back. Procedures belong in on-demand skills (description always loaded,
// body only when needed). Raising a budget is a deliberate, reviewable act.

/** Bytes of expanded @-imports (main.md plus everything it imports). */
export const IMPORT_BUDGET_BYTES = 17_500;
/** Imports plus the skill-listing line of every auto-loadable praxis skill. */
export const ALWAYS_LOADED_BUDGET_BYTES = 19_000;
/** Anthropic guidance: keep each always-loaded instruction file under ~200 lines. */
export const MAX_LINES_PER_FILE = 200;
/** Claude Code follows imports at most this many hops deep. */
export const MAX_IMPORT_DEPTH = 4;

export interface RenderedFile {
  /** Path relative to the home root, e.g. `presets/balanced.md`. */
  path: string;
  text: string;
  bytes: number;
  lines: number;
}

/** Expand `main.md` and its `@file` imports under `homeRoot`, depth-first. */
export async function renderImports(homeRoot: string): Promise<RenderedFile[]> {
  const seen = new Set<string>();
  const files: RenderedFile[] = [];
  async function walk(path: string, depth: number): Promise<void> {
    if (seen.has(path) || depth > MAX_IMPORT_DEPTH) return;
    seen.add(path);
    const text = await readFile(path, 'utf8');
    files.push({
      path: path.slice(homeRoot.length + 1),
      text,
      bytes: Buffer.byteLength(text),
      lines: text.split('\n').length - 1,
    });
    for (const m of text.matchAll(/^@(\S+)$/gm)) {
      await walk(join(dirname(path), m[1]), depth + 1);
    }
  }
  await walk(join(homeRoot, 'main.md'), 0);
  return files;
}

/** Bytes the skill-listing line for `name` costs (an approximation of the listing format). */
export async function skillListingBytes(skillsRoot: string, name: string): Promise<number> {
  const content = await readFile(join(skillsRoot, name, 'SKILL.md'), 'utf8');
  const description = content.match(/^description:\s*(.*)$/m)?.[1] ?? '';
  return Buffer.byteLength(`- ${name}: ${description}\n`);
}
