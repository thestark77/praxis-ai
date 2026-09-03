// Ledger of the permission rules praxis actually added.
//
// The firewall list is a set of *desired* rules, not a record of authorship.
// Uninstall used it as both: it removed every entry in `FIREWALL_DEFAULTS`
// that was currently denied, whoever had written it. On a machine where
// gentle-ai, a team settings file, or the user had independently denied the
// same thing — `**/.env` and `git push --force *` are the common ones —
// `praxis uninstall` left the box less protected than it found it, which is
// the one outcome an irreversibility tool must never produce.
//
// So install records what it added, and uninstall removes only that. The
// ledger lives in the praxis home, which praxis already owns outright, and
// is deleted with the rest of the overlay.
//
// Installs that predate the ledger have no file. That case falls back to
// the old behaviour rather than silently leaving rules behind: a missing
// ledger means "unknown", and leaving a firewall half-installed is worse
// than the over-removal the ledger exists to prevent. One reinstall writes
// the ledger and the machine is precise from then on.

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const OWNERSHIP_FILENAME = 'owned-permissions.json';

/** One OpenCode permission rule, as `{tool, pattern}`. */
export interface OwnedOpenCodeRule {
  tool: string;
  pattern: string;
}

export interface OwnershipLedger {
  version: 1;
  /**
   * True when this ledger was started by an install that found praxis
   * already on the machine but no ledger to inherit.
   *
   * Such a ledger is structurally incomplete and can never become
   * complete: the earlier version wrote its rules without recording them,
   * so the upgrade sees them as already present and claims none of them.
   * Trusting it would strand every rule the older install wrote and leave
   * a firewall that cannot be removed. Uninstall therefore ignores it and
   * sweeps the full list, which is exactly what the pre-ledger versions
   * did. A clean uninstall followed by a fresh install produces a
   * trustworthy ledger.
   */
  inheritedPreLedgerInstall?: boolean;
  /** `permissions.deny` entries praxis added to Claude Code settings.json. */
  claudeCode: string[];
  /** Permission rules praxis added to opencode.json. */
  opencode: OwnedOpenCodeRule[];
}

export function ownershipPath(praxisDir: string): string {
  return join(praxisDir, OWNERSHIP_FILENAME);
}

export function emptyLedger(): OwnershipLedger {
  return { version: 1, claudeCode: [], opencode: [] };
}

/**
 * Read the ledger. Returns `null` when there is no ledger to read — a
 * pre-ledger install, or a file this version cannot understand. Callers
 * treat `null` as "authorship unknown" and fall back, which is why a
 * corrupt file is not an error: refusing to uninstall over an unreadable
 * bookkeeping file would be worse than uninstalling imprecisely.
 */
export async function readOwnership(praxisDir: string): Promise<OwnershipLedger | null> {
  let raw: string;
  try {
    raw = await readFile(ownershipPath(praxisDir), 'utf8');
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<OwnershipLedger>;
    if (parsed.version !== 1) return null;
    return {
      version: 1,
      claudeCode: Array.isArray(parsed.claudeCode) ? parsed.claudeCode.filter(isString) : [],
      opencode: Array.isArray(parsed.opencode) ? parsed.opencode.filter(isOpenCodeRule) : [],
      inheritedPreLedgerInstall: parsed.inheritedPreLedgerInstall === true,
    };
  } catch {
    return null;
  }
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isOpenCodeRule(value: unknown): value is OwnedOpenCodeRule {
  if (typeof value !== 'object' || value === null) return false;
  const rule = value as Record<string, unknown>;
  return typeof rule.tool === 'string' && typeof rule.pattern === 'string';
}

/**
 * Merge newly added rules into the ledger and persist it.
 *
 * Reinstalling is additive rather than replacing: an earlier install may
 * have added a rule that a later one finds already present and therefore
 * reports as unchanged. Dropping it would hand ownership of a praxis rule
 * back to nobody and strand it at uninstall.
 */
export async function recordOwnership(
  praxisDir: string,
  added: {
    claudeCode?: string[];
    opencode?: OwnedOpenCodeRule[];
    /** Set by an install that found praxis present but no ledger. */
    inheritedPreLedgerInstall?: boolean;
  },
): Promise<OwnershipLedger> {
  const existing = (await readOwnership(praxisDir)) ?? emptyLedger();

  const claudeCode = [...existing.claudeCode];
  const seenClaude = new Set(claudeCode);
  for (const entry of added.claudeCode ?? []) {
    if (seenClaude.has(entry)) continue;
    seenClaude.add(entry);
    claudeCode.push(entry);
  }

  const opencode = [...existing.opencode];
  const seenOpenCode = new Set(opencode.map(ruleKey));
  for (const rule of added.opencode ?? []) {
    const key = ruleKey(rule);
    if (seenOpenCode.has(key)) continue;
    seenOpenCode.add(key);
    opencode.push(rule);
  }

  const ledger: OwnershipLedger = {
    version: 1,
    claudeCode,
    opencode,
    // Once inherited, always inherited: a later install cannot recover the
    // authorship the pre-ledger version never wrote down.
    inheritedPreLedgerInstall:
      existing.inheritedPreLedgerInstall === true || added.inheritedPreLedgerInstall === true,
  };
  const path = ownershipPath(praxisDir);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(ledger, null, 2) + '\n', 'utf8');
  return ledger;
}

function ruleKey(rule: OwnedOpenCodeRule): string {
  return `${rule.tool} ${rule.pattern}`;
}

export async function clearOwnership(praxisDir: string): Promise<void> {
  await rm(ownershipPath(praxisDir), { force: true });
}

/**
 * The Claude Code deny entries uninstall should remove.
 *
 * With a ledger, that is exactly what praxis added, intersected with the
 * current firewall list so a rule dropped from a later praxis version is
 * still cleaned up. Without one, it is the whole firewall list, which is
 * what praxis did before the ledger existed.
 */
export function claudeEntriesToRemove(
  ledger: OwnershipLedger | null,
  firewallEntries: string[],
): string[] {
  if (!ledger || ledger.inheritedPreLedgerInstall) return firewallEntries;
  const owned = new Set(ledger.claudeCode);
  return firewallEntries.filter((entry) => owned.has(entry));
}

/** The OpenCode rules uninstall should remove. Same reasoning as above. */
export function opencodeRulesToRemove<T extends OwnedOpenCodeRule>(
  ledger: OwnershipLedger | null,
  rules: T[],
): T[] {
  if (!ledger || ledger.inheritedPreLedgerInstall) return rules;
  const owned = new Set(ledger.opencode.map(ruleKey));
  return rules.filter((rule) => owned.has(ruleKey(rule)));
}
