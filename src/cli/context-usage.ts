import { Command } from 'commander';

export function contextUsageCommand(): Command {
  return new Command('context-usage')
    .description(
      'Show the current CLAUDE.md context budget breakdown by source (gentle-ai blocks, praxis blocks, skills, engram-injected).',
    )
    .action(() => {
      console.log('praxis context-usage — not yet implemented (scheduled for M4)');
      process.exit(0);
    });
}
