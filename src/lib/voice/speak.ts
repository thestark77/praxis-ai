// Say one thing out loud, if and only if the project asked for it.
//
// This is the single entry point the hook and the CLI share, so there is
// one place where "is this switched on?" is answered and one place that can
// fail. It resolves configuration, synthesises, plays, and reports what
// happened -- and returns a skipped result rather than throwing when the
// feature is off, because being off is the normal case.

import { resolveVoiceConfig, type ResolveOptions, type VoiceConfig } from './config.js';
import { synthesize } from './fish-audio.js';
import { play } from './play.js';
import { trimForSpeech } from './fish-audio.js';
import { splitSentences } from './summarise.js';

/**
 * Roughly one breath of speech per request.
 *
 * Fish Audio renders a whole utterance before answering, so time-to-first-word
 * tracks the LENGTH of the request, not the length of the answer. Asking for
 * the whole thing at once means the listener waits through the rendering of
 * material they will not hear for another minute -- measured at about forty
 * seconds of silence on a real turn.
 *
 * Small enough that the first chunk renders quickly, large enough that the
 * seams fall on sentence boundaries and the delivery still sounds continuous.
 */
const CHUNK_CHARS = 320;

/**
 * Split on sentence boundaries, packing up to CHUNK_CHARS per chunk.
 *
 * Never mid-sentence: a seam inside a clause is audible as a stumble, and the
 * engine loses the prosody it was going to give the whole phrase.
 */
export function chunkForSpeech(text: string, maxChars: number = CHUNK_CHARS): string[] {
  const sentences = splitSentences(text);
  if (sentences.length <= 1) return text.trim() ? [text.trim()] : [];

  const chunks: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (current && candidate.length > maxChars) {
      chunks.push(current);
      current = sentence;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export interface SpeakResult {
  /** True when audio actually reached a speaker. */
  spoke: boolean;
  /** True when the feature is off; not a failure. */
  skipped: boolean;
  reason: string | null;
  player: string | null;
  bytes: number;
  config: VoiceConfig;
}

export interface SpeakOptions extends ResolveOptions {
  text: string;
  /** Resolve configuration once and reuse it. */
  config?: VoiceConfig;
  fetchImpl?: typeof fetch;
  /** Skip playback and report the synthesis only. */
  synthesizeOnly?: boolean;
  platform?: string;
  runner?: Parameters<typeof play>[0]['runner'];
}

export async function speak(opts: SpeakOptions): Promise<SpeakResult> {
  const config = opts.config ?? (await resolveVoiceConfig(opts));
  const base = { spoke: false, skipped: false, player: null, bytes: 0, config };

  if (!config.enabled) {
    return { ...base, skipped: true, reason: config.reason ?? 'voice is disabled' };
  }

  // Clean FIRST, split second. Chunking arrived after stripping and put itself
  // in front of it: splitting raw markdown breaks a URL at its own full stops
  // -- "github.com", ".ps1" -- and the halves no longer match the pattern that
  // would have removed them, so most of a link was read out loud.
  const spoken = trimForSpeech(opts.text, config.maxChars);
  if (!spoken) {
    return { ...base, reason: 'nothing speakable was left after stripping' };
  }

  const chunks = opts.synthesizeOnly ? [spoken] : chunkForSpeech(spoken);
  const render = (text: string) =>
    synthesize({ config, text, fetchImpl: opts.fetchImpl, preformatted: true });

  // Render the next chunk WHILE the current one is playing. Without the
  // one-ahead, chunking would only move the waiting around; with it, every
  // gap after the first is hidden behind audio the listener is already hearing.
  let pending = render(chunks[0] ?? spoken);
  let spoke = false;
  let bytes = 0;
  let player: string | null = null;
  let reason: string | null = null;

  for (let i = 0; i < chunks.length; i++) {
    const synth = await pending;
    pending = i + 1 < chunks.length ? render(chunks[i + 1]!) : Promise.resolve(synth);

    if (!synth.ok || !synth.audio) {
      // Report the first failure and stop. Ploughing on would leave a hole in
      // the middle of a sentence the listener is still following.
      reason = reason ?? synth.error;
      break;
    }
    bytes += synth.audio.length;

    if (opts.synthesizeOnly) {
      return { ...base, spoke: false, reason: null, bytes };
    }

    const played = await play({
      audio: synth.audio,
      format: config.format,
      platform: opts.platform,
      runner: opts.runner,
    });
    if (played.played) {
      spoke = true;
      player = played.player;
    } else {
      reason = reason ?? played.error;
      break;
    }
  }

  // A chunk that never rendered leaves an unawaited promise behind, and an
  // unhandled rejection would take the process down after the answer was
  // already spoken.
  void pending.catch(() => undefined);

  return { ...base, spoke, reason, player, bytes };
}
