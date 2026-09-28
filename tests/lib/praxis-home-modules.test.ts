import { describe, it, expect } from 'vitest';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const templatesRoot = join(import.meta.dirname, '..', '..', 'templates', 'praxis-home');
const mainPath = join(templatesRoot, 'main.md');

function extractImports(mainContent: string): string[] {
  const importLine = /^@(\S+)$/gm;
  const imports: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = importLine.exec(mainContent)) !== null) {
    imports.push(match[1]);
  }
  return imports;
}

describe('templates/praxis-home/main.md imports', () => {
  it('every @-import in main.md resolves to an existing file under templates/praxis-home/', async () => {
    const mainContent = await readFile(mainPath, 'utf8');
    const imports = extractImports(mainContent);

    // Guard the guard: fail loudly if the parser stops finding anything,
    // instead of vacuously passing on an empty list.
    expect(imports.length).toBeGreaterThan(0);

    for (const relPath of imports) {
      const fullPath = join(templatesRoot, relPath);
      await expect(
        stat(fullPath),
        `@${relPath} in main.md does not resolve to an existing file`,
      ).resolves.toBeDefined();
    }
  });

  it('imports queue-rule.md', async () => {
    const mainContent = await readFile(mainPath, 'utf8');
    const imports = extractImports(mainContent);
    expect(imports).toContain('queue-rule.md');
  });
});

describe('templates/praxis-home/queue-rule.md', () => {
  it('contains the key clauses of the queue-dont-preempt rule', async () => {
    const content = await readFile(join(templatesRoot, 'queue-rule.md'), 'utf8');

    expect(content).toContain('clean, resumable checkpoint');
    expect(content).toContain('highest priority first');

    // Literal exception trigger words must survive verbatim.
    for (const trigger of ['now', 'ahora', 'ya', 'urgente']) {
      expect(content).toContain(trigger);
    }
  });
});
