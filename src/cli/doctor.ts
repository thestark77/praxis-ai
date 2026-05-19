import { Command } from 'commander';
import { detect, installModeFor } from '../lib/detector.js';
import { resolvePaths } from '../lib/paths.js';
import { listBackups } from '../lib/backup.js';

export function doctorCommand(): Command {
  return new Command('doctor')
    .description(
      'Diagnose the praxis installation: gentle-ai presence, engram MCP, firewall rules, marker integrity, backups.',
    )
    .action(async () => {
      const paths = resolvePaths();
      const report = await detect(paths);
      const mode = installModeFor(report);
      const backups = await listBackups({ backupsDir: paths.backupsDir });

      console.log('praxis-ai doctor');
      console.log('');
      console.log(`  install mode: ${mode}`);
      console.log('');
      console.log('  Claude Code');
      console.log(`    config dir present: ${report.claude.configDirExists}`);
      console.log(`    CLAUDE.md present:  ${report.claude.claudeMdExists}`);
      console.log(`    settings.json:      ${report.claude.settingsJsonExists}`);
      console.log('');
      console.log('  gentle-ai');
      console.log(`    binary on PATH:     ${report.gentleAi.binaryPresent}`);
      console.log(
        `    markers in CLAUDE.md: ${
          report.gentleAi.markersFound.length > 0
            ? report.gentleAi.markersFound.join(', ')
            : '(none)'
        }`,
      );
      console.log('');
      console.log('  engram');
      console.log(`    MCP enabled:        ${report.engram.mcpEnabled}`);
      console.log('');
      console.log('  praxis');
      console.log(`    overlay installed:  ${report.praxis.overlayInstalled}`);
      console.log(`    ~/.praxis/ exists:  ${report.praxis.homeDirExists}`);
      console.log(`    backups available:  ${backups.length}`);

      if (mode === 'no-claude-code') {
        console.log('');
        console.log('  status: ❌ Claude Code is not initialised. Run `claude` once.');
        process.exit(1);
      }
      if (!report.praxis.overlayInstalled) {
        console.log('');
        console.log('  status: ⚠ praxis is not installed. Run `praxis install`.');
        process.exit(0);
      }
      console.log('');
      console.log('  status: ✓ overlay healthy');
      process.exit(0);
    });
}
