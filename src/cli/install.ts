import { Command } from 'commander';

export function installCommand(): Command {
  return new Command('install')
    .description(
      'Install praxis overlay into ~/.claude/. Detects gentle-ai and adapts (overlay or standalone mode).',
    )
    .option('--dry-run', 'preview changes without writing')
    .action((_opts) => {
      console.log('praxis install — not yet implemented (scheduled for M1)');
      process.exit(0);
    });
}
