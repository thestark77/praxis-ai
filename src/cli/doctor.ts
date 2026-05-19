import { Command } from 'commander';
import { spawn } from 'node:child_process';
import { detect, installModeFor } from '../lib/detector.js';
import { resolvePaths } from '../lib/paths.js';
import { listBackups } from '../lib/backup.js';
import { readSettings, PRAXIS_AST_HOOK_MARKER } from '../lib/settings-patcher.js';

interface VerifyResult {
  hookCommand: string | null;
  passed: boolean;
  reason: string;
}

async function verifyAstHook(settingsPath: string): Promise<VerifyResult> {
  const settings = await readSettings(settingsPath);
  const preList = settings.hooks?.PreToolUse ?? [];
  let hookCommand: string | null = null;
  for (const matcher of preList) {
    if (matcher.matcher !== 'Bash') continue;
    const entry = matcher.hooks.find((h) => h.command.includes(PRAXIS_AST_HOOK_MARKER));
    if (entry) {
      hookCommand = entry.command;
      break;
    }
  }
  if (!hookCommand) {
    return {
      hookCommand: null,
      passed: false,
      reason: 'No praxis-tagged PreToolUse hook entry found in settings.json.',
    };
  }
  // The hook command in settings ends with the praxis marker which is a
  // shell comment (`# praxis-ast-hook #`). For execution here we strip
  // the marker so we are not invoking the shell at all — we exec the
  // first token directly and feed it the synthetic payload over stdin.
  const stripped = hookCommand.replace(PRAXIS_AST_HOOK_MARKER, '').trim();
  const parts = stripped.split(/\s+/);
  const program = parts[0];
  const args = parts.slice(1);

  const synthetic = JSON.stringify({
    session_id: 'praxis-doctor-verify',
    tool_name: 'Bash',
    tool_input: { command: 'rm -rf /tmp/praxis-doctor-verify-target' },
  });

  return await new Promise<VerifyResult>((resolve) => {
    let stdout = '';
    let stderr = '';
    let child;
    try {
      child = spawn(program, args, {
        env: { ...process.env, PRAXIS_TELEMETRY_DISABLED: '1' },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      resolve({
        hookCommand,
        passed: false,
        reason: `Failed to spawn hook command \`${program}\`: ${message}`,
      });
      return;
    }
    child.stdout.on('data', (c) => (stdout += String(c)));
    child.stderr.on('data', (c) => (stderr += String(c)));
    child.on('error', (err) => {
      resolve({
        hookCommand,
        passed: false,
        reason: `Hook spawn error: ${err.message}`,
      });
    });
    child.on('close', () => {
      try {
        const parsed = JSON.parse(stdout) as {
          hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string };
        };
        const decision = parsed.hookSpecificOutput?.permissionDecision;
        if (decision === 'deny') {
          resolve({
            hookCommand,
            passed: true,
            reason: parsed.hookSpecificOutput?.permissionDecisionReason ?? '',
          });
        } else {
          resolve({
            hookCommand,
            passed: false,
            reason: `Expected deny for a synthetic 'rm -rf' payload; got '${decision}'. stderr: ${stderr.slice(0, 200)}`,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        resolve({
          hookCommand,
          passed: false,
          reason: `Hook stdout was not JSON: ${message}. stdout: ${stdout.slice(0, 200)}`,
        });
      }
    });
    child.stdin.end(synthetic);
  });
}

export function doctorCommand(): Command {
  return new Command('doctor')
    .description(
      'Diagnose the praxis installation: gentle-ai presence, engram MCP, firewall rules, marker integrity, backups.',
    )
    .option(
      '--verify',
      'spawn the registered AST hook with a synthetic deny payload and assert it blocks',
    )
    .action(async (opts: { verify?: boolean }) => {
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
      if (opts.verify) {
        console.log('');
        console.log('  AST hook verify');
        const v = await verifyAstHook(paths.settingsJson);
        console.log(`    hook command: ${v.hookCommand ?? '(not registered)'}`);
        console.log(`    synthetic deny: ${v.passed ? 'PASS' : 'FAIL'}`);
        if (!v.passed) {
          console.log(`    reason: ${v.reason}`);
          console.log('');
          console.log('  status: ✗ AST hook verify failed');
          process.exit(1);
        }
      }

      console.log('');
      console.log('  status: ✓ overlay healthy');
      process.exit(0);
    });
}
