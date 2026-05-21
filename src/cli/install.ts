import { Command } from 'commander';
import { runInstall } from '../lib/install.js';

export function installCommand(): Command {
  return new Command('install')
    .description(
      'Install praxis overlay into ~/.claude/. Plug-and-play: also bootstraps ' +
        'gentle-ai (binary + ecosystem + engram + strict TDD) unless --no-gentle-ai.',
    )
    .option('--dry-run', 'preview changes without writing')
    .option('--force', 'overwrite ~/.praxis/ skeleton + reapply gentle-ai praxis defaults')
    .option('--no-gentle-ai', 'skip the gentle-ai bootstrap; install the praxis overlay only')
    .option('--ga-persona <persona>', 'gentle-ai persona: gentleman | neutral | custom', 'neutral')
    .option(
      '--ga-preset <preset>',
      'gentle-ai preset: full-gentleman | ecosystem-only | minimal | custom',
      'full-gentleman',
    )
    .option('--ga-agents <agents>', 'gentle-ai agents (CSV)', 'claude-code')
    .option('--no-strict-tdd', 'do not enable gentle-ai Strict TDD during the bootstrap')
    .action(
      async (opts: {
        dryRun?: boolean;
        force?: boolean;
        gentleAi?: boolean;
        gaPersona?: string;
        gaPreset?: string;
        gaAgents?: string;
        strictTdd?: boolean;
      }) => {
        try {
          // commander sets opts.gentleAi=false for --no-gentle-ai, and
          // opts.strictTdd=false for --no-strict-tdd; both default true.
          const bootstrap = opts.gentleAi !== false && !opts.dryRun;
          const result = await runInstall({
            dryRun: opts.dryRun,
            force: opts.force,
            bootstrapGentleAi: bootstrap,
            gentleAiConfig: {
              persona: opts.gaPersona,
              preset: opts.gaPreset,
              agents: opts.gaAgents,
              strictTdd: opts.strictTdd !== false,
            },
          });
          console.log('praxis-ai install');
          console.log(`  mode: ${result.mode}`);
          if (opts.dryRun) {
            console.log('  --dry-run: no changes were written');
          } else {
            console.log(`  backup: ${result.backupPath ?? '(none)'}`);
            if (result.gentleAiBootstrap) {
              const gb = result.gentleAiBootstrap;
              if (gb.skipped) {
                console.log('  gentle-ai: skipped (already configured; use --force to reapply)');
              } else {
                console.log(
                  `  gentle-ai: binary=${gb.ranBinaryInstall} ecosystem=${gb.ranEcosystemInstall} strict-tdd=${gb.ranStrictTddSync}`,
                );
              }
            } else if (opts.gentleAi === false) {
              console.log('  gentle-ai: bootstrap skipped (--no-gentle-ai)');
            }
            console.log(
              `  skeleton: ${result.skeletonInstalled.length} installed, ${result.skeletonSkipped.length} skipped`,
            );
            console.log(
              `  claude-skills: ${result.claudeSkillsInstalled.length} installed, ${result.claudeSkillsSkipped.length} skipped`,
            );
            console.log(`  CLAUDE.md @-import injected: ${result.claudeMdPatched}`);
            console.log(`  firewall rules added: ${result.firewallEntriesAdded}`);
            console.log(`  AST PreToolUse hook registered: ${result.astHookRegistered}`);
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
      },
    );
}
