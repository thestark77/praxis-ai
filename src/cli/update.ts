import { Command } from 'commander';
import { runUpdate } from '../lib/update.js';

export function updateCommand(): Command {
  return new Command('update')
    .description(
      'Update the external pieces praxis depends on to their latest, without ' +
        'touching the rest of the praxis overlay. By default updates both ' +
        'gentle-ai (binary + components + engram, preserving your config) and ' +
        'the lifted skills (from the praxis-ai repo).',
    )
    .option('--gentle-ai', 'update only gentle-ai (binary + components + engram)')
    .option('--skills', 'update only the lifted mattpocock skills')
    .action(async (opts: { gentleAi?: boolean; skills?: boolean }) => {
      // If neither flag is passed, update both. If one is passed, update
      // only that target (modular).
      const onlyOne = Boolean(opts.gentleAi) || Boolean(opts.skills);
      const doGentleAi = onlyOne ? Boolean(opts.gentleAi) : true;
      const doSkills = onlyOne ? Boolean(opts.skills) : true;

      try {
        const result = await runUpdate({ gentleAi: doGentleAi, skills: doSkills });
        console.log('praxis-ai update');

        if (result.gentleAi) {
          const g = result.gentleAi;
          if (g.skippedReason) {
            console.log(`  gentle-ai: skipped — ${g.skippedReason}`);
          } else {
            console.log(
              `  gentle-ai: upgrade exit=${g.upgrade?.code ?? 'n/a'}, sync exit=${g.sync?.code ?? 'n/a'}` +
                `, strict-tdd preserved=${g.strictTddPreserved}`,
            );
          }
        }

        if (result.skills) {
          console.log(
            `  skills: ${result.skills.updatedFiles.length} updated, ${result.skills.failedFiles.length} failed`,
          );
        }

        if (result.warnings.length > 0) {
          console.log('');
          for (const w of result.warnings) {
            console.log(`  warning: ${w}`);
          }
        }

        console.log('');
        console.log('  Note: CLAUDE.md / settings.json changes take effect in your next');
        console.log('        Claude Code session. Run `praxis doctor --verify` to confirm.');
        process.exit(0);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`praxis update failed: ${message}`);
        process.exit(1);
      }
    });
}
