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
 * Strip everything that cannot usefully be spoken.
 *
 * Order matters: fenced blocks go first so their contents cannot be
 * mistaken for prose, and decoration is stripped last so the earlier
 * patterns still see their markers.
 */
export function stripUnspeakable(text: string): string {
  let out = text;

  // Fenced code blocks, including unterminated ones at the end of a stream.
  out = out.replace(/```[\s\S]*?```/g, ' ');
  out = out.replace(/```[\s\S]*$/g, ' ');

  // Markdown tables: any line that is mostly pipes.
  out = out
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('|')) return true;
      return false;
    })
    .join('\n');

  // Table rule lines like |---|---|
  out = out.replace(/^[\s|:-]+$/gm, ' ');

  // URLs and bare hosts.
  out = out.replace(/https?:\/\/\S+/g, ' ');
  out = out.replace(/\b[\w.-]+\.(com|org|net|io|dev|ai|sh)\b\S*/g, ' ');

  // Absolute and deep relative paths: forty syllables of separators.
  out = out.replace(/[A-Za-z]:\\[^\s'"`]+/g, ' ');
  out = out.replace(/(?:^|\s)(?:~|\.{1,2})?\/[^\s'"`]{6,}/g, ' ');

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

  return tidyFragments(
    out
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{2,}/g, '\n')
      .trim(),
  );
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
