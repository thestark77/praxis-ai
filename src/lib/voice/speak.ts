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

  const synth = await synthesize({ config, text: opts.text, fetchImpl: opts.fetchImpl });
  if (!synth.ok || !synth.audio) {
    return { ...base, reason: synth.error };
  }
  if (opts.synthesizeOnly) {
    return { ...base, spoke: false, reason: null, bytes: synth.audio.length };
  }

  const played = await play({
    audio: synth.audio,
    format: config.format,
    platform: opts.platform,
    runner: opts.runner,
  });

  return {
    ...base,
    spoke: played.played,
    reason: played.error,
    player: played.player,
    bytes: synth.audio.length,
  };
}
