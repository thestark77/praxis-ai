import { describe, it, expect } from 'vitest';
import { detectDrift, formatDriftReport, type UpstreamFetcher } from '../../src/lib/pocock-sync.js';
import { POCOCK_SKILLS } from '../../src/data/pocock-skills.js';

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

describe('detectDrift', () => {
  it('reports every file as in-sync when upstream SHAs match the manifest', async () => {
    const table: Record<string, string> = {};
    for (const skill of POCOCK_SKILLS) {
      for (const file of skill.files) {
        table[file.upstreamPath] = file.blobSha;
      }
    }
    const fetcher = new FakeFetcher(table);
    const report = await detectDrift(fetcher, 'main');

    expect(report.inSync.length).toBeGreaterThan(0);
    expect(report.changed).toEqual([]);
    expect(report.removed).toEqual([]);
    // Total entries equals sum of files across all skills
    const totalFiles = POCOCK_SKILLS.reduce((acc, s) => acc + s.files.length, 0);
    expect(report.entries.length).toBe(totalFiles);
  });

  it('flags upstream-changed files as drifted', async () => {
    const table: Record<string, string> = {};
    for (const skill of POCOCK_SKILLS) {
      for (const file of skill.files) {
        table[file.upstreamPath] = file.blobSha;
      }
    }
    // Mutate one entry to simulate upstream drift.
    const target = POCOCK_SKILLS[0].files[0];
    table[target.upstreamPath] = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

    const report = await detectDrift(new FakeFetcher(table), 'main');
    expect(report.changed.length).toBe(1);
    expect(report.changed[0].skill).toBe(POCOCK_SKILLS[0].name);
    expect(report.changed[0].upstreamSha).toBe('deadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
    expect(report.changed[0].recordedSha).toBe(target.blobSha);
  });

  it('flags upstream-removed files as removed', async () => {
    const table: Record<string, string | null> = {};
    for (const skill of POCOCK_SKILLS) {
      for (const file of skill.files) {
        table[file.upstreamPath] = file.blobSha;
      }
    }
    const target = POCOCK_SKILLS[2].files[0];
    table[target.upstreamPath] = null;

    const report = await detectDrift(new FakeFetcher(table), 'main');
    expect(report.removed.length).toBe(1);
    expect(report.removed[0].path).toBe(target.upstreamPath);
    expect(report.removed[0].upstreamSha).toBeNull();
  });
});

describe('formatDriftReport', () => {
  it('renders an in-sync summary when nothing changed', async () => {
    const table: Record<string, string> = {};
    for (const skill of POCOCK_SKILLS) {
      for (const file of skill.files) {
        table[file.upstreamPath] = file.blobSha;
      }
    }
    const report = await detectDrift(new FakeFetcher(table), 'abc123');
    const out = formatDriftReport(report);
    expect(out).toContain('mattpocock/skills@abc123');
    expect(out).toContain('All lifted files match');
  });

  it('renders a drift summary with next-steps guidance', async () => {
    const table: Record<string, string> = {};
    for (const skill of POCOCK_SKILLS) {
      for (const file of skill.files) {
        table[file.upstreamPath] = file.blobSha;
      }
    }
    table[POCOCK_SKILLS[0].files[0].upstreamPath] = 'changedchangedchangedchangedchangedchange';

    const report = await detectDrift(new FakeFetcher(table), 'main');
    const out = formatDriftReport(report);
    expect(out).toContain('Changed upstream since lift:');
    expect(out).toContain('Next steps:');
    expect(out).toContain('mechanism-pure rewrite');
  });
});
