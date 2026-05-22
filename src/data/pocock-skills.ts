// Manifest of the six skills lifted from mattpocock/skills.
//
// These are the per-file blob SHAs captured at lift time. Used by:
//   - tests to assert NOTICE.md records the same SHA the manifest knows about
//   - `praxis sync-pocock` to compare against a fresh upstream fetch and
//     report drift
//
// To bump after a sync-pocock run, update this file in the same commit as
// the regenerated NOTICE.md files. The repo commit SHA is the source of
// truth for "what we last lifted from"; per-file blob SHAs travel with it.

export const POCOCK_UPSTREAM_REPO = 'mattpocock/skills';
export const POCOCK_UPSTREAM_URL = 'https://github.com/mattpocock/skills';
export const POCOCK_LICENSE = 'MIT';

// Commit SHA of mattpocock/skills@main at the time of the lift.
export const POCOCK_REPO_COMMIT = 'b8be62ffacb0118fa3eaa29a0923c87c8c11985c';

export interface PocockSkillFile {
  /** Relative path within the upstream repo, e.g. `skills/engineering/diagnose/SKILL.md`. */
  upstreamPath: string;
  /** Per-file git blob SHA at lift time. */
  blobSha: string;
}

export interface PocockSkill {
  /** Slug under templates/claude-skills/<name>/ and ~/.claude/skills/<name>/. */
  name: string;
  /** invocation declaration per praxis-ai skill-invocation-policy. */
  invocation: 'explicit' | 'reflex' | 'contextual';
  /** Files lifted from the upstream skill directory. */
  files: PocockSkillFile[];
}

export const POCOCK_SKILLS: PocockSkill[] = [
  {
    name: 'grill-with-docs',
    invocation: 'explicit',
    files: [
      {
        upstreamPath: 'skills/engineering/grill-with-docs/SKILL.md',
        blobSha: '5ea0aa913629bec683690f371839bd10e588413d',
      },
    ],
  },
  {
    name: 'caveman',
    invocation: 'reflex',
    files: [
      {
        upstreamPath: 'skills/productivity/caveman/SKILL.md',
        blobSha: '85770a38992a7c74d2b3467b03fe5bd4b1287fe6',
      },
    ],
  },
  {
    name: 'diagnose',
    invocation: 'reflex',
    files: [
      {
        upstreamPath: 'skills/engineering/diagnose/SKILL.md',
        blobSha: 'ed55bda2fdb0d690ea3b80a1cf28bf848c5ad2b5',
      },
    ],
  },
  {
    name: 'zoom-out',
    invocation: 'explicit',
    files: [
      {
        upstreamPath: 'skills/engineering/zoom-out/SKILL.md',
        blobSha: '1e7a5dc728fed0a85a28c9dfb6e78ce5a81da7db',
      },
    ],
  },
  {
    name: 'prototype',
    invocation: 'explicit',
    files: [
      {
        upstreamPath: 'skills/engineering/prototype/SKILL.md',
        blobSha: '64f3e61117b49c305e8d85b9c8543dcdfbb7d2c2',
      },
      {
        upstreamPath: 'skills/engineering/prototype/LOGIC.md',
        blobSha: '526ecb18fb9a179dbb32392356b0e3ed3556911c',
      },
      {
        upstreamPath: 'skills/engineering/prototype/UI.md',
        blobSha: 'f3b6e640222bf50c0a888136f2fbe595f2ff2b60',
      },
    ],
  },
  {
    name: 'handoff',
    invocation: 'explicit',
    files: [
      {
        upstreamPath: 'skills/productivity/handoff/SKILL.md',
        blobSha: '0aa5b99300da27b50e80db53f880e422204faedd',
      },
    ],
  },
];

export const POCOCK_SKILL_NAMES = POCOCK_SKILLS.map((s) => s.name);
