import { describe, it, expect } from 'vitest';
import { detectDrift, formatDriftReport, type UpstreamFetcher } from '../../src/lib/pocock-sync.js';
import { POCOCK_SKILLS, type PocockSkill } from '../../src/data/pocock-skills.js';

/**
 * Tests use a hand-built fake fetcher so no network is touched and the
 * suite is hermetic. The praxis-ai constraint is that nothing in the
 * test suite should depend on external services or the developer's real
 * environment.
 */
class FakeFetcher implements UpstreamFetcher {
  constructor(private readonly table: Record<string, string | null>) {}
  async fetchBlobSha(path: string, _ref: string): Promise<string | null> {
    return this.table[path] ?? null;
  }
}

/**
 * Behaviour is asserted against a synthetic manifest rather than the real
 * one. Building the fixture out of POCOCK_SKILLS coupled these tests to
 * production data, so recording an upstream deletion in the manifest broke
 * unrelated assertions. The real manifest is still checked below, but only
 * for invariants that must hold whatever it contains.
 */
const LIVE_SHA = 'a'.repeat(40);
const MOVED_SHA = 'b'.repeat(40);
const GONE_SHA = 'c'.repeat(40);

const FIXTURE: PocockSkill[] = [
  {
    name: 'live-skill',
    invocation: 'explicit',
    files: [{ upstreamPath: 'skills/live/SKILL.md', blobSha: LIVE_SHA }],
  },
  {
    name: 'deleted-skill',
    invocation: 'reflex',
    files: [
      {
        upstreamPath: 'skills/deleted/SKILL.md',
        blobSha: GONE_SHA,
        upstreamStatus: {
          kind: 'removed',
          observedAt: 'deadbeef',
          note: 'Deleted upstream.',
        },
      },
    ],
  },
  {
    name: 'moved-skill',
    invocation: 'explicit',
    files: [
      {
        upstreamPath: 'skills/moved/SKILL.md',
        blobSha: 'd'.repeat(40),
        upstreamStatus: {
          kind: 'relocated',
          observedAt: 'deadbeef',
          movedTo: 'docs/moved.md',
          movedToBlobSha: MOVED_SHA,
          note: 'Prose moved to docs/.',
        },
      },
    ],
  },
];

const SETTLED_TABLE: Record<string, string | null> = {
  'skills/live/SKILL.md': LIVE_SHA,
  'skills/deleted/SKILL.md': null,
  'docs/moved.md': MOVED_SHA,
};

describe('detectDrift', () => {
  it('reports live files as in-sync and settled ones separately', async () => {
    const report = await detectDrift(new FakeFetcher(SETTLED_TABLE), 'main', FIXTURE);

    expect(report.inSync.map((e) => e.skill)).toEqual(['live-skill']);
    expect(report.changed).toEqual([]);
    expect(report.removed).toEqual([]);
    expect(report.acknowledged.map((e) => e.skill).sort()).toEqual([
      'deleted-skill',
      'moved-skill',
    ]);
    expect(report.entries.length).toBe(3);
  });

  it('flags upstream-changed files as drifted', async () => {
    const table = { ...SETTLED_TABLE, 'skills/live/SKILL.md': 'e'.repeat(40) };
    const report = await detectDrift(new FakeFetcher(table), 'main', FIXTURE);

    expect(report.changed.length).toBe(1);
    expect(report.changed[0].skill).toBe('live-skill');
    expect(report.changed[0].recordedSha).toBe(LIVE_SHA);
    expect(report.changed[0].upstreamSha).toBe('e'.repeat(40));
  });

  it('flags an unrecorded upstream deletion as removed', async () => {
    const table = { ...SETTLED_TABLE, 'skills/live/SKILL.md': null };
    const report = await detectDrift(new FakeFetcher(table), 'main', FIXTURE);

    expect(report.removed.length).toBe(1);
    expect(report.removed[0].path).toBe('skills/live/SKILL.md');
    expect(report.removed[0].upstreamSha).toBeNull();
  });

  it('measures a relocated skill against its new path, not the old one', async () => {
    const table = { ...SETTLED_TABLE, 'docs/moved.md': 'f'.repeat(40) };
    const report = await detectDrift(new FakeFetcher(table), 'main', FIXTURE);

    const moved = report.changed.find((e) => e.skill === 'moved-skill');
    expect(moved?.path).toBe('docs/moved.md');
    expect(moved?.recordedSha).toBe(MOVED_SHA);
  });

  // A path recorded as deleted that comes back is news, not settled history,
  // so the manifest must not be trusted over what upstream actually reports.
  it('re-flags a recorded deletion if the path reappears upstream', async () => {
    const table = { ...SETTLED_TABLE, 'skills/deleted/SKILL.md': 'f'.repeat(40) };
    const report = await detectDrift(new FakeFetcher(table), 'main', FIXTURE);

    expect(report.acknowledged.map((e) => e.skill)).toEqual(['moved-skill']);
    expect(report.changed.map((e) => e.skill)).toEqual(['deleted-skill']);
  });
});

describe('formatDriftReport', () => {
  it('renders an in-sync summary when only settled entries remain', async () => {
    const report = await detectDrift(new FakeFetcher(SETTLED_TABLE), 'abc123', FIXTURE);
    const out = formatDriftReport(report);

    expect(out).toContain('mattpocock/skills@abc123');
    expect(out).toContain('Every live lifted file matches');
    expect(out).toContain('Settled (recorded in the manifest, no action):');
    expect(out).toContain('deleted: skills/deleted/SKILL.md');
    expect(out).toContain('moved: docs/moved.md');
    expect(out).not.toContain('Next steps:');
  });

  it('renders a drift summary with next-steps guidance', async () => {
    const table = { ...SETTLED_TABLE, 'skills/live/SKILL.md': 'e'.repeat(40) };
    const report = await detectDrift(new FakeFetcher(table), 'main', FIXTURE);
    const out = formatDriftReport(report);

    expect(out).toContain('Changed upstream since lift:');
    expect(out).toContain('Next steps:');
    expect(out).toContain('mechanism-pure rewrite');
  });
});

describe('the shipped manifest', () => {
  it('gives every recorded upstream status an observedAt and a note', () => {
    for (const skill of POCOCK_SKILLS) {
      for (const file of skill.files) {
        const status = file.upstreamStatus;
        if (!status) continue;
        expect(status.observedAt, `${skill.name}: observedAt`).toMatch(/^[0-9a-f]{40}$/);
        expect(status.note, `${skill.name}: note`).toBeTruthy();
        if (status.kind === 'relocated') {
          expect(status.movedTo, `${skill.name}: movedTo`).toBeTruthy();
          expect(status.movedToBlobSha, `${skill.name}: movedToBlobSha`).toMatch(/^[0-9a-f]{40}$/);
        }
      }
    }
  });
});
