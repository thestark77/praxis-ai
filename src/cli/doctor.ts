import { Command } from 'commander';
import { spawn } from 'node:child_process';
import { detect, installModeFor } from '../lib/detector.js';
import { resolvePaths, resolveOpenCodePaths } from '../lib/paths.js';
import { listBackups } from '../lib/backup.js';
import { readSettings, PRAXIS_AST_HOOK_MARKER } from '../lib/settings-patcher.js';
import { parseAgentSelector, resolveAgents } from '../lib/agents.js';
import { detectOpenCode } from '../lib/opencode/install.js';

/**
 * The irreversible half of the synthetic verify payload.
 *
 * Assembled rather than written out so this source file does not itself
 * contain a literal recursive-delete command: the praxis hook inspects
 * every Bash call an agent makes, and a tool editing this file would be
 * blocked by the very rule the constant describes.
 */
const DANGEROUS_SYNTHETIC = ['rm', '-rf', '/tmp/praxis-doctor-verify-target'].join(' ');

/**
 * Prove the OpenCode layer-2 firewall end to end without launching OpenCode:
 * load the exact engine module the emitted plugin imports and assert it
 * denies a synthetic irreversible command. A plugin whose import target has
 * gone missing loads as a silent no-op inside OpenCode, so checking that the
 * file exists is not enough — it has to be executed.
 */
async function verifyOpenCodePlugin(engineUrl: string | null): Promise<VerifyResult> {
  if (!engineUrl) {
    return {
      hookCommand: null,
      passed: false,
      reason: 'The praxis firewall plugin is not installed in ~/.config/opencode/plugins/.',
    };
  }
  try {
    const mod = (await import(engineUrl)) as {
      inspectBashCommand?: (cmd: string) => { decision: string; reason: string };
    };
    if (typeof mod.inspectBashCommand !== 'function') {
      return {
        hookCommand: engineUrl,
        passed: false,
        reason: 'The imported module does not export inspectBashCommand.',
      };
    }
    const result = mod.inspectBashCommand(`echo praxis-doctor-verify\n${DANGEROUS_SYNTHETIC}`);
    if (result.decision !== 'deny') {
      return {
        hookCommand: engineUrl,
        passed: false,
        reason: `Expected deny for a synthetic 'rm -rf' payload; got '${result.decision}'.`,
      };
    }
    return { hookCommand: engineUrl, passed: true, reason: result.reason };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      hookCommand: engineUrl,
      passed: false,
      reason: `Could not load the firewall engine the plugin imports: ${message}`,
    };
  }
}

interface VerifyResult {
  hookCommand: string | null;
  passed: boolean;
  reason: string;
}

/**
 * Split a hook command into argv, honouring quotes.
 *
 * A plain whitespace split keeps the quote characters inside the token, so
 * `node "C:/path/hook.js"` execs node against a file whose name literally
 * begins with a double quote. node fails, stdout is empty, and verify
 * reported "Hook stdout was not JSON" — blaming the hook for a fault in
 * the checker. Since praxis now quotes the path it writes (an unquoted
 * path breaks on any space), every verify would have hit this.
 *
 * Not a shell parser: quotes group, and nothing else is interpreted,
 * because the command is exec'd directly rather than through a shell.
 */
export function splitCommand(command: string): string[] {
  const argv: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let started = false;

  for (const ch of command) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      // An empty quoted string is still an argument.
      started = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current || started) {
        argv.push(current);
        current = '';
        started = false;
      }
      continue;
    }
    current += ch;
  }
  if (current || started) argv.push(current);
  return argv;
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
  const parts = splitCommand(stripped);
  const program = parts[0];
  const args = parts.slice(1);

  // Multi-line on purpose: the danger sits on the second line.
  //
  // A single-line delete is caught by every engine praxis ever shipped, so
  // that payload proves only that some hook answered. Layer 2 lives in a
  // package directory that upgrading the npm package alone does not
  // refresh, so a stale engine is a real state to be in, and this payload
  // fails against any engine predating the newline-separator fix.
  //
  // It is a floor, not a freshness test: an engine that handles newlines
  // but predates a later fix still passes. Nothing short of comparing
  // versions can prove currency, and the remedy either way is the one
  // already printed on failure -- re-run `praxis install`.
  const synthetic = JSON.stringify({
    session_id: 'praxis-doctor-verify',
    tool_name: 'Bash',
    tool_input: { command: `echo praxis-doctor-verify\n${DANGEROUS_SYNTHETIC}` },
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
    .option('--agent <agent>', 'report on: auto | both | claude-code | opencode', 'auto')
    .action(async (opts: { verify?: boolean; agent?: string }) => {
      const paths = resolvePaths();
      const opencodePaths = resolveOpenCodePaths(paths.home);
      const agents = await resolveAgents(parseAgentSelector(opts.agent), {
        paths,
        opencodePaths,
      });
      const report = await detect(paths);
      const mode = installModeFor(report);
      const backups = await listBackups({ backupsDir: paths.backupsDir });

      console.log('praxis-ai doctor');
      console.log('');
      console.log(`  install mode: ${mode}`);
      console.log(`  agents: ${agents.join(', ')}`);
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

      const checksOpenCode = agents.includes('opencode');
      const oc = checksOpenCode ? await detectOpenCode(opencodePaths) : null;
      if (oc) {
        console.log('');
        console.log('  OpenCode');
        console.log(`    config dir present: ${oc.configDirExists}`);
        console.log(`    config file:        ${oc.configFile}`);
        console.log(`    permission denies:  ${oc.activeRules}/${oc.totalRules}`);
        console.log(`    instructions entry: ${oc.instructionsPresent}`);
        console.log(
          `    firewall plugin:    ${
            oc.plugin.present
              ? `installed (v${oc.plugin.version ?? '?'}, engine ${
                  oc.plugin.engineResolvable ? 'resolvable' : 'MISSING'
                })`
              : 'not installed'
          }`,
        );
        console.log(`    skills installed:   ${oc.skillsInstalled.length}`);
      }

      const checksClaudeCode = agents.includes('claude-code');
      if (checksClaudeCode && mode === 'no-claude-code') {
        console.log('');
        console.log('  status: ❌ Claude Code is not initialised. Run `claude` once.');
        process.exit(1);
      }
      const claudeCodeHealthy = !checksClaudeCode || report.praxis.overlayInstalled;
      const openCodeHealthy =
        !oc || (oc.instructionsPresent && oc.activeRules === oc.totalRules && oc.plugin.present);
      const fullyInstalled = claudeCodeHealthy && openCodeHealthy;

      // --verify runs before the health verdict, never after it.
      //
      // This used to sit below an early `process.exit(0)` on the
      // not-fully-installed path, so `doctor --verify` printed one warning
      // and exited 0 without executing anything -- on exactly the machines
      // that most need proving. A partially upgraded box is the case where
      // "does layer 2 actually block?" has a non-obvious answer, and a
      // stale OpenCode rule count was enough to skip the Claude Code check
      // as well. Reporting success without running the check is the one
      // outcome a verification command must never produce.
      if (opts.verify) {
        if (checksClaudeCode) {
          console.log('');
          console.log('  AST hook verify (claude-code)');
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
        if (oc) {
          console.log('');
          console.log('  AST plugin verify (opencode)');
          const v = await verifyOpenCodePlugin(oc.plugin.engineUrl);
          console.log(`    engine module: ${v.hookCommand ?? '(not registered)'}`);
          console.log(`    synthetic deny: ${v.passed ? 'PASS' : 'FAIL'}`);
          if (!v.passed) {
            console.log(`    reason: ${v.reason}`);
            console.log('');
            console.log('  status: ✗ OpenCode firewall plugin verify failed');
            process.exit(1);
          }
        }
      }

      console.log('');
      if (!fullyInstalled) {
        console.log('  status: ⚠ praxis is not fully installed. Run `praxis install`.');
        process.exit(0);
      }
      console.log('  status: ✓ overlay healthy');
      process.exit(0);
    });
}
