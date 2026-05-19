import { Command } from 'commander';
import { runInstall } from '../lib/install.js';

export function installCommand(): Command {
  return new Command('install')
    .description(
      'Install praxis overlay into ~/.claude/. Detects gentle-ai and adapts (overlay or standalone mode).',
    )
    .option('--dry-run', 'preview changes without writing')
    .option('--force', 'overwrite ~/.praxis/ skeleton files if they already exist')
    .action(async (opts: { dryRun?: boolean; force?: boolean }) => {
      try {
        const result = await runInstall({ dryRun: opts.dryRun, force: opts.force });
        console.log('praxis-ai install');
        console.log(`  mode: ${result.mode}`);
        if (opts.dryRun) {
          console.log('  --dry-run: no changes were written');
        } else {
          console.log(`  backup: ${result.backupPath ?? '(none)'}`);
          console.log(
            `  skeleton: ${result.skeletonInstalled.length} installed, ${result.skeletonSkipped.length} skipped`,
          );
          console.log(`  CLAUDE.md @-import injected: ${result.claudeMdPatched}`);
          console.log(`  firewall rules added: ${result.firewallEntriesAdded}`);
        }
        if (result.warnings.length > 0) {
          console.log('');
          for (const w of result.warnings) {
            console.log(`  warning: ${w}`);
          }
        }
        process.exit(0);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`praxis install failed: ${message}`);
        console.error('No changes were written. You can re-run safely.');
        process.exit(1);
      }
    });
}
