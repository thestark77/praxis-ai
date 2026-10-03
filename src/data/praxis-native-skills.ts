// Manifest of skills authored natively by praxis-ai, as opposed to the six
// lifted from mattpocock/skills (see src/data/pocock-skills.ts).
//
// A native skill carries no upstream attribution and no NOTICE.md
// requirement: there is no upstream repo, blob SHA, or license to record,
// and `praxis sync-pocock` (src/lib/pocock-sync.ts) never looks at it —
// that command is exclusively about mattpocock/skills drift.
//
// Native skills are still installed, uninstalled, and updated through the
// same pipeline as the lifted ones: src/lib/skeleton-installer.ts copies
// whatever directory a caller names, so every call site that enumerates
// skill names unions this list with POCOCK_SKILL_NAMES rather than
// hardcoding "the six".

export interface PraxisNativeSkill {
  /** Slug under templates/claude-skills/<name>/ and ~/.claude/skills/<name>/. */
  name: string;
  /** invocation declaration per praxis-ai skill-invocation-policy. */
  invocation: 'explicit' | 'reflex' | 'contextual';
  /**
   * Files this skill ships, relative to its own directory. Unlike
   * `liftedFilesFor` in src/lib/update.ts, NOTICE.md is never implied —
   * list every file this skill actually ships.
   */
  files: string[];
}

export const PRAXIS_NATIVE_SKILLS: PraxisNativeSkill[] = [
  {
    name: 'away-mode',
    invocation: 'explicit',
    files: ['SKILL.md'],
  },
  // On-demand overlay skills. These carry procedures that used to be
  // @-imported into every turn (templates/praxis-home). They are
  // `contextual`: the description is the only always-loaded part, the body
  // loads when the situation matches. See templates/praxis-home/main.md for
  // the index of what lives where.
  { name: 'praxis-command-handoff', invocation: 'contextual', files: ['SKILL.md'] },
  { name: 'praxis-context-guard', invocation: 'contextual', files: ['SKILL.md'] },
  { name: 'praxis-delegation-policy', invocation: 'contextual', files: ['SKILL.md'] },
  { name: 'praxis-upstream-debugging', invocation: 'contextual', files: ['SKILL.md'] },
  { name: 'praxis-browser-testing', invocation: 'contextual', files: ['SKILL.md'] },
  { name: 'praxis-grilling', invocation: 'contextual', files: ['SKILL.md'] },
  { name: 'praxis-firewall-protocol', invocation: 'contextual', files: ['SKILL.md'] },
  { name: 'praxis-overlay-reference', invocation: 'contextual', files: ['SKILL.md'] },
];

export const PRAXIS_NATIVE_SKILL_NAMES = PRAXIS_NATIVE_SKILLS.map((s) => s.name);
