import { Command } from 'commander';
import { resolvePaths } from '../lib/paths.js';
import { openDatabase, closeDatabase } from '../lib/telemetry/db.js';
import { statsSummary, resetEvents } from '../lib/telemetry/queries.js';

interface StatsOpts {
  json?: boolean;
  reset?: boolean;
}

export function statsCommand(): Command {
  return new Command('stats')
    .description(
      'Report on the local praxis telemetry: sessions, tool invocations, firewall denies, phase transitions, context samples.',
    )
    .option('--json', 'output the summary as JSON instead of a human-readable table')
    .option('--reset', 'truncate all telemetry events (asks for no confirmation; use carefully)')
    .action(async (opts: StatsOpts) => {
      const paths = resolvePaths();
      const db = await openDatabase({ path: paths.telemetryDb });
      try {
        if (opts.reset) {
          const { deleted } = resetEvents(db);
          console.log(`praxis stats — reset: ${deleted} events deleted`);
          process.exit(0);
        }

        const summary = statsSummary(db);
        if (opts.json) {
          console.log(JSON.stringify(summary, null, 2));
          process.exit(0);
        }

        console.log('praxis stats');
        console.log('');
        console.log(`  total events:        ${summary.totalEvents}`);
        if (summary.totalEvents === 0) {
          console.log('');
          console.log(
            '  No telemetry recorded yet. Praxis hooks land in M3+; until then the DB is empty.',
          );
          process.exit(0);
        }
        console.log(`  sessions:            ${summary.sessions}`);
        console.log(`  tool invocations:    ${summary.toolInvocations}`);
        if (Object.keys(summary.toolInvocationsByOutcome).length > 0) {
          for (const [outcome, count] of Object.entries(summary.toolInvocationsByOutcome)) {
            console.log(`    ${outcome.padEnd(18)} ${count}`);
          }
        }
        console.log(`  deny hits:           ${summary.denyHits}`);
        console.log(`  context samples:     ${summary.contextSamples}`);
        if (Object.keys(summary.phaseTransitionsByPhase).length > 0) {
          console.log('  phase transitions:');
          for (const [phase, count] of Object.entries(summary.phaseTransitionsByPhase)) {
            console.log(`    -> ${phase.padEnd(14)} ${count}`);
          }
        }
        if (summary.earliestEventAt && summary.latestEventAt) {
          console.log('');
          console.log(`  earliest: ${new Date(summary.earliestEventAt).toISOString()}`);
          console.log(`  latest:   ${new Date(summary.latestEventAt).toISOString()}`);
        }
        process.exit(0);
      } finally {
        closeDatabase(db);
      }
    });
}
