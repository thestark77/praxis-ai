// praxis-ai voice hook binary.
//
// Runs on Claude Code's `Stop` event and speaks a short notification when
// the project has switched voice on. Reads the hook payload from stdin like
// every other Claude Code hook.
//
// It exits 0 unconditionally and prints nothing to stdout. A Stop hook that
// writes to stdout or fails loudly would interfere with the session, and no
// text-to-speech feature is worth that: if the key is wrong or the speaker
// is missing, the correct outcome is silence, and `praxis voice test` is
// where a user goes to find out why.

import { resolveVoiceConfig } from '../lib/voice/config.js';
import { speak } from '../lib/voice/speak.js';

interface StopHookInput {
  cwd?: string;
  transcript_path?: string;
  /** Claude Code sets this when the stop came from a hook, not the user. */
  stop_hook_active?: boolean;
}

async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    let settled = false;
    const done = (): void => {
      if (!settled) {
        settled = true;
        resolve(data);
      }
    };
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', done);
    process.stdin.on('error', done);
    // A hook that never receives stdin must not hang the session.
    setTimeout(done, 2000);
  });
}

/**
 * The last thing Claude said, pulled from the session transcript.
 *
 * The transcript is JSONL, one message per line. Reading it backwards for
 * the most recent assistant text is what makes the notification say
 * something about the work rather than a fixed chime.
 */
async function lastAssistantText(transcriptPath: string | undefined): Promise<string | null> {
  if (!transcriptPath) return null;
  try {
    const { readFile } = await import('node:fs/promises');
    const lines = (await readFile(transcriptPath, 'utf8')).split(/\r?\n/).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      let entry: unknown;
      try {
        entry = JSON.parse(lines[i]!);
      } catch {
        continue;
      }
      const record = entry as {
        type?: string;
        message?: { role?: string; content?: unknown };
      };
      const message = record.message;
      if (!message || message.role !== 'assistant') continue;

      const content = message.content;
      if (typeof content === 'string' && content.trim()) return content;
      if (Array.isArray(content)) {
        const text = content
          .filter((b): b is { type: string; text: string } => {
            const block = b as { type?: string; text?: unknown };
            return block.type === 'text' && typeof block.text === 'string';
          })
          .map((b) => b.text)
          .join(' ')
          .trim();
        if (text) return text;
      }
    }
  } catch {
    // No transcript, unreadable, or an unexpected shape: fall back below.
  }
  return null;
}

async function main(): Promise<void> {
  let input: StopHookInput = {};
  try {
    const raw = await readStdin();
    if (raw.trim()) input = JSON.parse(raw) as StopHookInput;
  } catch {
    // Malformed payload: still resolve config from cwd and carry on.
  }

  const cwd = input.cwd ?? process.cwd();

  // Resolve first and leave immediately when the feature is off. This is
  // the common path and it must cost nothing: no network, no file writes.
  const config = await resolveVoiceConfig({ cwd });
  if (!config.enabled) return;

  const text = (await lastAssistantText(input.transcript_path)) ?? 'Task complete.';
  await speak({ text, config, cwd });
}

main()
  .catch(() => undefined)
  .finally(() => process.exit(0));
