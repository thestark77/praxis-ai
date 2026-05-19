import { Command } from 'commander';
import { POCOCK_REPO_COMMIT } from '../data/pocock-skills.js';
import { detectDrift, formatDriftReport, createGitHubFetcher } from '../lib/pocock-sync.js';

export function syncPocockCommand(): Command {
  return new Command('sync-pocock')
    .description(
      'Check whether the six lifted mattpocock skills have drifted upstream. ' +
        'Reports per-file SHA differences; does not auto-rewrite (mechanism-pure ' +
        'rewrites require human review).',
    )
    .option(
      '--ref <ref>',
      'upstream ref to compare against (branch, tag, or commit SHA). Default: main.',
      'main',
    )
    .option(
      '--against-lift',
      'compare against the commit SHA recorded at the original lift instead of main',
    )
    .action(async (opts: { ref: string; againstLift?: boolean }) => {
      try {
        const ref = opts.againstLift ? POCOCK_REPO_COMMIT : opts.ref;
        const fetcher = createGitHubFetcher();
        const report = await detectDrift(fetcher, ref);
        console.log(formatDriftReport(report));
        // Exit code 1 if there is drift, so CI can gate on this.
        const dirty = report.changed.length > 0 || report.removed.length > 0;
        process.exit(dirty ? 1 : 0);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`praxis sync-pocock failed: ${message}`);
        process.exit(2);
      }
    });
}
