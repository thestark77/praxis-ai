import { Command } from 'commander';

export function upgradeCommand(): Command {
  return new Command('upgrade')
    .description('Upgrade praxis to the latest published version.')
    .action(() => {
      console.log('praxis upgrade — not yet implemented (scheduled for v0.2)');
      process.exit(0);
    });
}
