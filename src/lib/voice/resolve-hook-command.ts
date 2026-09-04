// Resolve the command Claude Code should run for the voice Stop hook.
//
// Same reasoning as the AST hook's resolver, and the same two traps: the
// path is quoted because Claude Code runs the command through a shell and a
// space would otherwise split it into arguments, and it resolves to this
// package's own bin rather than trusting PATH, because inside WSL the
// Windows npm global directory comes first and a bare name runs the wrong
// binary.

import { stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_VOICE_HOOK_COMMAND = 'praxis-voice-hook';

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

export async function resolveVoiceHookCommand(): Promise<string> {
  const script = process.argv[1];
  if (script) {
    const sibling = resolve(dirname(script), 'praxis-voice-hook.js');
    if (await isFile(sibling)) return `node "${sibling}"`;
  }

  try {
    const here = dirname(fileURLToPath(import.meta.url));
    for (const candidate of [
      resolve(here, '..', 'bin', 'praxis-voice-hook.js'),
      resolve(here, '..', '..', 'bin', 'praxis-voice-hook.js'),
    ]) {
      if (await isFile(candidate)) return `node "${candidate}"`;
    }
  } catch {
    // import.meta.url unavailable under some bundlers; fall through.
  }

  return DEFAULT_VOICE_HOOK_COMMAND;
}
