import { describe, it, expect } from 'vitest';
import {
  stripUnspeakable,
  splitSentences,
  summariseForSpeech,
} from '../../src/lib/voice/summarise.js';

// A Claude Code answer is written to be read. Spoken verbatim it becomes a
// minute of someone reciting punctuation and directory names, which is why
// the naive version of this feature gets switched off within a day.

describe('dropping what cannot be spoken', () => {
  it('removes fenced code blocks entirely', () => {
    const out = stripUnspeakable('Before.\n```bash\nnpm run build\n```\nAfter.');
    expect(out).toContain('Before.');
    expect(out).toContain('After.');
    expect(out).not.toContain('npm run build');
  });

  it('removes an unterminated code fence at the end of a stream', () => {
    const out = stripUnspeakable('Result.\n```js\nconst x = 1;');
    expect(out).not.toContain('const x');
    expect(out).toContain('Result.');
  });

  it('removes markdown tables', () => {
    const out = stripUnspeakable('Summary.\n| a | b |\n| --- | --- |\n| 1 | 2 |\nEnd.');
    expect(out).not.toContain('|');
    expect(out).toContain('Summary.');
    expect(out).toContain('End.');
  });

  it('removes URLs', () => {
    expect(stripUnspeakable('See https://example.com/a/b now.')).not.toContain('http');
  });

  it('removes Windows and POSIX paths', () => {
    const out = stripUnspeakable(
      'Wrote C:\\Users\\sebas\\Desktop\\praxis-ai\\src\\index.ts and /home/sebas/.claude/settings.json ok.',
    );
    expect(out).not.toContain('Users');
    expect(out).not.toContain('.claude');
    expect(out).toContain('Wrote');
    expect(out).toContain('ok');
  });

  it('keeps a short inline identifier but drops a long one', () => {
    const out = stripUnspeakable('Run `npm test` not `some::very::long::qualified::symbol::name`.');
    expect(out).toContain('npm test');
    expect(out).not.toContain('qualified');
  });

  it('strips headings, bullets, emphasis and check marks', () => {
    const out = stripUnspeakable('## Title\n- **bold** item ✓\n> quoted');
    expect(out).not.toMatch(/[#>*✓]/);
    expect(out).toContain('bold');
    expect(out).toContain('quoted');
  });

  it('keeps a markdown link label and drops its target', () => {
    const out = stripUnspeakable('See [the release](https://github.com/x/y/releases/tag/v1) here.');
    expect(out).toContain('the release');
    expect(out).not.toContain('github');
  });
});

describe('splitting sentences', () => {
  it('keeps terminators', () => {
    expect(splitSentences('One. Two! Three?')).toEqual(['One.', 'Two!', 'Three?']);
  });

  it('handles a final sentence with no terminator', () => {
    expect(splitSentences('One. Two')).toEqual(['One.', 'Two']);
  });

  it('treats separate lines as separate sentences', () => {
    expect(splitSentences('First line\nSecond line')).toHaveLength(2);
  });
});

describe('choosing what to say', () => {
  it('returns short text untouched', () => {
    expect(summariseForSpeech('All done.', { maxChars: 200 })).toBe('All done.');
  });

  it('keeps the outcome instead of the preamble', () => {
    // The failure mode of blind truncation: a written answer puts the
    // detail in the middle, so cutting at a character count reliably spoke
    // the throat-clearing and threw away the result.
    const text =
      'I started by looking at the configuration and reading through the existing setup carefully. ' +
      'Then I reviewed several unrelated files to understand the surrounding conventions in detail. ' +
      'All 462 tests passed and the build is green.';
    const out = summariseForSpeech(text, { maxChars: 120 });
    expect(out).toContain('462');
    expect(out).toContain('green');
  });

  it('keeps a question aimed at the listener', () => {
    const text =
      'I finished the first part of the work and moved on to the second one without trouble. ' +
      'There was a lot of routine detail in the middle that does not matter much at all here. ' +
      '¿Querés que publique la versión?';
    const out = summariseForSpeech(text, { maxChars: 110 });
    expect(out).toContain('¿Querés que publique');
  });

  it('preserves the original order of what it keeps', () => {
    const text =
      'Build failed on Windows with a compiler error that stopped everything immediately. ' +
      'Some filler text sits here that carries no outcome and should be dropped first. ' +
      'Fixed it by pinning the dependency to version 12.';
    const out = summariseForSpeech(text, { maxChars: 170 });
    const failedAt = out.indexOf('failed');
    const fixedAt = out.indexOf('Fixed');
    expect(failedAt).toBeGreaterThanOrEqual(0);
    expect(fixedAt).toBeGreaterThan(failedAt);
  });

  it('never exceeds the budget', () => {
    const text = Array.from(
      { length: 40 },
      (_, i) => `Sentence number ${i} carries some amount of detail about the work done.`,
    ).join(' ');
    for (const budget of [60, 120, 350]) {
      expect(summariseForSpeech(text, { maxChars: budget }).length).toBeLessThanOrEqual(budget);
    }
  });

  it('trims a single sentence longer than the whole budget', () => {
    const text = 'A single very long sentence that just keeps going and going past every limit set';
    const out = summariseForSpeech(text, { maxChars: 40 });
    expect(out.length).toBeLessThanOrEqual(41);
    expect(out.endsWith('…')).toBe(true);
  });

  it('returns nothing for input that was entirely unspeakable', () => {
    // A response that is only a code block has nothing to announce.
    expect(summariseForSpeech('```\nnpm run build\n```', { maxChars: 200 })).toBe('');
  });

  it('shrinks a realistic answer to a fraction of its length', () => {
    const answer = [
      '## Listo',
      '',
      'Implementé el resumidor y **todo quedó verde**: 462 tests pasando.',
      '',
      '```bash',
      'npm run build && npm test',
      '```',
      '',
      '| Check | Resultado |',
      '| --- | --- |',
      '| CI | 9/9 |',
      '',
      'Escribí el módulo en `C:\\Users\\sebas\\Desktop\\praxis-ai\\src\\lib\\voice\\summarise.ts`',
      'y lo conecté al pipeline existente sin tocar nada más del flujo actual.',
      '',
      'Detalles menores sobre convenciones internas que no cambian el resultado final.',
      '',
      '¿Querés que lo publique?',
    ].join('\n');

    const out = summariseForSpeech(answer, { maxChars: 220 });
    expect(out.length).toBeLessThanOrEqual(220);
    expect(out.length).toBeLessThan(answer.length / 2);
    // The two things a listener needs: the outcome and the question.
    expect(out).toContain('462');
    expect(out).toContain('¿Querés');
    // And none of the noise.
    expect(out).not.toContain('|');
    expect(out).not.toContain('npm run build');
    expect(out).not.toContain('Users');
  });
});

describe('repairing what removal leaves behind', () => {
  // Heard in the first real run, not predicted: deleting a path or a URL
  // out of the middle of a sentence leaves a grammatical stump that a
  // listener hears as a mistake.
  it('collapses a preposition stranded against a conjunction', () => {
    const winPath = ['C:', 'Users', 'sebas', 'src', 'index.ts'].join('\\');
    const out = stripUnspeakable(`Escribí el módulo en ${winPath} y lo conecté.`);
    expect(out).not.toMatch(/\ben y\b/);
    expect(out).toContain('Escribí el módulo');
    expect(out).toContain('lo conecté');
  });

  it('collapses a verb left with a dangling preposition', () => {
    const out = stripUnspeakable('Ver https://example.com/x para el diff completo.');
    expect(out).not.toMatch(/\bVer para\b/);
    expect(out).toContain('el diff completo');
  });

  it('leaves a preposition that still has its object', () => {
    const text = 'Escribí el módulo en el proyecto y lo conecté.';
    expect(stripUnspeakable(text)).toContain('en el proyecto');
  });
});

describe('reserving room for a question', () => {
  // Ranking alone starves it: the highest-scoring sentence can be long
  // enough to consume the budget, and the one thing a listener who walked
  // away cannot afford to miss is that they are being asked something.
  it('keeps the question even when a higher-scoring sentence would fill the budget', () => {
    const text =
      'Implemented the whole feature and every one of the 481 tests passed on all nine cells. ' +
      '¿Publico la versión?';
    const out = summariseForSpeech(text, { maxChars: 100 });
    expect(out).toContain('¿Publico la versión?');
  });

  it('still reports the outcome alongside the question when both fit', () => {
    const text = 'All 481 tests passed. Some filler in between here. ¿Publico?';
    const out = summariseForSpeech(text, { maxChars: 60 });
    expect(out).toContain('481');
    expect(out).toContain('¿Publico?');
  });
});

describe('believing a writer who marks their own text as skippable', () => {
  it('drops a sentence that says it does not matter', () => {
    // The first real summary kept exactly this and dropped what had been done.
    const text =
      'Fixed the parser and all 481 tests pass now. ' +
      'Detalles menores sobre convenciones internas que no cambian el resultado final. ' +
      'Replaced the blind truncation with a ranked summariser.';
    const out = summariseForSpeech(text, { maxChars: 120 });
    expect(out).not.toContain('Detalles menores');
    expect(out).toContain('481');
  });
});
