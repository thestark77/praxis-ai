import { Command } from 'commander';

export function doctorCommand(): Command {
  return new Command('doctor')
    .description(
      'Diagnose the praxis installation: gentle-ai presence, engram MCP, firewall rules, marker integrity.',
    )
    .action(() => {
      console.log('praxis doctor — not yet implemented (scheduled for M1)');
      process.exit(0);
    });
}
