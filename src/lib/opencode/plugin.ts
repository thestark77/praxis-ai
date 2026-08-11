import { readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Marker that identifies a praxis-emitted plugin. Doctor looks for it and
 * uninstall refuses to delete a `praxis-firewall.ts` that does not carry it,
 * so a hand-written plugin at that path is never silently destroyed.
 */
export const PRAXIS_PLUGIN_MARKER = 'praxis-ai:firewall-plugin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Locate the built firewall engine (`dist/firewall.js`) the emitted plugin
 * has to import.
 *
 * The plugin imports the engine rather than re-implementing it: there is one
 * rule set, in `src/lib/ast/`, and both harnesses run that exact code. The
 * lookup handles the two ways praxis runs — bundled (`dist/index.js`, engine
 * is a sibling) and from a checkout (`src/...`, engine is under the package
 * root's `dist/`).
 */
export async function resolveFirewallModulePath(): Promise<string | null> {
  const candidates = [
    resolve(__dirname, 'firewall.js'),
    resolve(__dirname, '..', '..', '..', 'dist', 'firewall.js'),
    resolve(__dirname, '..', '..', 'dist', 'firewall.js'),
  ];
  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }
  return null;
}

export interface RenderPluginOptions {
  /** Absolute path to the built `dist/firewall.js`. */
  firewallModulePath: string;
  version: string;
}

/**
 * Render the OpenCode plugin source.
 *
 * Deliberately untyped: the file is transpiled by Bun inside OpenCode, where
 * a missing `@opencode-ai/plugin` dependency would turn a type import into a
 * load failure — and a firewall plugin that fails to load is a firewall that
 * is not there. The engine is imported by absolute `file://` URL because
 * OpenCode's plugin dir has its own node_modules and cannot resolve a
 * globally installed npm package by name.
 */
export function renderFirewallPlugin(opts: RenderPluginOptions): string {
  const moduleUrl = pathToFileURL(opts.firewallModulePath).href;
  return `// ${PRAXIS_PLUGIN_MARKER} v${opts.version}
// GENERATED FILE — written by \`praxis install --agent opencode\`.
// Edits are lost on the next install; change the rules in praxis instead.
//
// Layer 2 of the praxis irreversibility firewall for OpenCode, the analogue
// of the Claude Code PreToolUse hook. Layer 1 is the \`permission\` block in
// opencode.json. This one catches the command-string bypasses globs miss:
// chained commands, substitutions, encoded execution.
import { inspectBashCommand } from ${JSON.stringify(moduleUrl)}

export const PraxisFirewall = async () => ({
  "tool.execute.before": async (input, output) => {
    if (input?.tool !== "bash") return
    const command = output?.args?.command
    if (typeof command !== "string" || command.trim() === "") return

    let result
    try {
      result = inspectBashCommand(command)
    } catch {
      // Fail open. A broken engine must never become an outage: layer 1
      // still holds, and \`praxis doctor --agent opencode --verify\` reports
      // the breakage.
      return
    }

    if (result.decision === "deny") {
      throw new Error(result.reason)
    }
  },
})
`;
}

export interface WritePluginResult {
  path: string;
  firewallModulePath: string;
}

export async function writeFirewallPlugin(
  pluginPath: string,
  opts: RenderPluginOptions,
): Promise<WritePluginResult> {
  await mkdir(dirname(pluginPath), { recursive: true });
  await writeFile(pluginPath, renderFirewallPlugin(opts), 'utf8');
  return { path: pluginPath, firewallModulePath: opts.firewallModulePath };
}

/** Remove the emitted plugin. Foreign files at that path are left alone. */
export async function removeFirewallPlugin(pluginPath: string): Promise<boolean> {
  let content: string;
  try {
    content = await readFile(pluginPath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
  if (!content.includes(PRAXIS_PLUGIN_MARKER)) return false;
  await rm(pluginPath, { force: true });
  return true;
}

export interface PluginStatus {
  present: boolean;
  /** The `file://` specifier the plugin imports the engine from. */
  engineUrl: string | null;
  /** Whether that engine file actually exists on disk. */
  engineResolvable: boolean;
  version: string | null;
}

/**
 * Inspect the emitted plugin without executing it. A plugin whose engine
 * import no longer resolves — praxis reinstalled elsewhere, npm prefix
 * changed — loads as a no-op inside OpenCode, so doctor has to check the
 * import target, not just the file.
 */
export async function readPluginStatus(pluginPath: string): Promise<PluginStatus> {
  let content: string;
  try {
    content = await readFile(pluginPath, 'utf8');
  } catch {
    return { present: false, engineUrl: null, engineResolvable: false, version: null };
  }
  if (!content.includes(PRAXIS_PLUGIN_MARKER)) {
    return { present: false, engineUrl: null, engineResolvable: false, version: null };
  }
  const urlMatch = /from\s+"(file:\/\/[^"]+)"/.exec(content);
  const versionMatch = new RegExp(`${PRAXIS_PLUGIN_MARKER} v([^\\s]+)`).exec(content);
  const engineUrl = urlMatch?.[1] ?? null;
  let engineResolvable = false;
  if (engineUrl) {
    try {
      engineResolvable = await pathExists(fileURLToPath(engineUrl));
    } catch {
      engineResolvable = false;
    }
  }
  return {
    present: true,
    engineUrl,
    engineResolvable,
    version: versionMatch?.[1] ?? null,
  };
}

/**
 * Read praxis's own version, used to stamp the emitted plugin.
 *
 * The candidates cover both layouts this code runs in: bundled, where this
 * module is `<pkg>/dist/index.js` and the manifest is one level up, and a
 * source checkout, where it is `<pkg>/src/lib/opencode/plugin.ts` and the
 * manifest is three. Missing `<pkg>/package.json` from the bundled case is
 * how installs ended up stamped `v0.0.0`.
 */
export async function readPackageVersion(fallback = '0.0.0'): Promise<string> {
  const candidates = [
    resolve(__dirname, '..', 'package.json'),
    resolve(__dirname, '..', '..', '..', 'package.json'),
    resolve(__dirname, '..', '..', 'package.json'),
    join(__dirname, 'package.json'),
  ];
  for (const candidate of candidates) {
    try {
      const raw = await readFile(candidate, 'utf8');
      const parsed = JSON.parse(raw) as { name?: string; version?: string };
      if (parsed.name === 'praxis-ai' && parsed.version) return parsed.version;
    } catch {
      continue;
    }
  }
  return fallback;
}
