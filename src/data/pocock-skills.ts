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

// Commit of mattpocock/skills@main at which upstream drift was last reviewed.
// Distinct from POCOCK_REPO_COMMIT, which records what we lifted from. The
// two differ whenever upstream has moved on in ways that need no change to a
// lifted file — without that distinction the drift report cannot tell
// "nobody has looked at this" from "looked at, still faithful".
export const POCOCK_UPSTREAM_REVIEWED_COMMIT = '6654f6b60cd9d5be8b54c6fafe44346dabeb3b76';

/**
 * Upstream now ships as a Claude Code plugin (`.claude-plugin/plugin.json`
 * plus a marketplace manifest) and has grown well past the six skills
 * praxis lifted: ask-matt, code-review, codebase-design, diagnosing-bugs,
 * domain-modeling, implement, research, tdd, triage, wayfinder and more.
 *
 * That does not change what praxis lifts. The lifted six are the ones the
 * praxis phase model actually reaches for, they are rewritten
 * mechanism-pure so they do not fight gentle-ai's orchestrator, and the
 * lift is what lets praxis keep `caveman`, `diagnose` and `zoom-out`
 * alive after upstream deleted them. Anyone wanting the full current set
 * should install the upstream plugin alongside; the two coexist, because
 * praxis skills carry their own names and their own NOTICE.md.
 *
 * Recorded here so the next person reviewing drift does not rediscover it.
 */
export const POCOCK_UPSTREAM_IS_PLUGIN = true;

/** Editorial sweep applied across the whole upstream repo at the reviewed commit. */
const EDITORIAL_ONLY =
  'Editorial only at the reviewed commit: upstream removed em dashes repo-wide and ' +
  'restated skill invocation in Skill-tool terms. The mechanism the lift captured is ' +
  'unchanged, so the rewrite still holds.';

/**
 * A terminal or structural fact about the upstream path, as opposed to
 * ordinary content drift.
 *
 * `removed`  — upstream deleted the file. There is nothing left to sync
 *              against, so it must stop appearing as outstanding work. The
 *              lifted rewrite and its NOTICE.md attribution stay valid: they
 *              record what the file said when it existed.
 * `relocated` — upstream still carries the mechanism, but under a different
 *              path. Drift is checked against `movedTo` instead, so a
 *              reorganisation upstream does not read as a deleted skill.
 */
export interface PocockUpstreamStatus {
  kind: 'removed' | 'relocated';
  /** Repo commit at which this was observed. */
  observedAt: string;
  /** For `relocated`: the path now carrying the mechanism. */
  movedTo?: string;
  /** For `relocated`: blob SHA of `movedTo` at `observedAt`. */
  movedToBlobSha?: string;
  /** Why, in one line. Shown verbatim in the drift report. */
  note: string;
}

export interface PocockSkillFile {
  /** Relative path within the upstream repo, e.g. `skills/engineering/diagnose/SKILL.md`. */
  upstreamPath: string;
  /** Per-file git blob SHA at lift time. */
  blobSha: string;
  /** Set once upstream has deleted or moved the path. Absent means "live". */
  upstreamStatus?: PocockUpstreamStatus;
  /**
   * Blob SHA a human read and judged to leave the lifted mechanism intact.
   *
   * Upstream edits prose far more often than it edits behaviour: a
   * repo-wide em-dash sweep changes every blob and no meaning. Without
   * this, the drift report can only say "the bytes moved", so those
   * reviews are either redone on every run or papered over by bumping
   * `blobSha`, which would make NOTICE.md attribute a revision the file
   * was never lifted from.
   *
   * `blobSha` therefore stays the lift record and this is the review
   * record. A file whose upstream matches this is reported as settled;
   * anything else is real drift again.
   */
  reviewedBlobSha?: string;
  /** Why the reviewed revision needed no re-lift. Shown in the report. */
  reviewedNote?: string;
}

export interface PocockSkill {
  /** Slug under templates/claude-skills/<name>/ and ~/.claude/skills/<name>/. */
  name: string;
  /** invocation declaration per praxis-ai skill-invocation-policy. */
  invocation: 'explicit' | 'reflex' | 'contextual';
  /**
   * Repo commit this skill was last lifted from, when it differs from
   * `POCOCK_REPO_COMMIT`. Skills are re-lifted one at a time as upstream
   * changes them, so a single global commit would have to either lie about
   * the skills that were not re-lifted or block the ones that were.
   */
  repoCommit?: string;
  /** Files lifted from the upstream skill directory. */
  files: PocockSkillFile[];
}

/** The commit a given skill's NOTICE.md must attribute. */
export function repoCommitFor(skill: PocockSkill): string {
  return skill.repoCommit ?? POCOCK_REPO_COMMIT;
}

export const POCOCK_SKILLS: PocockSkill[] = [
  {
    name: 'grill-with-docs',
    invocation: 'explicit',
    files: [
      {
        upstreamPath: 'skills/engineering/grill-with-docs/SKILL.md',
        blobSha: '5ea0aa913629bec683690f371839bd10e588413d',
        reviewedBlobSha: '26ac9de3bbdf49db18c7a1aa0ff508c6bf680cda',
        reviewedNote: EDITORIAL_ONLY,
        upstreamStatus: {
          kind: 'relocated',
          observedAt: POCOCK_UPSTREAM_REVIEWED_COMMIT,
          movedTo: 'docs/engineering/grill-with-docs.md',
          movedToBlobSha: '9f2f28ae0ed0d8ee5c0848f30dd44cb71db416bb',
          note: 'SKILL.md was reduced to a two-line pointer delegating to /grilling and /domain-modeling; the procedure itself moved to docs/.',
        },
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
        upstreamStatus: {
          kind: 'removed',
          observedAt: POCOCK_UPSTREAM_REVIEWED_COMMIT,
          note: 'Deleted upstream. The lifted rewrite stands on its own; NOTICE.md still records the blob it was lifted from.',
        },
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
        upstreamStatus: {
          kind: 'removed',
          observedAt: POCOCK_UPSTREAM_REVIEWED_COMMIT,
          note: 'Deleted upstream. The lifted rewrite stands on its own; NOTICE.md still records the blob it was lifted from.',
        },
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
        upstreamStatus: {
          kind: 'removed',
          observedAt: POCOCK_UPSTREAM_REVIEWED_COMMIT,
          note: 'Deleted upstream. The lifted rewrite stands on its own; NOTICE.md still records the blob it was lifted from.',
        },
      },
    ],
  },
  {
    name: 'prototype',
    invocation: 'explicit',
    repoCommit: '84fdeffd12f2ee307994d1eb6feb48173b6e0502',
    files: [
      {
        upstreamPath: 'skills/engineering/prototype/SKILL.md',
        blobSha: '094571156140f5993cce8557dc31383c82817f3e',
        reviewedBlobSha: 'a0044501fe0d385b4d8575b610188ede9b236ccf',
        reviewedNote: EDITORIAL_ONLY,
      },
      {
        upstreamPath: 'skills/engineering/prototype/LOGIC.md',
        blobSha: '5f5a3fd5a8cbd69c029854e9881ddc6e87ae5093',
        reviewedBlobSha: '32be86a0a5d9928db84b3988e55f9debe476ab40',
        reviewedNote: EDITORIAL_ONLY,
      },
      {
        upstreamPath: 'skills/engineering/prototype/UI.md',
        blobSha: '76c0f6012b016af04d6105fa696a9a0e29dfa53a',
        reviewedBlobSha: '3977951663490882c2632b40695d9f59a2fe2408',
        reviewedNote: EDITORIAL_ONLY,
      },
    ],
  },
  {
    name: 'handoff',
    invocation: 'explicit',
    repoCommit: '84fdeffd12f2ee307994d1eb6feb48173b6e0502',
    files: [
      {
        upstreamPath: 'skills/productivity/handoff/SKILL.md',
        blobSha: '043d9e13dc7eca3002a47d3ab9865c568f647863',
        reviewedBlobSha: '2eb98a51b97bb5bac461a26ad14828eeac827909',
        reviewedNote:
          'Editorial plus one terminology change at the reviewed commit: the suggested-skills ' +
          'line now says the next agent calls the Skill tool. The lifted body already names a ' +
          'suggested-skills section and already carries the redaction and no-duplication rules.',
      },
    ],
  },
];

export const POCOCK_SKILL_NAMES = POCOCK_SKILLS.map((s) => s.name);
