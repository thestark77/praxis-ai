import { Command } from 'commander';
import { runUninstall } from '../lib/install.js';

export function uninstallCommand(): Command {
  return new Command('uninstall')
    .description('Remove praxis from ~/.claude/. Removes the @-import block and firewall rules.')
    .option('--keep-skeleton', 'leave ~/.praxis/ in place')
    .option('--keep-skills', 'leave ~/.claude/skills/ lifted skill dirs in place')
    .action(async (opts: { keepSkeleton?: boolean; keepSkills?: boolean }) => {
      try {
        const result = await runUninstall({
          removeSkeleton: !opts.keepSkeleton,
          removeClaudeSkills: !opts.keepSkills,
        });
        console.log('praxis-ai uninstall');
        console.log(`  CLAUDE.md @-import removed: ${result.removedClaudeMdBlock}`);
        console.log(`  firewall rules removed: ${result.removedFirewallEntries}`);
        if (result.removedSkeleton) {
          if (result.praxisDirFullyRemoved) {
            console.log(`  ~/.praxis/ removed: true (no user data was present)`);
          } else {
            console.log(
              `  ~/.praxis/ install artefacts removed; backups preserved for \`praxis rollback\``,
            );
          }
        } else {
          console.log(`  ~/.praxis/ left in place (--keep-skeleton)`);
        }
        console.log(`  claude-skills removed: ${result.removedClaudeSkills.length}`);
        console.log(`  AST PreToolUse hook removed: ${result.removedAstHook}`);
        if (!opts.keepSkeleton && !result.praxisDirFullyRemoved) {
          console.log('');
          console.log('  Tip: `praxis rollback` restores CLAUDE.md and settings.json');
          console.log('       from the most recent preserved backup.');
        }
        process.exit(0);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`praxis uninstall failed: ${message}`);
        process.exit(1);
      }
    });
}
