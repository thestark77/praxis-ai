import { Command } from 'commander';

export function rollbackCommand(): Command {
  return new Command('rollback')
    .description('Restore CLAUDE.md and settings.json from the most recent praxis backup.')
    .option('--list', 'show available backups without restoring')
    .option('--to <timestamp>', 'restore a specific backup by timestamp')
    .action((_opts) => {
      console.log('praxis rollback — not yet implemented (scheduled for M1)');
      process.exit(0);
    });
}
