import { Command } from 'commander';

export function uninstallCommand(): Command {
  return new Command('uninstall')
    .description('Remove praxis from ~/.claude/. Restores pre-install state from backup.')
    .option('--keep-backup', 'leave the most recent backup on disk')
    .action((_opts) => {
      console.log('praxis uninstall — not yet implemented (scheduled for M1)');
      process.exit(0);
    });
}
