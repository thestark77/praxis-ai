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
  /**
   * Strings this player prints when it fails while still exiting 0.
   *
   * ffplay on a machine with no PCM device reports "audio open failed" and
   * returns success anyway, so a caller that trusts the exit code is told it
   * spoke when nothing came out. That is the hardest failure to notice,
   * because a working mute looks exactly the same.
   */
  failureMarkers?: string[];
}

/** What a player run reports back. Exit status alone is not enough. */
export interface RunOutcome {
  ok: boolean;
  stderr: string;
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
  // `-loglevel error` rather than `quiet`: the failure has to be readable for
  // failureMarkers to catch it, and errors alone are not noisy.
  const audioFailure = [
    'audio open failed',
    'No more combinations to try',
    'Failed to open file',
    'cannot open shared',
    'Connection refused',
  ];
  return [
    {
      command: 'ffplay',
      args: (f) => ['-nodisp', '-autoexit', '-loglevel', 'error', f],
      failureMarkers: audioFailure,
    },
    {
      command: 'mpv',
      args: (f) => ['--no-video', '--really-quiet', f],
      failureMarkers: audioFailure,
    },
    { command: 'paplay', args: (f) => [f], failureMarkers: audioFailure },
    { command: 'aplay', args: (f) => ['-q', f], failureMarkers: audioFailure },
  ];
}

export interface PlayResult {
  played: boolean;
  /** The command that produced the sound, or null when none could. */
  player: string | null;
  error: string | null;
}

function run(player: Player, file: string, timeoutMs: number): Promise<RunOutcome> {
  return new Promise((resolve) => {
    let child;
    let stderr = '';
    try {
      child = spawn(player.command, player.args(file), { stdio: ['ignore', 'ignore', 'pipe'] });
    } catch {
      resolve({ ok: false, stderr: '' });
      return;
    }
    child.stderr?.on('data', (chunk: Buffer) => {
      // Bounded: a player stuck in a loop must not fill memory.
      if (stderr.length < 4096) stderr += chunk.toString();
    });
    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: false, stderr });
    }, timeoutMs);
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ ok: false, stderr });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, stderr });
    });
  });
}

/** True when the player claimed success but said it could not reach a device. */
export function reportedSilentFailure(player: Player, stderr: string): boolean {
  if (!stderr) return false;
  const haystack = stderr.toLowerCase();
  return (player.failureMarkers ?? []).some((m) => haystack.includes(m.toLowerCase()));
}

export interface PlayOptions {
  audio: Buffer;
  format: VoiceFormat;
  platform?: string;
  /** Injectable for tests, so the suite never actually makes noise. */
  runner?: (player: Player, file: string, timeoutMs: number) => Promise<RunOutcome>;
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

    let silent: string | null = null;
    for (const candidate of candidates) {
      const outcome = await runner(candidate, file, timeoutMs);
      if (!outcome.ok) continue;
      if (reportedSilentFailure(candidate, outcome.stderr)) {
        // Exit 0 and no sound. Keep going rather than claim success.
        silent = candidate.command;
        continue;
      }
      return { played: true, player: candidate.command, error: null };
    }
    const tried = candidates.map((c) => c.command).join(', ');
    return {
      played: false,
      player: null,
      error: silent
        ? `${silent} exited successfully but could not open an audio device; tried ${tried}`
        : `no audio player worked; tried ${tried}`,
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
