import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseEnv,
  findEnvFile,
  resolveVoiceConfig,
  ENABLED_KEY,
  API_KEY,
  VOICE_KEY,
  MODEL_KEY,
  FORMAT_KEY,
  MAX_CHARS_KEY,
} from '../../src/lib/voice/config.js';
import { synthesize, trimForSpeech, FISH_AUDIO_TTS_URL } from '../../src/lib/voice/fish-audio.js';
import { playersFor, play } from '../../src/lib/voice/play.js';
import { speak } from '../../src/lib/voice/speak.js';
import {
  addPraxisVoiceHook,
  removePraxisVoiceHook,
  hasPraxisVoiceHook,
  PRAXIS_VOICE_HOOK_MARKER,
} from '../../src/lib/voice/hook.js';

async function projectWith(env: string | null): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'praxis-voice-'));
  if (env !== null) await writeFile(join(dir, '.env'), env, 'utf8');
  return dir;
}

const KEY_LINE = `${API_KEY}=fk_test_123`;

describe('the off switch', () => {
  // The whole contract: speech happens only when a project asks for it AND
  // supplies a key. Anything less must cost nothing -- no network, no audio,
  // no error -- because most installs will never switch this on.
  it('is off when there is no .env at all', async () => {
    const config = await resolveVoiceConfig({ cwd: await projectWith(null), env: {} });
    expect(config.enabled).toBe(false);
    expect(config.reason).toContain(ENABLED_KEY);
  });

  it('is off with a key but no flag', async () => {
    const config = await resolveVoiceConfig({ cwd: await projectWith(KEY_LINE), env: {} });
    expect(config.enabled).toBe(false);
    expect(config.reason).toContain(`${ENABLED_KEY} is not set to true`);
  });

  it('is off with the flag but no key', async () => {
    const config = await resolveVoiceConfig({
      cwd: await projectWith(`${ENABLED_KEY}=true`),
      env: {},
    });
    expect(config.enabled).toBe(false);
    expect(config.reason).toContain(`${API_KEY} is missing`);
  });

  it('is on only when both are present', async () => {
    const config = await resolveVoiceConfig({
      cwd: await projectWith(`${ENABLED_KEY}=true\n${KEY_LINE}`),
      env: {},
    });
    expect(config.enabled).toBe(true);
    expect(config.apiKey).toBe('fk_test_123');
    expect(config.reason).toBeNull();
  });

  it('makes no network call when it is off', async () => {
    // The strongest form of "praxis behaves exactly as it does without it".
    let called = false;
    const result = await speak({
      text: 'should never be spoken',
      cwd: await projectWith(KEY_LINE),
      env: {},
      fetchImpl: (async () => {
        called = true;
        return new Response('', { status: 200 });
      }) as unknown as typeof fetch,
    });
    expect(called).toBe(false);
    expect(result.skipped).toBe(true);
    expect(result.spoke).toBe(false);
  });

  it('does not let an ambient variable switch on a project that never asked', async () => {
    // Turning on speech for an unrelated checkout because a variable leaked
    // in from another shell would be a surprise, and this feature makes
    // noise on someone's speakers.
    const config = await resolveVoiceConfig({
      cwd: await projectWith(`${ENABLED_KEY}=false`),
      env: { [ENABLED_KEY]: 'true', [API_KEY]: 'fk_ambient' },
    });
    expect(config.enabled).toBe(false);
  });

  it('accepts the ambient environment when the file says nothing', async () => {
    const config = await resolveVoiceConfig({
      cwd: await projectWith(null),
      env: { [ENABLED_KEY]: 'true', [API_KEY]: 'fk_ambient' },
    });
    expect(config.enabled).toBe(true);
  });
});

describe('parsing .env', () => {
  it('reads a plain assignment', () => {
    expect(parseEnv('A=1')).toEqual({ A: '1' });
  });

  it('ignores comments and blank lines', () => {
    expect(parseEnv('# note\n\nA=1\n')).toEqual({ A: '1' });
  });

  it('accepts an export prefix', () => {
    expect(parseEnv('export A=1')).toEqual({ A: '1' });
  });

  it('strips matched quotes', () => {
    expect(parseEnv(`A="one two"\nB='three'`)).toEqual({ A: 'one two', B: 'three' });
  });

  it('keeps a # that is inside a quoted value', () => {
    // API keys contain punctuation; truncating one at a `#` would produce a
    // 401 that looks like a bad key rather than a bad parser.
    expect(parseEnv(`A="secret#123"`)).toEqual({ A: 'secret#123' });
  });

  it('drops a trailing comment on an unquoted value', () => {
    expect(parseEnv('A=1 # note')).toEqual({ A: '1' });
  });

  it('keeps an = inside the value', () => {
    expect(parseEnv('A=a=b')).toEqual({ A: 'a=b' });
  });

  it('skips malformed keys rather than guessing', () => {
    expect(parseEnv('9BAD=1\n=orphan\nGOOD=2')).toEqual({ GOOD: '2' });
  });
});

describe('finding the .env', () => {
  it('finds one in a parent directory', async () => {
    // Claude Code runs hooks from the session cwd, often a subdirectory.
    const root = await projectWith(`${ENABLED_KEY}=true\n${KEY_LINE}`);
    const nested = join(root, 'src', 'deep');
    await mkdir(nested, { recursive: true });
    expect(await findEnvFile(nested)).toBe(join(root, '.env'));
    expect((await resolveVoiceConfig({ cwd: nested, env: {} })).enabled).toBe(true);
  });

  it('returns null when there is none', async () => {
    expect(await findEnvFile(await projectWith(null))).toBeNull();
  });
});

describe('optional settings', () => {
  it('falls back to safe defaults for unknown values', async () => {
    const config = await resolveVoiceConfig({
      cwd: await projectWith(
        `${ENABLED_KEY}=true\n${KEY_LINE}\n${MODEL_KEY}=nonsense\n${FORMAT_KEY}=flac`,
      ),
      env: {},
    });
    expect(config.model).toBe('s2.1-pro');
    expect(config.format).toBe('mp3');
  });

  it('accepts the documented models and formats', async () => {
    const config = await resolveVoiceConfig({
      cwd: await projectWith(
        `${ENABLED_KEY}=true\n${KEY_LINE}\n${MODEL_KEY}=s2.1-pro-free\n${FORMAT_KEY}=opus\n${VOICE_KEY}=abc123`,
      ),
      env: {},
    });
    expect(config.model).toBe('s2.1-pro-free');
    expect(config.format).toBe('opus');
    expect(config.voiceId).toBe('abc123');
  });

  it('caps maxChars so one turn cannot bill for a novel', async () => {
    const config = await resolveVoiceConfig({
      cwd: await projectWith(`${ENABLED_KEY}=true\n${KEY_LINE}\n${MAX_CHARS_KEY}=999999`),
      env: {},
    });
    expect(config.maxChars).toBe(2000);
  });
});

describe('trimming an utterance', () => {
  it('leaves a short line alone', () => {
    expect(trimForSpeech('  Done.  ', 100)).toBe('Done.');
  });

  it('collapses whitespace', () => {
    expect(trimForSpeech('a\n\n  b', 100)).toBe('a b');
  });

  it('cuts at a sentence boundary when there is one', () => {
    const text = 'First sentence here. Second sentence that runs past the limit entirely.';
    const out = trimForSpeech(text, 40);
    expect(out).toBe('First sentence here.');
  });

  it('cuts at a word boundary when there is no sentence', () => {
    const out = trimForSpeech('alpha bravo charlie delta echo foxtrot', 20);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(21);
  });
});

describe('calling Fish Audio', () => {
  const enabledConfig = async () =>
    resolveVoiceConfig({
      cwd: await projectWith(`${ENABLED_KEY}=true\n${KEY_LINE}\n${VOICE_KEY}=voice-9`),
      env: {},
    });

  it('posts the documented shape', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const config = await enabledConfig();
    const result = await synthesize({
      config,
      text: 'hello',
      fetchImpl: (async (url: string, init: RequestInit) => {
        seen = { url, init };
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      }) as unknown as typeof fetch,
    });

    expect(result.ok).toBe(true);
    expect(result.audio?.length).toBe(3);
    expect(seen!.url).toBe(FISH_AUDIO_TTS_URL);
    const headers = seen!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer fk_test_123');
    expect(headers.model).toBe('s2.1-pro');
    const body = JSON.parse(seen!.init.body as string);
    expect(body).toEqual({ text: 'hello', format: 'mp3', reference_id: 'voice-9' });
  });

  it('omits reference_id when no voice is chosen', async () => {
    let body: Record<string, unknown> = {};
    const config = await resolveVoiceConfig({
      cwd: await projectWith(`${ENABLED_KEY}=true\n${KEY_LINE}`),
      env: {},
    });
    await synthesize({
      config,
      text: 'hi',
      fetchImpl: (async (_u: string, init: RequestInit) => {
        body = JSON.parse(init.body as string);
        return new Response(new Uint8Array([1]), { status: 200 });
      }) as unknown as typeof fetch,
    });
    expect('reference_id' in body).toBe(false);
  });

  it.each([
    [401, /rejected the API key/],
    [402, /no credit/],
    [429, /rate limiting/],
    [503, /overloaded/],
  ])('explains a %i so the user knows what to fix', async (status, pattern) => {
    // "voice failed" tells nobody whether to check their key or their balance.
    const config = await enabledConfig();
    const result = await synthesize({
      config,
      text: 'hi',
      fetchImpl: (async () =>
        new Response(JSON.stringify({ status, message: 'nope' }), {
          status,
        })) as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(pattern);
    expect(result.status).toBe(status);
  });

  it('never throws when the network fails', async () => {
    const config = await enabledConfig();
    const result = await synthesize({
      config,
      text: 'hi',
      fetchImpl: (async () => {
        throw new Error('ECONNREFUSED');
      }) as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');
  });

  it('reports an empty body rather than playing silence', async () => {
    const config = await enabledConfig();
    const result = await synthesize({
      config,
      text: 'hi',
      fetchImpl: (async () =>
        new Response(new Uint8Array([]), { status: 200 })) as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/empty body/);
  });
});

describe('playback', () => {
  it('knows a player for each supported platform', () => {
    expect(playersFor('darwin')[0]?.command).toBe('afplay');
    expect(playersFor('win32')[0]?.command).toBe('powershell');
    expect(playersFor('linux').map((p) => p.command)).toContain('ffplay');
  });

  it('falls through to the next player when one is missing', async () => {
    // A Linux box with no ffplay should still make a sound if it has aplay.
    const tried: string[] = [];
    const result = await play({
      audio: Buffer.from([1, 2, 3]),
      format: 'mp3',
      platform: 'linux',
      runner: async (player) => {
        tried.push(player.command);
        return player.command === 'aplay';
      },
    });
    expect(result.played).toBe(true);
    expect(result.player).toBe('aplay');
    expect(tried[0]).toBe('ffplay');
  });

  it('reports rather than throws when nothing can play', async () => {
    const result = await play({
      audio: Buffer.from([1]),
      format: 'mp3',
      platform: 'linux',
      runner: async () => false,
    });
    expect(result.played).toBe(false);
    expect(result.error).toMatch(/no audio player worked/);
  });
});

describe('the Stop hook registration', () => {
  it('adds and detects itself', () => {
    const settings = addPraxisVoiceHook({}, 'node "/x/praxis-voice-hook.js"');
    expect(hasPraxisVoiceHook(settings)).toBe(true);
    expect(JSON.stringify(settings)).toContain(PRAXIS_VOICE_HOOK_MARKER);
  });

  it('is idempotent', () => {
    const once = addPraxisVoiceHook({}, 'node "/x/h.js"');
    const twice = addPraxisVoiceHook(once, 'node "/x/h.js"');
    expect((twice.hooks?.Stop as unknown[]).length).toBe(1);
  });

  it('leaves a foreign Stop hook alone on the way in and out', () => {
    const foreign = {
      hooks: { Stop: [{ hooks: [{ type: 'command' as const, command: 'somebody-else.sh' }] }] },
    };
    const added = addPraxisVoiceHook(foreign, 'node "/x/h.js"');
    const removed = removePraxisVoiceHook(added);
    expect(JSON.stringify(removed)).toContain('somebody-else.sh');
    expect(hasPraxisVoiceHook(removed)).toBe(false);
  });

  it('removes the Stop key entirely when praxis was its only entry', () => {
    const added = addPraxisVoiceHook({}, 'node "/x/h.js"');
    expect(removePraxisVoiceHook(added).hooks?.Stop).toBeUndefined();
  });

  it('quotes the hook path', () => {
    // Same trap as the AST hook: unquoted, a path with a space is split
    // into arguments and the hook silently never runs.
    const settings = addPraxisVoiceHook({}, 'node "/Users/First Last/h.js"');
    const command = (settings.hooks?.Stop as { hooks: { command: string }[] }[])[0]!.hooks[0]!
      .command;
    expect(command).toContain('"/Users/First Last/h.js"');
  });
});
