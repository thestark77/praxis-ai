import { Command } from 'commander';
import { runUninstall } from '../lib/install.js';
import { parseAgentSelector } from '../lib/agents.js';

export function uninstallCommand(): Command {
  return new Command('uninstall')
    .description(
      'Remove praxis from ~/.claude/ and/or ~/.config/opencode/. Removes the overlay ' +
        'pointer, the firewall rules and the AST layer.',
    )
    .option('--agent <agent>', 'target harness: auto | both | claude-code | opencode', 'auto')
    .option('--keep-skeleton', 'leave ~/.praxis/ in place')
    .option('--keep-skills', 'leave lifted skill dirs in place')
    .action(async (opts: { agent?: string; keepSkeleton?: boolean; keepSkills?: boolean }) => {
      try {
        const result = await runUninstall({
          agents: parseAgentSelector(opts.agent),
          removeSkeleton: !opts.keepSkeleton,
          removeClaudeSkills: !opts.keepSkills,
        });
        console.log('praxis-ai uninstall');
        console.log(`  agents: ${result.agents.join(', ')}`);
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
        if (result.opencode) {
          const oc = result.opencode;
          console.log('');
          console.log('  opencode');
          console.log(`    config: ${oc.configFile}`);
          console.log(`    permission denies removed: ${oc.permissionRulesRemoved}`);
          console.log(`    instructions entry removed: ${oc.instructionsRemoved}`);
          console.log(`    firewall plugin removed: ${oc.pluginRemoved}`);
          console.log(`    skills removed: ${oc.skillsRemoved.length}`);
        }
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
