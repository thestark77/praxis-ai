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

describe('an unlimited budget', () => {
  it('keeps every sentence, having only removed what cannot be spoken', () => {
    // The point of asking for no budget is that nothing worth hearing is
    // dropped. Ranking still runs for a finite budget; here there is nothing
    // to rank away, so the result is the cleaned text and nothing less.
    const answer = [
      'Encontre la causa real del fallo.',
      'El VPS tiene alpha 14, npm publica alpha 17, el repo va por alpha 18.',
      'Los 134 tests quedaron en verde.',
      '```bash\nrm -rf /tmp/x\n```',
      '| col | col |',
      'Necesito que corras el script una vez mas.',
    ].join('\n');

    const spoken = summariseForSpeech(answer, { maxChars: Number.POSITIVE_INFINITY });

    expect(spoken).toContain('alpha 14');
    expect(spoken).toContain('alpha 18'); // the detail a 350 budget dropped
    expect(spoken).toContain('134 tests');
    expect(spoken).toContain('una vez mas');
    expect(spoken).not.toContain('rm -rf'); // stripping still applies
    expect(spoken).not.toContain('|');
    expect(spoken).not.toContain('…'); // nothing was truncated
  });

  it('does not truncate a single long sentence', () => {
    const long = `Este turno explica ${'un detalle importante '.repeat(60)}y termina bien.`;
    const spoken = summariseForSpeech(long, { maxChars: Number.POSITIVE_INFINITY });
    expect(spoken).toContain('termina bien');
    expect(spoken).not.toContain('…');
  });
});

describe('referring to what cannot be spoken', () => {
  // Deleting a link outright loses the fact that a link was given at all. The
  // listener is told what was left in the written answer so they know to go
  // and look, without forty syllables of separators being read at them.

  it('names a link instead of deleting it', () => {
    const out = stripUnspeakable('Mira https://github.com/a/b y me dices.');
    expect(out).not.toContain('http');
    expect(out).toContain('un enlace');
    expect(out).toContain('me dices');
  });

  it('names a path by its last segment, not its separators', () => {
    const out = stripUnspeakable('Lo dejé en C:\\Users\\sebas\\Desktop\\notas.md ya.');
    expect(out).not.toContain('C:\\');
    expect(out).toContain('notas.md');
    expect(out).not.toContain('Users');
  });

  it('names a POSIX path the same way', () => {
    const out = stripUnspeakable('Escribí /home/sebas/iris-stack/scripts/gh.sh hoy.');
    expect(out).not.toContain('/home/sebas');
    expect(out).toContain('gh.sh');
  });

  it('announces a code block by its language', () => {
    const out = stripUnspeakable('Corre esto:\n```powershell\nGet-Process\n```\nY listo.');
    expect(out).not.toContain('Get-Process');
    expect(out).toContain('powershell');
    expect(out).toContain('listo');
  });

  it('announces an unlabelled code block generically', () => {
    const out = stripUnspeakable(
      'Para limpiarlo corre esto que te dejo:\n```\nrm -rf /tmp/x\n```\ny con eso queda.',
    );
    expect(out).not.toContain('rm -rf');
    expect(out).toMatch(/bloque de (codigo|código)/);
  });

  it('announces a table', () => {
    const out = stripUnspeakable(
      'Estos son los resultados que te resumo:\n| a | b |\n| --- | --- |\n| 1 | 2 |\nY con eso terminamos.',
    );
    expect(out).not.toContain('|');
    expect(out).toContain('una tabla');
    expect(out).toContain('terminamos');
  });

  it('uses English wording for an English answer', () => {
    const out = stripUnspeakable('I left it at https://example.com/x for you to read.');
    expect(out).toContain('a link');
    expect(out).not.toContain('un enlace');
  });

  it('does not announce the same thing twice in a row', () => {
    // Three links in one sentence read as "a link a link a link", which is
    // worse than the deletion it replaced.
    const out = stripUnspeakable('Ver https://a.com https://b.com https://c.com ahora.');
    expect((out.match(/un enlace/g) ?? []).length).toBe(1);
  });

  it('does not stutter when the prose already named the thing', () => {
    // "Te dejo el enlace en https://..." becomes "el enlace en un enlace",
    // which sounds like a fault. The writer already said what it was.
    const out = stripUnspeakable('Te dejo el enlace en https://github.com/a/b para que mires.');
    expect(out).toContain('el enlace');
    expect(out).not.toMatch(/enlace\s+en\s+un enlace/);
  });

  it('does the same in English', () => {
    const out = stripUnspeakable('I left the link at https://example.com/x for you to read.');
    expect(out).not.toMatch(/link\s+at\s+a link/);
  });

  it('still keeps a short inline identifier as itself', () => {
    expect(stripUnspeakable('Corre `npm test` ahora.')).toContain('npm test');
  });
});

describe('inline code that is too long to read', () => {
  // Dropping it outright leaves a sentence without its subject: "La causa:
  // `Get-CimInstance Win32_Process` reporta mal" became "La causa: reporta
  // mal", which a listener hears as a fault in the speech, not as an omission.
  // Naming it keeps the sentence standing and tells them where to look.

  it('names a long command instead of deleting it', () => {
    const out = stripUnspeakable(
      'La causa es que `Get-CimInstance Win32_Process` reporta mal la linea de comandos.',
    );
    expect(out).not.toContain('Get-CimInstance');
    expect(out).toContain('un comando');
    expect(out).toContain('reporta mal');
  });

  it('uses English wording for an English sentence', () => {
    const out = stripUnspeakable(
      'The problem is that `Get-CimInstance Win32_Process` reports the command line badly for you.',
    );
    expect(out).toContain('a command');
    expect(out).not.toContain('un comando');
  });

  it('still keeps a short identifier as itself', () => {
    expect(stripUnspeakable('Corre `npm test` y me dices que tal.')).toContain('npm test');
  });

  it('does not stutter when the prose already said "comando"', () => {
    const out = stripUnspeakable(
      'Te dejo el comando `Get-CimInstance Win32_Process -Filter x` para que lo mires.',
    );
    expect(out).not.toMatch(/comando\s+un comando/);
  });
});
