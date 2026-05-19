import { Command } from 'commander';

export function statsCommand(): Command {
  return new Command('stats')
    .description(
      'Report on the local praxis telemetry: skill invocations, firewall events, grill suggestions, phase transitions.',
    )
    .option('--session', 'only the current session')
    .option('--skill <name>', 'filter by skill name')
    .option('--export <format>', 'export as csv or json')
    .action((_opts) => {
      console.log('praxis stats — not yet implemented (scheduled for M4)');
      process.exit(0);
    });
}
