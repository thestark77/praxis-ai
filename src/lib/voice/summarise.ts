// Turn a terminal answer into something worth hearing.
//
// A Claude Code response is written to be *read*: fenced code, tables,
// absolute paths, URLs, bold markers, check marks. Feeding that to a
// text-to-speech engine produces a minute of someone reciting punctuation
// and directory names, which is why the naive version of this feature is
// always switched off again within a day.
//
// The job is not compression for its own sake. It is choosing what a person
// who has walked away from the terminal actually needs: did it work, what
// changed, and is anything waiting on them. Two moves get there:
//
//   1. Delete what cannot be spoken. A code block read aloud is noise, and
//      dropping it loses nothing, because nobody listens to a diff. Same
//      for tables, URLs and long paths -- a path is read back as forty
//      syllables of separators.
//   2. Rank what remains. The sentences carrying an outcome -- counts,
//      pass/fail, versions, "done", a question aimed at the user -- are the
//      ones worth the budget, and they are kept in the order they were
//      written so the result still reads as prose.
//
// Deliberately deterministic: no second model call. Summarising a
// notification by asking an LLM would add latency, cost and a failure mode
// to a feature whose entire appeal is that it is cheap and quiet.

/** Words that mark a sentence as carrying an outcome, in English and Spanish. */
const OUTCOME_WORDS = [
  // English
  'pass',
  'passed',
  'fail',
  'failed',
  'error',
  'broke',
  'broken',
  'fixed',
  'done',
  'complete',
  'green',
  'merged',
  'published',
  'released',
  'installed',
  'blocked',
  'verified',
  'confirmed',
  'ready',
  'wrong',
  'cannot',
  'could not',
  'warning',
  // Spanish
  'listo',
  'falla',
  'fallo',
  'falló',
  'roto',
  'arreglado',
  'corregido',
  'verde',
  'verificado',
  'confirmado',
  'publicado',
  'instalado',
  'bloqueado',
  'error',
  'terminado',
  'completo',
  'pendiente',
];

/**
 * Verbs that report an action taken. A sentence saying what was actually
 * done is the second most useful thing after whether it worked.
 */
const ACTION_WORDS = [
  'implemented',
  'wrote',
  'added',
  'removed',
  'replaced',
  'fixed',
  'changed',
  'created',
  'moved',
  'upgraded',
  'migrated',
  'implementé',
  'escribí',
  'agregué',
  'quité',
  'reemplacé',
  'reemplazando',
  'arreglé',
  'cambié',
  'creé',
  'moví',
  'actualicé',
  'corregí',
];

/**
 * Phrases with which a writer marks their own text as skippable.
 *
 * A sentence that says "minor details that do not change the result" is
 * telling the listener not to spend the budget on it, and taking that at
 * face value is free accuracy. Found by listening to the first real
 * summary, which kept exactly this and dropped what had been done.
 */
const FILLER_WORDS = [
  'minor detail',
  'minor details',
  'does not change',
  'do not change',
  'nothing else',
  'as an aside',
  'by the way',
  'for context',
  'worth noting',
  'detalles menores',
  'detalle menor',
  'no cambian',
  'no cambia',
  'sin tocar nada',
  'de paso',
  'por cierto',
  'vale aclarar',
  'como nota',
];

/**
 * Phrases that mean the user has to do something. Always worth speaking.
 *
 * These lists match text; they never generate any. Regional variants sit
 * alongside the neutral forms purely so detection still works on an answer
 * written that way -- praxis itself writes neutral Spanish.
 */
const ATTENTION_WORDS = [
  'need',
  'needs',
  'you should',
  'please',
  'waiting',
  'decide',
  'confirm',
  'necesito',
  'necesitás',
  'necesitas',
  'tenés que',
  'tienes que',
  'falta',
  'pendiente',
  'decime',
  'dime',
  'avisame',
];

/**
 * Wording for the things that get replaced rather than read.
 *
 * Deleting a link outright loses the fact that a link was given at all, and a
 * listener who is told nothing has no reason to go back and look. Naming it
 * costs three words and keeps the pointer.
 */
const REFERENCES = {
  es: {
    link: 'un enlace',
    table: 'una tabla',
    code: 'un bloque de codigo',
    codeIn: 'un bloque de',
  },
  en: { link: 'a link', table: 'a table', code: 'a code block', codeIn: 'a block of' },
} as const;

/** Every placeholder phrase, for deciding whether anything real survived. */
const ALL_REFERENCES: string[] = Object.values(REFERENCES).flatMap((set) => Object.values(set));

/**
 * Which wording to use, from the answer itself.
 *
 * Crude on purpose: accented vowels and a handful of function words separate
 * the two languages praxis's word lists already cover, and a wrong guess costs
 * three words in the wrong language rather than a lost sentence.
 */
export function detectLanguage(text: string): 'es' | 'en' {
  if (/[áéíóúñ¿¡]/i.test(text)) return 'es';
  // Score both sides rather than testing one: an English answer quoting a
  // Spanish identifier should not flip, and a Spanish answer full of English
  // tool names should not either. Only words that are unambiguous in one
  // language are listed; "no", "en" and "a" are in both and would decide
  // nothing.
  const count = (words: string[]): number =>
    words.reduce(
      (total, word) =>
        total + (text.match(new RegExp(`(^|[^\\p{L}])${word}([^\\p{L}]|$)`, 'giu')) ?? []).length,
      0,
    );
  const es = count([
    'que',
    'para',
    'con',
    'pero',
    'este',
    'esta',
    'como',
    'cuando',
    'donde',
    'porque',
    'desde',
    'hasta',
    'sobre',
    'entre',
    'ahora',
    'luego',
    'tambien',
    'solo',
    'aqui',
    'los',
    'las',
    'una',
    'del',
    'se',
    'le',
    'lo',
    'me',
    'te',
    'su',
    'mi',
    'tu',
    'es',
    'son',
    'hay',
    'ser',
    'estar',
    'mira',
    'dices',
    'dice',
    'dejo',
    'listo',
    'muy',
    'mas',
    'y',
  ]);
  const en = count([
    'the',
    'and',
    'for',
    'you',
    'with',
    'this',
    'that',
    'from',
    'have',
    'was',
    'are',
    'not',
    'but',
    'all',
    'can',
    'will',
    'would',
    'should',
    'been',
    'they',
    'there',
    'what',
    'when',
    'where',
    'which',
    'while',
    'left',
    'read',
    'your',
  ]);
  return es > en ? 'es' : 'en';
}

/**
 * Drop a placeholder the prose already introduced.
 *
 * "Te dejo el enlace en https://..." becomes "el enlace en un enlace", which
 * sounds like a stutter rather than a reference. The writer already named the
 * thing; the placeholder only has to carry it when nothing else does.
 */
function dropRedundantMention(text: string, phrase: string): string {
  const noun = phrase.split(' ').pop()!;
  const escapedNoun = noun.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(
    new RegExp(`(${escapedNoun})(\\s+(?:en|a|at|in|de|of)\\s+)${escaped}`, 'gi'),
    '$1',
  );
}

/** Collapse "a link a link a link" back down to one mention. */
function dedupeAdjacent(text: string, phrase: string): string {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(?:${escaped})(?:[\\s,]+(?:${escaped}))+`, 'gi'), phrase);
}

/**
 * The speakable tail of a path: the file, not the forty syllables before it.
 *
 * "C:\\Users\\sebas\\Desktop\\notas.md" is unlistenable read out, but
 * "notas.md" tells the listener exactly which file was meant.
 */
function pathTail(raw: string): string {
  const parts = raw.split(/[\\/]+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1]! : raw;
}

/**
 * Strip everything that cannot usefully be spoken.
 *
 * Order matters: fenced blocks go first so their contents cannot be
 * mistaken for prose, and decoration is stripped last so the earlier
 * patterns still see their markers.
 */
export function stripUnspeakable(text: string): string {
  let out = text;
  const ref = REFERENCES[detectLanguage(text)];

  // Fenced code blocks, including unterminated ones at the end of a stream.
  // Announced rather than deleted: "run this: a block of powershell" tells the
  // listener there is something to go and copy.
  out = out.replace(/```([\w+-]*)\n?[\s\S]*?```/g, (_m, lang: string) =>
    lang ? ` ${ref.codeIn} ${lang}. ` : ` ${ref.code}. `,
  );
  out = out.replace(/```([\w+-]*)[\s\S]*$/g, (_m, lang: string) =>
    lang ? ` ${ref.codeIn} ${lang}. ` : ` ${ref.code}. `,
  );

  // Markdown tables: any line that is mostly pipes, replaced by one mention.
  let announcedTable = false;
  out = out
    .split('\n')
    .map((line) => {
      if (!line.trim().startsWith('|')) return line;
      if (announcedTable) return '';
      announcedTable = true;
      return `${ref.table}.`;
    })
    .join('\n');

  // Table rule lines like |---|---|
  out = out.replace(/^[\s|:-]+$/gm, ' ');

  // Real URLs first, then PATHS, and only then bare hosts. Order matters: the
  // bare-host pattern ends in `sh`, so it claims the `gh.sh` at the end of
  // `/home/sebas/scripts/gh.sh` and the listener is told "a link" about a file
  // that is not one. Paths are the more specific shape, so they go first.
  out = out.replace(/https?:\/\/\S+/g, ` ${ref.link} `);

  // Paths: keep the file, drop the separators before it.
  out = out.replace(/[A-Za-z]:\\[^\s'"`]+/g, (m) => ` ${pathTail(m)} `);
  out = out.replace(/(?:^|\s)(?:~|\.{1,2})?\/[^\s'"`]{6,}/g, (m) => ` ${pathTail(m)} `);

  out = out.replace(/\b[\w.-]+\.(com|org|net|io|dev|ai)\b\S*/g, ` ${ref.link} `);
  out = dedupeAdjacent(out, ref.link);
  out = dropRedundantMention(out, ref.link);
  out = dropRedundantMention(out, ref.table);

  // Inline code: keep short identifiers, drop long ones.
  out = out.replace(/`([^`]*)`/g, (_m, inner: string) => (inner.length <= 24 ? inner : ' '));

  // Headings, list bullets, blockquote markers, emphasis, check marks.
  out = out.replace(/^#{1,6}\s+/gm, ' ');
  out = out.replace(/^\s*[-*+]\s+/gm, ' ');
  out = out.replace(/^\s*>\s?/gm, ' ');
  out = out.replace(/\*\*([^*]+)\*\*/g, '$1');
  out = out.replace(/[*_~]{1,3}/g, ' ');
  out = out.replace(/[✓✗⚠❌✅⏳→←↑↓•·]/g, ' ');

  // Markdown links: keep the label, drop the target.
  out = out.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');

  const tidied = tidyFragments(
    out
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{2,}/g, '\n')
      .trim(),
  );

  // An answer that was ENTIRELY unspeakable stays silent. Announcing "a code
  // block." and nothing else is noise: there is no outcome in it, and the
  // whole feature exists to say whether something worked.
  //
  // Done by subtraction, not by one big alternation regex: `(?:a|b|\w+)*`
  // over a long phrase list backtracks catastrophically and hangs the hook.
  let residue = tidied;
  for (const phrase of ALL_REFERENCES) {
    residue = residue.split(phrase).join(' ');
  }
  residue = residue.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return residue ? tidied : '';
}

/**
 * Function words that are left stranded when the thing they introduced is
 * removed. Both languages the word lists already cover.
 */
const STRANDED = ['in', 'at', 'to', 'from', 'for', 'on', 'with', 'en', 'de', 'para', 'con', 'por'];

/**
 * Repair the grammatical stumps that removal leaves behind.
 *
 * Deleting a path from "escribí el módulo en C:\\... y lo conecté" leaves
 * "escribí el módulo en y lo conecté", and a URL from "ver https://... para
 * el diff" leaves "ver para el diff". A listener hears both as a mistake.
 * Heard in the first real run of this feature, not predicted.
 *
 * A tidy-up, not a parser: it collapses a function word stranded against a
 * conjunction or a full stop. Anything it does not recognise is left alone,
 * because mangling a good sentence is worse than an awkward one.
 */
export function tidyFragments(text: string): string {
  const words = STRANDED.join('|');
  let out = text;
  // A preposition immediately before a conjunction: "in and", "en y".
  out = out.replace(new RegExp(`\\b(?:${words})\\s+(and|y|or|o)\\b`, 'gi'), '$1');
  // A preposition immediately before a full stop or comma.
  out = out.replace(new RegExp(`\\s\\b(?:${words})\\b\\s*([.,;])`, 'gi'), '$1');
  // "see for the diff" / "ver para el diff": verb, then stranded preposition.
  out = out.replace(/\b(see|ver|check|revisá|revisa)\s+(?:for|para|in|en|at|a)\b/gi, '$1');
  return out
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([.,;])/g, '$1')
    .trim();
}

/** Split prose into sentences, keeping their terminators. */
export function splitSentences(text: string): string[] {
  const parts: string[] = [];
  for (const block of text.split(/\n+/)) {
    const line = block.trim();
    if (!line) continue;
    // Split on sentence enders followed by whitespace, keeping the ender.
    const pieces = line.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [line];
    for (const piece of pieces) {
      const sentence = piece.trim();
      if (sentence) parts.push(sentence);
    }
  }
  return parts;
}

/**
 * Does the text contain this phrase as whole words?
 *
 * Substring matching is too loose for a word list: `moved` finds "moved on
 * to the next thing", which reports no action at all, and one false match
 * was enough to spend the budget on a filler sentence and drop the
 * question the user needed to hear. A word boundary escape is not usable
 * here because the lists carry accented Spanish, so the boundary is
 * written as "not a letter" instead.
 */
function containsPhrase(haystack: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}])${escaped}([^\\p{L}]|$)`, 'iu').test(haystack);
}

function scoreSentence(sentence: string, index: number, total: number): number {
  const lower = sentence.toLowerCase();
  let score = 0;

  // The opening sentence is almost always the outcome.
  if (index === 0) score += 6;
  else if (index === 1) score += 2;

  // So is the closing one, which tends to carry the hand-off.
  if (index === total - 1 && total > 2) score += 2;

  if (OUTCOME_WORDS.some((w) => containsPhrase(lower, w))) score += 4;
  if (ATTENTION_WORDS.some((w) => containsPhrase(lower, w))) score += 3;
  if (ACTION_WORDS.some((w) => containsPhrase(lower, w))) score += 3;
  // Believe a writer who says their own sentence does not matter.
  if (FILLER_WORDS.some((w) => containsPhrase(lower, w))) score -= 6;

  // Numbers usually mean counts, versions or measurements.
  if (/\d/.test(sentence)) score += 2;

  // A question is aimed at the listener and must survive.
  if (sentence.includes('?') || sentence.includes('¿')) score += 5;

  // Very short fragments are usually leftovers from stripping.
  if (sentence.length < 25) score -= 3;
  // Very long ones cost most of the budget for one idea.
  if (sentence.length > 220) score -= 2;

  return score;
}

export interface SummaryOptions {
  /** Character budget for the spoken result. */
  maxChars: number;
}

/**
 * Reduce a written answer to a spoken notification.
 *
 * Sentences are ranked, then the winners are re-emitted in their original
 * order: reordering by score would produce a summary that jumps around,
 * and the sequence is part of what makes it comprehensible.
 */
export function summariseForSpeech(text: string, opts: SummaryOptions): string {
  // The caller's budget is honoured exactly. Quietly raising a small one
  // would spend money the caller said not to spend, on an API billed per
  // character.
  const maxChars = Math.max(1, opts.maxChars);
  const cleaned = stripUnspeakable(text);
  if (!cleaned) return '';

  const collapsed = cleaned.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= maxChars) return collapsed;

  // One long sentence, or one that survived stripping: cut it at a word
  // boundary and mark it, so a listener hears that something was left out
  // rather than a notification that simply stops mid-word.
  const cutAtWord = (sentence: string): string => {
    // The ellipsis is part of the budget: a notification must not exceed
    // the number of characters it was told it could bill for.
    const window = sentence.slice(0, Math.max(1, maxChars - 1));
    const lastSpace = window.lastIndexOf(' ');
    // Only respect a word boundary that leaves most of the budget used;
    // otherwise a single long word would reduce the whole thing to nothing.
    const body = lastSpace > window.length * 0.5 ? window.slice(0, lastSpace) : window;
    return body.trim() + '…';
  };

  const sentences = splitSentences(cleaned);
  if (sentences.length <= 1) return cutAtWord(collapsed);

  const ranked = sentences
    .map((sentence, index) => ({
      sentence,
      index,
      score: scoreSentence(sentence, index, sentences.length),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const chosen: { sentence: string; index: number }[] = [];
  let used = 0;
  const take = (candidate: { sentence: string; index: number }): boolean => {
    if (chosen.some((c) => c.index === candidate.index)) return false;
    const cost = candidate.sentence.length + (chosen.length ? 1 : 0);
    if (used + cost > maxChars) return false;
    chosen.push({ sentence: candidate.sentence, index: candidate.index });
    used += cost;
    return true;
  };

  // A question is placed before anything competes for the budget.
  //
  // Ranking alone is not enough: the highest-scoring sentence can be long
  // enough to starve everything after it, and the one thing a listener who
  // walked away cannot afford to miss is that they are being asked
  // something. Found by listening -- the summary spoke the work and
  // swallowed "shall I publish?".
  for (const candidate of ranked) {
    if (candidate.sentence.includes('?') || candidate.sentence.includes('¿')) {
      take(candidate);
    }
  }

  for (const candidate of ranked) {
    take(candidate);
    if (used >= maxChars * 0.9) break;
  }

  // Nothing fit: the first sentence alone is longer than the budget.
  if (chosen.length === 0) return cutAtWord(sentences[0]!);

  return chosen
    .sort((a, b) => a.index - b.index)
    .map((c) => c.sentence)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
