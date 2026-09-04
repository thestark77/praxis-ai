// Configuration for the optional Fish Audio voice layer.
//
// The contract is deliberately strict: speech happens only when a project
// asks for it *and* supplies a key. Two independent switches, both in the
// project's own `.env`:
//
//   PRAXIS_VOICE_ENABLED=true
//   FISH_AUDIO_API_KEY=<key>
//
// Either one missing means the whole feature is inert -- no network call,
// no audio, no error, no measurable cost. A harness whose job is containing
// irreversible actions has no business making surprise outbound requests
// because a stray environment variable leaked in from somewhere else, and
// nobody wants a machine that starts talking after an unrelated upgrade.
//
// The flag lives with the project rather than the user because the same
// person wants narration on a long build and silence in a shared office an
// hour later, and that is a per-checkout decision.

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export const ENABLED_KEY = 'PRAXIS_VOICE_ENABLED';
export const API_KEY = 'FISH_AUDIO_API_KEY';
export const VOICE_KEY = 'FISH_AUDIO_VOICE_ID';
export const MODEL_KEY = 'FISH_AUDIO_MODEL';
export const FORMAT_KEY = 'PRAXIS_VOICE_FORMAT';
export const MAX_CHARS_KEY = 'PRAXIS_VOICE_MAX_CHARS';
export const SPEED_KEY = 'PRAXIS_VOICE_SPEED';
export const EXPRESSIVENESS_KEY = 'PRAXIS_VOICE_EXPRESSIVENESS';
export const VOLUME_KEY = 'PRAXIS_VOICE_VOLUME';

/** Audio formats the Fish Audio `/v1/tts` endpoint accepts. */
export const FORMATS = ['mp3', 'wav', 'pcm', 'opus'] as const;
export type VoiceFormat = (typeof FORMATS)[number];

/** TTS models the endpoint's `model` header accepts. */
export const MODELS = ['s1', 's2-pro', 's2.1-pro', 's2.1-pro-free'] as const;
export type VoiceModel = (typeof MODELS)[number];

export interface VoiceConfig {
  enabled: boolean;
  apiKey: string | null;
  /** Voice model id from fish.audio. Absent means their default voice. */
  voiceId: string | null;
  model: VoiceModel;
  format: VoiceFormat;
  /**
   * Longest utterance to synthesise. Speech is a notification, not a
   * reading of the transcript: past a couple of sentences it stops being
   * useful and starts costing money per character.
   */
  maxChars: number;
  /**
   * Speaking rate, as Fish Audio's `prosody.speed` multiplier. 1 is the
   * voice's own pace; the API accepts 0.5 to 2.0 and rejects the rest, so
   * anything outside that is clamped rather than sent and refused.
   */
  speed: number;
  /**
   * Expressiveness, as the API's `temperature`. Higher is more varied,
   * lower more consistent. Range 0 to 1.
   */
  expressiveness: number;
  /** Volume adjustment in decibels. 0 leaves the clip as generated. */
  volume: number;
  /** Where the values came from, for `praxis voice status` to report. */
  envFile: string | null;
  /** Why the feature is off, when it is. */
  reason: string | null;
}

/**
 * Parse a `.env` file.
 *
 * Deliberately small: `KEY=value`, `#` comments, optional `export` prefix,
 * and matched surrounding quotes. It does not expand variables or resolve
 * references, because a config reader that evaluates its input is a way to
 * be surprised, and this one only ever needs to find two keys.
 */
export function parseEnv(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const withoutExport = line.startsWith('export ') ? line.slice(7).trim() : line;
    const eq = withoutExport.indexOf('=');
    if (eq <= 0) continue;
    const key = withoutExport.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = withoutExport.slice(eq + 1).trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote) && value.length > 1) {
      value = value.slice(1, -1);
    } else {
      // Strip a trailing comment only on unquoted values, so a `#` inside a
      // quoted key is never truncated.
      const hash = value.indexOf(' #');
      if (hash >= 0) value = value.slice(0, hash).trim();
    }
    out[key] = value;
  }
  return out;
}

/**
 * Walk up from `startDir` looking for a `.env`.
 *
 * Claude Code runs hooks from the session's working directory, which is
 * often a subdirectory of the repository. Stopping at the first directory
 * would mean the feature silently fails to switch on for anyone not sitting
 * in the project root.
 */
export async function findEnvFile(startDir: string): Promise<string | null> {
  let dir = resolve(startDir);
  for (let depth = 0; depth < 8; depth++) {
    const candidate = join(dir, '.env');
    try {
      await readFile(candidate, 'utf8');
      return candidate;
    } catch {
      // Not here; keep walking.
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function isTruthy(value: string | undefined): boolean {
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

/**
 * Read a number, clamped to the range the API documents.
 *
 * Clamping rather than passing through: Fish Audio rejects a speed of 3
 * with a 400, and a notification that fails because a config value was one
 * step too enthusiastic is a worse outcome than one that speaks slightly
 * slower than asked.
 */
function pickNumber(value: string | undefined, min: number, max: number, fallback: number): number {
  const parsed = Number.parseFloat((value ?? '').trim());
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function pickFormat(value: string | undefined): VoiceFormat {
  const v = (value ?? '').trim().toLowerCase() as VoiceFormat;
  return (FORMATS as readonly string[]).includes(v) ? v : 'mp3';
}

function pickModel(value: string | undefined): VoiceModel {
  const v = (value ?? '').trim() as VoiceModel;
  return (MODELS as readonly string[]).includes(v) ? v : 's2.1-pro';
}

export interface ResolveOptions {
  /** Directory to start the `.env` search from. Defaults to cwd. */
  cwd?: string;
  /**
   * Ambient environment. The project `.env` wins over it: the file is the
   * per-checkout decision, and an inherited variable should not be able to
   * switch on speech for a project that never asked.
   */
  env?: NodeJS.ProcessEnv;
}

/** Resolve the voice configuration, reporting why it is off when it is. */
export async function resolveVoiceConfig(opts: ResolveOptions = {}): Promise<VoiceConfig> {
  const cwd = opts.cwd ?? process.cwd();
  const ambient = opts.env ?? process.env;

  const envFile = await findEnvFile(cwd);
  let fromFile: Record<string, string> = {};
  if (envFile) {
    try {
      fromFile = parseEnv(await readFile(envFile, 'utf8'));
    } catch {
      fromFile = {};
    }
  }

  const read = (key: string): string | undefined => fromFile[key] ?? ambient[key];

  const enabled = isTruthy(read(ENABLED_KEY));
  const apiKey = (read(API_KEY) ?? '').trim() || null;

  let reason: string | null = null;
  if (!enabled && !apiKey) reason = `${ENABLED_KEY} is not set and no ${API_KEY} was found`;
  else if (!enabled) reason = `${ENABLED_KEY} is not set to true`;
  else if (!apiKey) reason = `${ENABLED_KEY} is on but ${API_KEY} is missing`;

  const rawMax = Number.parseInt(read(MAX_CHARS_KEY) ?? '', 10);

  return {
    enabled: enabled && apiKey !== null,
    apiKey,
    voiceId: (read(VOICE_KEY) ?? '').trim() || null,
    model: pickModel(read(MODEL_KEY)),
    format: pickFormat(read(FORMAT_KEY)),
    maxChars: Number.isFinite(rawMax) && rawMax > 0 ? Math.min(rawMax, 2000) : 350,
    speed: pickNumber(read(SPEED_KEY), 0.5, 2, 1),
    expressiveness: pickNumber(read(EXPRESSIVENESS_KEY), 0, 1, 0.7),
    volume: pickNumber(read(VOLUME_KEY), -20, 20, 0),
    envFile,
    reason,
  };
}
