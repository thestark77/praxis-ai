import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  START_MARKER,
  END_MARKER,
  findPraxisBlock,
  hasPraxisBlock,
  buildPraxisBlock,
  injectPraxisBlock,
  removePraxisBlock,
  patchClaudeMd,
  unpatchClaudeMd,
} from '../../src/lib/claudemd-patcher.js';

const IMPORT_PATH = '~/.praxis/main.md';

describe('buildPraxisBlock', () => {
  it('produces marker-wrapped @-import line', () => {
    const block = buildPraxisBlock(IMPORT_PATH);
    expect(block).toContain(START_MARKER);
    expect(block).toContain(`@${IMPORT_PATH}`);
    expect(block).toContain(END_MARKER);
  });
});

describe('findPraxisBlock', () => {
  it('returns null when no markers are present', () => {
    expect(findPraxisBlock('plain content')).toBeNull();
  });

  it('returns null when only start marker is present', () => {
    expect(findPraxisBlock(`${START_MARKER}\nincomplete`)).toBeNull();
  });

  it('locates a valid block and exposes its body', () => {
    const content = `prefix\n${START_MARKER}\n@${IMPORT_PATH}\n${END_MARKER}\nsuffix`;
    const found = findPraxisBlock(content);
    expect(found).not.toBeNull();
    expect(found!.body.trim()).toBe(`@${IMPORT_PATH}`);
  });
});

describe('injectPraxisBlock', () => {
  it('appends the block when none exists', () => {
    const result = injectPraxisBlock('existing content\n', IMPORT_PATH);
    expect(result.startsWith('existing content')).toBe(true);
    expect(hasPraxisBlock(result)).toBe(true);
    expect(result.lastIndexOf(START_MARKER)).toBeGreaterThan(result.indexOf('existing content'));
  });

  it('handles content without trailing newline', () => {
    const result = injectPraxisBlock('no trailing newline', IMPORT_PATH);
    expect(hasPraxisBlock(result)).toBe(true);
    expect(result).toContain('no trailing newline\n');
  });

  it('produces output for empty input', () => {
    const result = injectPraxisBlock('', IMPORT_PATH);
    expect(hasPraxisBlock(result)).toBe(true);
  });

  it('is idempotent: running twice does not duplicate the block', () => {
    const once = injectPraxisBlock('existing\n', IMPORT_PATH);
    const twice = injectPraxisBlock(once, IMPORT_PATH);
    expect(twice).toBe(once);
    const startCount = (twice.match(new RegExp(START_MARKER, 'g')) ?? []).length;
    expect(startCount).toBe(1);
  });

  it('replaces existing block when re-injecting with a different import path', () => {
    const initial = injectPraxisBlock('existing\n', '~/old/path.md');
    const updated = injectPraxisBlock(initial, '~/new/path.md');
    expect(updated).toContain('@~/new/path.md');
    expect(updated).not.toContain('@~/old/path.md');
  });

  it('places block AFTER pre-existing gentle-ai blocks (recency)', () => {
    const gentleAi = `<!-- gentle-ai:persona -->\npersona content\n<!-- /gentle-ai:persona -->\n`;
    const result = injectPraxisBlock(gentleAi, IMPORT_PATH);
    const gentleAiEnd = result.indexOf('<!-- /gentle-ai:persona -->');
    const praxisStart = result.indexOf(START_MARKER);
    expect(praxisStart).toBeGreaterThan(gentleAiEnd);
  });
});

describe('removePraxisBlock', () => {
  it('removes block and leaves surrounding content clean', () => {
    const input = `prefix\n\n${START_MARKER}\n@${IMPORT_PATH}\n${END_MARKER}\n\nsuffix`;
    const result = removePraxisBlock(input);
    expect(result).not.toContain(START_MARKER);
    expect(result).not.toContain(END_MARKER);
    expect(result).toContain('prefix');
    expect(result).toContain('suffix');
  });

  it('returns content unchanged when no block is present', () => {
    const input = 'no block here';
    expect(removePraxisBlock(input)).toBe(input);
  });

  it('handles a block at the very end of the file', () => {
    const input = `only content\n\n${START_MARKER}\n@${IMPORT_PATH}\n${END_MARKER}\n`;
    const result = removePraxisBlock(input);
    expect(result.trim()).toBe('only content');
  });
});

describe('patchClaudeMd / unpatchClaudeMd', () => {
  let workDir: string;
  let claudeMd: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'praxis-patch-test-'));
    claudeMd = join(workDir, 'CLAUDE.md');
  });

  it('creates the file when it does not exist', async () => {
    await patchClaudeMd(claudeMd, IMPORT_PATH);
    const content = await readFile(claudeMd, 'utf8');
    expect(hasPraxisBlock(content)).toBe(true);
  });

  it('preserves existing gentle-ai blocks and appends praxis block', async () => {
    const original = `<!-- gentle-ai:persona -->\npersona\n<!-- /gentle-ai:persona -->\n`;
    await writeFile(claudeMd, original, 'utf8');
    await patchClaudeMd(claudeMd, IMPORT_PATH);
    const content = await readFile(claudeMd, 'utf8');
    expect(content).toContain('<!-- gentle-ai:persona -->');
    expect(content).toContain('<!-- /gentle-ai:persona -->');
    expect(hasPraxisBlock(content)).toBe(true);
  });

  it('is idempotent on repeated patch + restores cleanly on unpatch', async () => {
    const original = 'existing content\n';
    await writeFile(claudeMd, original, 'utf8');

    await patchClaudeMd(claudeMd, IMPORT_PATH);
    const afterFirst = await readFile(claudeMd, 'utf8');

    await patchClaudeMd(claudeMd, IMPORT_PATH);
    const afterSecond = await readFile(claudeMd, 'utf8');
    expect(afterSecond).toBe(afterFirst);

    const removed = await unpatchClaudeMd(claudeMd);
    expect(removed).toBe(true);
    const finalContent = await readFile(claudeMd, 'utf8');
    expect(finalContent.trim()).toBe(original.trim());
  });

  it('unpatch returns false when no block is present', async () => {
    await writeFile(claudeMd, 'no praxis here\n', 'utf8');
    const removed = await unpatchClaudeMd(claudeMd);
    expect(removed).toBe(false);
  });

  it('unpatch returns false when file does not exist', async () => {
    const missing = join(workDir, 'missing.md');
    const removed = await unpatchClaudeMd(missing);
    expect(removed).toBe(false);
  });

  it('cleanup test work directory', async () => {
    await rm(workDir, { recursive: true, force: true });
  });
});
