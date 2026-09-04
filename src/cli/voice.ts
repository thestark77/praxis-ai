import { Command } from 'commander';
import { readFile, writeFile, chmod } from 'node:fs/promises';
import { resolvePaths } from '../lib/paths.js';
import { readSettings, writeSettings } from '../lib/settings-patcher.js';
import {
  resolveVoiceConfig,
  ENABLED_KEY,
  API_KEY,
  VOICE_KEY,
  MODEL_KEY,
  FORMAT_KEY,
} from '../lib/voice/config.js';
import { speak } from '../lib/voice/speak.js';
import { summariseForSpeech } from '../lib/voice/summarise.js';
import { playersFor } from '../lib/voice/play.js';
import {
  addPraxisVoiceHook,
  removePraxisVoiceHook,
  hasPraxisVoiceHook,
} from '../lib/voice/hook.js';
import { resolveVoiceHookCommand } from '../lib/voice/resolve-hook-command.js';

function reportConfig(config: Awaited<ReturnType<typeof resolveVoiceConfig>>): void {
  console.log(`    enabled:   ${config.enabled}`);
  console.log(`    .env:      ${config.envFile ?? '(none found)'}`);
  console.log(`    api key:   ${config.apiKey ? 'present' : 'missing'}`);
  console.log(`    voice id:  ${config.voiceId ?? '(Fish Audio default voice)'}`);
  console.log(`    model:     ${config.model}`);
  console.log(`    format:    ${config.format}`);
  console.log(`    max chars: ${config.maxChars}`);
  if (config.reason) console.log(`    reason:    ${config.reason}`);
}

export function voiceCommand(): Command {
  const command = new Command('voice').description(
    'Optional spoken notifications through Fish Audio. Off unless a project asks for it.',
  );

  command
    .command('status', { isDefault: true })
    .description('Report whether voice is on for this project, and why not when it is off.')
    .action(async () => {
      console.log('praxis voice status');
      console.log('');
      console.log('  configuration');
      const config = await resolveVoiceConfig();
      reportConfig(config);

      const paths = resolvePaths();
      const settings = await readSettings(paths.settingsJson);
      console.log('');
      console.log(`  Stop hook registered: ${hasPraxisVoiceHook(settings)}`);
      console.log(
        `  audio players tried:  ${playersFor()
          .map((p) => p.command)
          .join(', ')}`,
      );

      console.log('');
      if (config.enabled) {
        console.log('  status: ✓ voice is on for this project');
      } else {
        console.log('  status: voice is off — praxis behaves exactly as it does without it');
        console.log('');
        console.log(`  To switch it on, add to this project's .env:`);
        console.log(`      ${ENABLED_KEY}=true`);
        console.log(`      ${API_KEY}=<your key from fish.audio/app/api-keys>`);
      }
      process.exit(0);
    });

  command
    .command('install')
    .description('Register the Stop hook so finished turns are spoken when enabled.')
    .action(async () => {
      const paths = resolvePaths();
      const hookCommand = await resolveVoiceHookCommand();
      const before = await readSettings(paths.settingsJson);
      await writeSettings(paths.settingsJson, addPraxisVoiceHook(before, hookCommand));
      console.log('praxis voice install');
      console.log(`  Stop hook registered: ${hookCommand}`);
      console.log('');
      console.log('  The hook stays inert until a project sets both');
      console.log(`  ${ENABLED_KEY}=true and ${API_KEY} in its .env.`);
      process.exit(0);
    });

  command
    .command('uninstall')
    .description('Remove the Stop hook. Other hooks are left alone.')
    .action(async () => {
      const paths = resolvePaths();
      const before = await readSettings(paths.settingsJson);
      await writeSettings(paths.settingsJson, removePraxisVoiceHook(before));
      console.log('praxis voice uninstall');
      console.log('  Stop hook removed.');
      process.exit(0);
    });

  command
    .command('say [text...]')
    .description('Speak one line now. Reports why nothing happened when it does not.')
    .option('--dry-run', 'synthesise without playing, to check the key and the network')
    .action(async (parts: string[], opts: { dryRun?: boolean }) => {
      const text = (parts ?? []).join(' ').trim() || 'praxis voice check.';
      const result = await speak({ text, synthesizeOnly: opts.dryRun });

      console.log('praxis voice say');
      // Show what will actually be spoken, not what was passed in. A long
      // answer is summarised before synthesis, and seeing the difference is
      // how someone tunes PRAXIS_VOICE_MAX_CHARS to their taste.
      const spoken = summariseForSpeech(text, { maxChars: result.config.maxChars });
      if (spoken && spoken !== text) {
        console.log(`  given:  ${text.length} chars`);
        console.log(`  spoken: ${spoken}`);
      } else {
        console.log(`  text: ${text}`);
      }
      if (result.skipped) {
        console.log(`  skipped: ${result.reason}`);
        console.log('');
        console.log('  status: voice is off for this project');
        process.exit(0);
      }
      if (result.reason && !result.spoke && !result.bytes) {
        console.log(`  error: ${result.reason}`);
        console.log('');
        console.log('  status: ✗ nothing was spoken');
        process.exit(1);
      }
      console.log(`  synthesised: ${result.bytes} bytes (${result.config.format})`);
      if (opts.dryRun) {
        console.log('');
        console.log('  status: ✓ Fish Audio answered; playback skipped (--dry-run)');
        process.exit(0);
      }
      if (!result.spoke) {
        console.log(`  playback: ${result.reason}`);
        console.log('');
        console.log('  status: ⚠ audio was produced but no player could run it');
        process.exit(1);
      }
      console.log(`  played with: ${result.player}`);
      console.log('');
      console.log('  status: ✓ spoken');
      process.exit(0);
    });

  command
    .command('scaffold')
    .description("Append the voice keys to this project's .env, commented out.")
    .action(async () => {
      const target = '.env';
      let existing = '';
      try {
        existing = await readFile(target, 'utf8');
      } catch {
        existing = '';
      }
      if (existing.includes(ENABLED_KEY)) {
        console.log(`praxis voice scaffold`);
        console.log(`  ${target} already mentions ${ENABLED_KEY}; nothing written.`);
        process.exit(0);
      }
      const block = [
        '',
        '# --- praxis voice (optional spoken notifications via Fish Audio) ---',
        '# Both lines are required. Without them praxis behaves exactly as it',
        '# does today: no network call, no audio, no cost.',
        `# ${ENABLED_KEY}=true`,
        `# ${API_KEY}=`,
        '# Optional:',
        `# ${VOICE_KEY}=      # voice model id from fish.audio; omitted uses their default`,
        `# ${MODEL_KEY}=s2.1-pro   # s1 | s2-pro | s2.1-pro | s2.1-pro-free`,
        `# ${FORMAT_KEY}=mp3       # mp3 | wav | pcm | opus`,
        '',
      ].join('\n');
      await writeFile(target, existing + block, 'utf8');
      await chmod(target, 0o600).catch(() => undefined);
      console.log('praxis voice scaffold');
      console.log(`  appended the voice block to ${target}, commented out.`);
      console.log('  Uncomment both required lines and add your key to switch it on.');
      process.exit(0);
    });

  return command;
}
