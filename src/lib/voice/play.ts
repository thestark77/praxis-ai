// Play a synthesised clip using whatever the operating system already has.
//
// praxis will not add an audio dependency for a feature most installs never
// switch on: a native module would have to build on every machine, and the
// one it fails on would be someone who never wanted speech. Every supported
// platform ships something that plays a file from the command line.
//
// Nothing here throws. Audio that cannot be played is a disappointment; a
// Claude Code session that dies because a speaker is missing is a fault.

import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { VoiceFormat } from './config.js';

export interface Player {
  command: string;
  args: (file: string) => string[];
}

/**
 * Candidate players in preference order for this platform.
 *
 * macOS `afplay` and Windows PowerShell are always present. Linux has no
 * single answer, so several are tried; `ffplay` is listed because a
 * developer machine very often has ffmpeg already.
 */
export function playersFor(platform: string = process.platform): Player[] {
  if (platform === 'darwin') {
    return [{ command: 'afplay', args: (f) => [f] }];
  }
  if (platform === 'win32') {
    return [
      {
        // WPF's MediaPlayer, because it reports the clip's real duration.
        //
        // The obvious choice, the WMPlayer COM object, was tried first and
        // reported success while producing silence: 300ms after `play()` it
        // is in state 9 (Transitioning), never 3 (Playing), so a
        // `while (playState -eq 3)` wait falls straight through and
        // `close()` kills the clip before a sound leaves it. Waiting for
        // state 3 does not help either -- on a non-interactive session it
        // never arrives at all, even after ten seconds.
        //
        // MediaPlayer avoids the state machine entirely: open the file,
        // read NaturalDuration, sleep exactly that long. If the duration
        // never arrives the file could not be decoded, and that exits
        // non-zero so the caller can try the next player instead of
        // claiming to have spoken.
        command: 'powershell',
        args: (f) => [
          '-NoProfile',
          '-Command',
          [
            'Add-Type -AssemblyName PresentationCore;',
            '$mp = New-Object System.Windows.Media.MediaPlayer;',
            `$mp.Open([uri]'${f.replace(/'/g, "''")}');`,
            '$t = 0;',
            'while (-not $mp.NaturalDuration.HasTimeSpan -and $t -lt 50) {',
            '  Start-Sleep -Milliseconds 100; $t++ };',
            'if (-not $mp.NaturalDuration.HasTimeSpan) { exit 1 };',
            '$d = [int]$mp.NaturalDuration.TimeSpan.TotalMilliseconds;',
            '$mp.Play();',
            'Start-Sleep -Milliseconds ($d + 400);',
            '$mp.Close()',
          ].join(' '),
        ],
      },
    ];
  }
  return [
    { command: 'ffplay', args: (f) => ['-nodisp', '-autoexit', '-loglevel', 'quiet', f] },
    { command: 'mpv', args: (f) => ['--no-video', '--really-quiet', f] },
    { command: 'paplay', args: (f) => [f] },
    { command: 'aplay', args: (f) => ['-q', f] },
  ];
}

export interface PlayResult {
  played: boolean;
  /** The command that produced the sound, or null when none could. */
  player: string | null;
  error: string | null;
}

function run(player: Player, file: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(player.command, player.args(file), { stdio: 'ignore' });
    } catch {
      resolve(false);
      return;
    }
    const timer = setTimeout(() => {
      child.kill();
      resolve(false);
    }, timeoutMs);
    child.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

export interface PlayOptions {
  audio: Buffer;
  format: VoiceFormat;
  platform?: string;
  /** Injectable for tests, so the suite never actually makes noise. */
  runner?: (player: Player, file: string, timeoutMs: number) => Promise<boolean>;
  timeoutMs?: number;
}

/** Write the clip to a temporary file and play it, then clean up. */
export async function play(opts: PlayOptions): Promise<PlayResult> {
  const runner = opts.runner ?? run;
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const candidates = playersFor(opts.platform);
  if (candidates.length === 0) {
    return { played: false, player: null, error: 'no audio player is known for this platform' };
  }

  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), 'praxis-voice-'));
    const file = join(dir, `speech.${opts.format}`);
    await writeFile(file, opts.audio);

    for (const candidate of candidates) {
      if (await runner(candidate, file, timeoutMs)) {
        return { played: true, player: candidate.command, error: null };
      }
    }
    return {
      played: false,
      player: null,
      error: `no audio player worked; tried ${candidates.map((c) => c.command).join(', ')}`,
    };
  } catch (err) {
    return {
      played: false,
      player: null,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
