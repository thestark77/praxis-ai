import { Command } from 'commander';
import { installCommand } from './install.js';
import { uninstallCommand } from './uninstall.js';
import { upgradeCommand } from './upgrade.js';
import { doctorCommand } from './doctor.js';
import { rollbackCommand } from './rollback.js';
import { statsCommand } from './stats.js';
import { contextUsageCommand } from './context-usage.js';
import { syncPocockCommand } from './sync-pocock.js';

const program = new Command();

program
  .name('praxis')
  .description(
    'Phased-autonomy harness layer for Claude Code. Indagatory at task start, autonomous in execution, hard-stop at irreversibility.',
  )
  .version('0.1.0-alpha.3');

program.addCommand(installCommand());
program.addCommand(uninstallCommand());
program.addCommand(upgradeCommand());
program.addCommand(doctorCommand());
program.addCommand(rollbackCommand());
program.addCommand(statsCommand());
program.addCommand(contextUsageCommand());
program.addCommand(syncPocockCommand());

program.parse(process.argv);
