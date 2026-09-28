import { Command } from 'commander';
import { resolvePaths } from '../lib/paths.js';
import { openDatabase, closeDatabase } from '../lib/telemetry/db.js';
import { latestContextSample } from '../lib/telemetry/queries.js';
import { recordContextSample } from '../lib/telemetry/events.js';

interface ContextUsageOpts {
  record?: string;
  budget?: string;
  json?: boolean;
}

// Praxis-ai balanced preset polls the user between 50% and 60% of effective
// context capacity at the next clean point (see templates/praxis-home/context-budget.md).
// Below the window: no notice. Inside it: poll-window notice. Above it: a
// past-window notice — poll at the next clean point, do not start new work
// before asking.
const POLL_WINDOW_START_PCT = 50;
const POLL_WINDOW_END_PCT = 60;

export function contextUsageCommand(): Command {
  return new Command('context-usage')
    .description(
      `Show the most recent context-usage sample and surface a poll-window notice between ${POLL_WINDOW_START_PCT}% and ${POLL_WINDOW_END_PCT}% of budget (past ${POLL_WINDOW_END_PCT}%, a past-window notice). Use --record to append a new sample.`,
    )
    .option('--record <used>', 'record a new context-usage sample (token count used)')
    .option(
      '--budget <budget>',
      'budget token count for the recorded sample (required with --record)',
    )
    .option('--json', 'output as JSON instead of a human-readable line')
    .action(async (opts: ContextUsageOpts) => {
      const paths = resolvePaths();
      const db = await openDatabase({ path: paths.telemetryDb });
      try {
        if (opts.record) {
          const used = Number.parseInt(opts.record, 10);
          const budget = Number.parseInt(opts.budget ?? '0', 10);
          if (!Number.isFinite(used) || used < 0) {
            console.error('praxis context-usage: --record must be a non-negative integer');
            process.exit(2);
          }
          if (!Number.isFinite(budget) || budget <= 0) {
            console.error('praxis context-usage: --budget must be a positive integer');
            process.exit(2);
          }
          recordContextSample(db, null, { used, budget });
          console.log(
            `praxis context-usage — recorded: ${used} / ${budget} (${((used / budget) * 100).toFixed(1)}%)`,
          );
          process.exit(0);
        }

        const sample = latestContextSample(db);
        if (!sample) {
          if (opts.json) {
            console.log(JSON.stringify({ sample: null }));
          } else {
            console.log('praxis context-usage — no samples recorded yet');
            console.log('  Use `praxis context-usage --record <used> --budget <budget>`.');
          }
          process.exit(0);
        }

        if (opts.json) {
          console.log(JSON.stringify(sample, null, 2));
          process.exit(0);
        }

        const inPollWindow =
          sample.percent >= POLL_WINDOW_START_PCT && sample.percent <= POLL_WINDOW_END_PCT;
        const pastPollWindow = sample.percent > POLL_WINDOW_END_PCT;
        console.log('praxis context-usage');
        console.log('');
        console.log(`  latest sample: ${new Date(sample.ts).toISOString()}`);
        console.log(`  used / budget: ${sample.used} / ${sample.budget}`);
        console.log(`  percent:       ${sample.percent.toFixed(1)}%`);
        if (inPollWindow) {
          console.log('');
          console.log(
            `  ⚠ Poll window (${POLL_WINDOW_START_PCT}–${POLL_WINDOW_END_PCT}%) — at the next clean point, ask the user whether to save progress and pause for /compact.`,
          );
        } else if (pastPollWindow) {
          console.log('');
          console.log(
            `  ⚠ Past the poll window (>${POLL_WINDOW_END_PCT}%) — if the user has not declined twice already, poll at the next clean point.`,
          );
        }
        process.exit(0);
      } finally {
        closeDatabase(db);
      }
    });
}
