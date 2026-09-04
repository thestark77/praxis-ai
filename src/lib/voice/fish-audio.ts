// Fish Audio text-to-speech client.
//
// One endpoint, verified against their OpenAPI schema rather than guessed:
//
//   POST https://api.fish.audio/v1/tts
//   Authorization: Bearer <key>
//   model: s1 | s2-pro | s2.1-pro (default) | s2.1-pro-free
//   body:  { text, reference_id?, format, temperature, top_p, ... }
//   200:   the audio bytes themselves, chunked
//
// Errors come back as JSON with `status`, `message` and an optional
// `reason`; 401 is a bad key, 402 an empty wallet, 503 their load. Each is
// surfaced as itself, because "voice failed" tells a user nothing about
// whether to check their key or their balance.

import type { VoiceConfig } from './config.js';
import { summariseForSpeech } from './summarise.js';

export const FISH_AUDIO_TTS_URL = 'https://api.fish.audio/v1/tts';

export interface SynthesisResult {
  ok: boolean;
  audio: Buffer | null;
  /** Present when `ok` is false. Written for a human, not a log parser. */
  error: string | null;
  /** HTTP status, when a response was received at all. */
  status: number | null;
}

export interface SynthesizeOptions {
  config: VoiceConfig;
  text: string;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Abort the request after this many ms. Speech is never worth a hang. */
  timeoutMs?: number;
}

/**
 * Reduce an utterance to something worth listening to.
 *
 * Delegates to the summariser, which drops what cannot be spoken (code,
 * tables, paths, URLs) and then keeps the sentences carrying the outcome.
 * Blind truncation was the first version and it was wrong: a written answer
 * puts the detail in the middle, so cutting at a character count reliably
 * spoke the preamble and threw away the result.
 */
export function trimForSpeech(text: string, maxChars: number): string {
  const summary = summariseForSpeech(text, { maxChars });
  return summary || trimPlain(text, maxChars);
}

/** Last-resort trim for text the summariser reduced to nothing. */
function trimPlain(text: string, maxChars: number): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= maxChars) return collapsed;
  const window = collapsed.slice(0, maxChars);
  const lastStop = Math.max(
    window.lastIndexOf('. '),
    window.lastIndexOf('! '),
    window.lastIndexOf('? '),
  );
  // A complete sentence beats a truncated word, and it is worth giving up a
  // fair amount of the budget for one. The floor only guards against a
  // stray full stop near the very start reducing the whole notification to
  // two words.
  if (lastStop > maxChars * 0.3) return window.slice(0, lastStop + 1);
  const lastSpace = window.lastIndexOf(' ');
  return (lastSpace > 0 ? window.slice(0, lastSpace) : window) + '…';
}

function describeError(status: number, body: string): string {
  let detail = body.slice(0, 200);
  try {
    const parsed = JSON.parse(body) as { message?: string; reason?: string | null };
    detail = [parsed.message, parsed.reason].filter(Boolean).join(' — ') || detail;
  } catch {
    // Not JSON; the raw excerpt is the best available detail.
  }
  if (status === 401) return `Fish Audio rejected the API key (401). ${detail}`;
  if (status === 402) return `Fish Audio reports no credit on this account (402). ${detail}`;
  if (status === 429) return `Fish Audio is rate limiting this key (429). ${detail}`;
  if (status === 503) return `Fish Audio is overloaded (503); try again shortly. ${detail}`;
  return `Fish Audio returned ${status}. ${detail}`;
}

/**
 * Synthesise one utterance.
 *
 * Never throws: this is called from a hook that must not be able to break a
 * Claude Code session. Every failure -- network, timeout, bad key, empty
 * wallet -- comes back as `ok: false` with something a human can act on.
 */
export async function synthesize(opts: SynthesizeOptions): Promise<SynthesisResult> {
  const { config, text } = opts;
  const doFetch = opts.fetchImpl ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? 20_000;

  if (!config.enabled || !config.apiKey) {
    return { ok: false, audio: null, error: config.reason ?? 'voice is disabled', status: null };
  }
  const spoken = trimForSpeech(text, config.maxChars);
  if (!spoken) {
    return { ok: false, audio: null, error: 'nothing to say', status: null };
  }

  const body: Record<string, unknown> = { text: spoken, format: config.format };
  if (config.voiceId) body.reference_id = config.voiceId;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await doFetch(FISH_AUDIO_TTS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        model: config.model,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const raw = await res.text().catch(() => '');
      return { ok: false, audio: null, error: describeError(res.status, raw), status: res.status };
    }

    const audio = Buffer.from(await res.arrayBuffer());
    if (audio.length === 0) {
      return {
        ok: false,
        audio: null,
        error: 'Fish Audio returned an empty body',
        status: res.status,
      };
    }
    return { ok: true, audio, error: null, status: res.status };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    const message = aborted
      ? `Fish Audio did not respond within ${timeoutMs}ms`
      : err instanceof Error
        ? err.message
        : String(err);
    return { ok: false, audio: null, error: message, status: null };
  } finally {
    clearTimeout(timer);
  }
}
