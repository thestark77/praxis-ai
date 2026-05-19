import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export const START_MARKER = '<!-- praxis:start -->';
export const END_MARKER = '<!-- praxis:end -->';

export interface PraxisBlock {
  startIdx: number;
  endIdx: number;
  body: string;
}

export function findPraxisBlock(content: string): PraxisBlock | null {
  const startIdx = content.indexOf(START_MARKER);
  if (startIdx === -1) return null;
  const endIdx = content.indexOf(END_MARKER, startIdx);
  if (endIdx === -1) return null;
  const bodyStart = startIdx + START_MARKER.length;
  return {
    startIdx,
    endIdx: endIdx + END_MARKER.length,
    body: content.slice(bodyStart, endIdx),
  };
}

export function hasPraxisBlock(content: string): boolean {
  return findPraxisBlock(content) !== null;
}

export function buildPraxisBlock(importPath: string): string {
  return `${START_MARKER}\n@${importPath}\n${END_MARKER}`;
}

export function injectPraxisBlock(content: string, importPath: string): string {
  const block = buildPraxisBlock(importPath);
  const found = findPraxisBlock(content);
  if (found) {
    return content.slice(0, found.startIdx) + block + content.slice(found.endIdx);
  }
  if (content.length === 0) return block + '\n';
  const normalized = content.endsWith('\n') ? content : content + '\n';
  return normalized + '\n' + block + '\n';
}

export function removePraxisBlock(content: string): string {
  const found = findPraxisBlock(content);
  if (!found) return content;
  let before = content.slice(0, found.startIdx).replace(/\n*$/, '');
  const after = content.slice(found.endIdx).replace(/^\n*/, '');
  if (before && after) return before + '\n\n' + after;
  if (before) return before + '\n';
  return after;
}

export async function patchClaudeMd(claudeMdPath: string, importPath: string): Promise<void> {
  let content = '';
  try {
    content = await readFile(claudeMdPath, 'utf8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') throw err;
    await mkdir(dirname(claudeMdPath), { recursive: true });
  }
  const updated = injectPraxisBlock(content, importPath);
  await writeFile(claudeMdPath, updated, 'utf8');
}

export async function unpatchClaudeMd(claudeMdPath: string): Promise<boolean> {
  let content: string;
  try {
    content = await readFile(claudeMdPath, 'utf8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return false;
    throw err;
  }
  if (!hasPraxisBlock(content)) return false;
  const updated = removePraxisBlock(content);
  await writeFile(claudeMdPath, updated, 'utf8');
  return true;
}
