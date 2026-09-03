import { Command } from 'commander';
import { homedir } from 'node:os';
import {
  applyAll,
  statusAll,
  scanOverrides,
  type ApplyResult,
  type EnvironmentStatus,
  type Override,
} from '../lib/remote-control.js';

function label(state: string): string {
  if (state === 'on') return 'on';
  if (state === 'off') return 'off';
  return 'unset (Claude Code default)';
}

function reportOverrides(overrides: Override[]): boolean {
  const disabling = overrides.filter((o) => o.value === false);
  const ignored = overrides.filter((o) => o.value === true);

  if (disabling.length > 0) {
    console.log('');
    console.log('  ⚠ these repositories switch Remote Control OFF, and they win:');
    for (const o of disabling) console.log(`      ${o.path}`);
    console.log('');
    console.log('    Claude Code resolves a project or local `false` before it reads your');
    console.log('    user settings, so sessions started in these directories will not');
    console.log('    connect. Remove the key from those files to close the gap.');
  }

  if (ignored.length > 0) {
    console.log('');
    console.log('  note: these repositories set it to `true`, which Claude Code ignores');
    console.log('        (repo-scoped settings cannot enable Remote Control):');
    for (const o of ignored) console.log(`      ${o.path}`);
  }

  return disabling.length > 0;
}

function reportApply(results: ApplyResult[]): void {
  for (const r of results) {
    const suffix = r.environment.claudeInstalled
      ? ''
      : ' — no Claude installation here yet; the setting is waiting for one';
    if (r.error) {
      console.log(`    ${r.environment.name}: ✗ ${r.error}`);
      continue;
    }
    const verb = r.changed ? label(r.current) : `${label(r.current)} (already)`;
    console.log(`    ${r.environment.name}: ${verb}${suffix}`);
    console.log(`      ${r.environment.settingsPath}`);
  }
}

function reportStatus(statuses: EnvironmentStatus[]): void {
  for (const s of statuses) {
    const suffix = s.claudeInstalled ? '' : ' — no Claude installation here yet';
    console.log(`    ${s.name}: ${s.error ? `✗ ${s.error}` : label(s.state)}${suffix}`);
    console.log(`      ${s.settingsPath}`);
  }
}

export function remoteControlCommand(): Command {
  const command = new Command('remote-control').description(
    'Turn Claude Code Remote Control on for every session, in every environment on this machine (Windows and each WSL distribution).',
  );

  command
    .command('enable')
    .description('Start the Remote Control bridge automatically in every session.')
    .option('--no-scan', 'skip the scan for repositories that switch it off')
    .action(async (opts: { scan?: boolean }) => {
      console.log('praxis remote-control enable');
      console.log('');
      console.log('  environments');
      const results = await applyAll(true);
      reportApply(results);

      let blocked = false;
      if (opts.scan !== false) {
        const exclude = results.map((r) => r.environment.settingsPath);
        const overrides = await scanOverrides({ roots: [homedir()], exclude });
        blocked = reportOverrides(overrides);
      }

      console.log('');
      if (results.every((r) => r.error)) {
        console.log('  status: ✗ nothing was written');
        process.exit(1);
      }
      console.log(
        blocked
          ? '  status: ⚠ enabled, but the repositories above still switch it off'
          : '  status: ✓ enabled everywhere on this machine',
      );
      console.log('');
      console.log('  Takes effect in new sessions; this one already started.');
      console.log('  An organization policy can pin this setting, in which case Claude');
      console.log('  Code ignores it silently. `praxis remote-control status` will still');
      console.log('  show `on` here, so confirm with /status in a fresh session.');
      process.exit(0);
    });

  command
    .command('disable')
    .description('Stop starting the Remote Control bridge automatically.')
    .action(async () => {
      console.log('praxis remote-control disable');
      console.log('');
      console.log('  environments');
      reportApply(await applyAll(false));
      console.log('');
      console.log('  status: ✓ disabled everywhere on this machine');
      process.exit(0);
    });

  command
    .command('reset')
    .description("Remove the setting, returning to Claude Code's default.")
    .action(async () => {
      console.log('praxis remote-control reset');
      console.log('');
      console.log('  environments');
      reportApply(await applyAll(null));
      console.log('');
      console.log('  status: ✓ setting removed; Claude Code decides');
      process.exit(0);
    });

  command
    .command('status', { isDefault: true })
    .description('Report the setting in every environment. Changes nothing.')
    .option('--no-scan', 'skip the scan for repositories that switch it off')
    .action(async (opts: { scan?: boolean }) => {
      console.log('praxis remote-control status');
      console.log('');
      console.log('  environments');
      const statuses = await statusAll();
      reportStatus(statuses);

      if (opts.scan !== false) {
        const exclude = statuses.map((s) => s.settingsPath);
        reportOverrides(await scanOverrides({ roots: [homedir()], exclude }));
      }

      const allOn = statuses.every((s) => s.state === 'on');
      console.log('');
      console.log(
        allOn
          ? '  status: ✓ on in every environment'
          : '  status: ⚠ not on everywhere — `praxis remote-control enable` fixes that',
      );
      process.exit(0);
    });

  return command;
}
