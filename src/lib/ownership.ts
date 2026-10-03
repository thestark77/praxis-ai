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
import type { PreviousAttribution } from './settings-patcher.js';

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
  /**
   * What the Claude Code `attribution` setting held before praxis emptied
   * it. Present only when praxis wrote the setting; a value that was
   * already empty on arrival is the user's own and is not recorded, so
   * uninstall leaves it alone. Ledgers from before this field existed
   * simply lack it, which uninstall reads as "praxis wrote nothing here".
   */
  attribution?: PreviousAttribution;
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
    const ledger: OwnershipLedger = {
      version: 1,
      claudeCode: Array.isArray(parsed.claudeCode) ? parsed.claudeCode.filter(isString) : [],
      opencode: Array.isArray(parsed.opencode) ? parsed.opencode.filter(isOpenCodeRule) : [],
      inheritedPreLedgerInstall: parsed.inheritedPreLedgerInstall === true,
    };
    if (isPreviousAttribution(parsed.attribution)) ledger.attribution = parsed.attribution;
    return ledger;
  } catch {
    return null;
  }
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isPreviousAttribution(value: unknown): value is PreviousAttribution {
  if (typeof value !== 'object' || value === null) return false;
  return typeof (value as Record<string, unknown>).present === 'boolean';
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
    /**
     * The value the attribution setting held before this install wrote it.
     * Replaces any earlier record: the install that overwrites a value is
     * the one whose "before" uninstall must restore. Omit it when the
     * install wrote nothing, so the first record survives re-runs.
     */
    attribution?: PreviousAttribution;
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
  const attribution = added.attribution ?? existing.attribution;
  if (attribution) ledger.attribution = attribution;
  const path = ownershipPath(praxisDir);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(ledger, null, 2) + '\n', 'utf8');
  return ledger;
}

function ruleKey(rule: OwnedOpenCodeRule): string {
  return `${rule.tool} ${rule.pattern}`;
}

/**
 * Frontmatter key a shipped praxis-native skill file carries, so update and
 * uninstall can tell "praxis installed this" from "a user's own file
 * happens to live at the same path".
 *
 * There is no per-file install ledger for skills the way `OwnershipLedger`
 * above tracks permission rules: a skill is a markdown file, installed by
 * copying a template, and nothing records that copy per file. Rather than
 * build a parallel ledger for a single file, the shipped file carries its
 * own marker in frontmatter — the same place `name` already lives.
 */
export const PRAXIS_NATIVE_SKILL_MARKER = 'praxis-native';

interface SkillFrontmatter {
  name?: string;
  praxisNative?: boolean;
}

function parseSkillFrontmatter(content: string): SkillFrontmatter {
  // Tolerate a leading UTF-8 BOM and CRLF line endings: some editors and
  // Windows checkouts write both, and a shipped or user-authored SKILL.md
  // with either must still be recognized rather than silently falling
  // through to "no frontmatter".
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
  content = content.replace(/\r\n/g, '\n');
  if (!content.startsWith('---\n')) return {};
  const end = content.indexOf('\n---', 4);
  if (end === -1) return {};
  const block = content.slice(4, end);
  const out: SkillFrontmatter = {};
  for (const line of block.split('\n')) {
    const m = line.match(/^([a-zA-Z][\w-]*):\s*(.*)$/);
    if (!m) continue;
    const [, key, val] = m;
    if (key === 'name') out.name = val.trim();
    else if (key === PRAXIS_NATIVE_SKILL_MARKER)
      out.praxisNative = val.trim().toLowerCase() === 'true';
  }
  return out;
}

/**
 * Whether an on-disk native-skill file was installed by praxis, as opposed
 * to a user-authored file that merely shares the skill's directory and file
 * name.
 *
 * A shipped native-skill file declares both `name: <skillName>` and
 * `praxis-native: true` in its frontmatter. A user's own file at the same
 * path either omits the marker entirely or names a different skill (e.g. it
 * was copied from elsewhere), and update/uninstall leave it alone.
 */
export function isPraxisOwnedNativeSkillFile(content: string, skillName: string): boolean {
  const fm = parseSkillFrontmatter(content);
  return fm.name === skillName && fm.praxisNative === true;
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
