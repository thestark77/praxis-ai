import { Command } from 'commander';
import { resolvePaths } from '../lib/paths.js';
import { listBackups, restoreBackup } from '../lib/backup.js';
import { runRollback } from '../lib/install.js';

export function rollbackCommand(): Command {
  return new Command('rollback')
    .description('Restore CLAUDE.md and settings.json from the most recent praxis backup.')
    .option('--list', 'show available backups without restoring')
    .option('--to <timestamp>', 'restore a specific backup by timestamp')
    .action(async (opts: { list?: boolean; to?: string }) => {
      const paths = resolvePaths();

      if (opts.list) {
        const backups = await listBackups({ backupsDir: paths.backupsDir });
        if (backups.length === 0) {
          console.log('praxis rollback: no backups found.');
          process.exit(0);
        }
        console.log('praxis-ai backups (newest first):');
        for (const b of backups) {
          console.log(`  ${b.timestamp}  (${b.files.join(', ')})`);
        }
        process.exit(0);
      }

      try {
        let restored: string | null;
        if (opts.to) {
          await restoreBackup(
            opts.to,
            {
              'CLAUDE.md': paths.claudeMd,
              'settings.json': paths.settingsJson,
            },
            { backupsDir: paths.backupsDir },
          );
          restored = opts.to;
        } else {
          restored = await runRollback({ paths });
        }
        if (restored === null) {
          console.log('praxis rollback: no backups available.');
          process.exit(1);
        }
        console.log(`praxis rollback: restored from backup ${restored}`);
        process.exit(0);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`praxis rollback failed: ${message}`);
        process.exit(1);
      }
    });
}
