import { describe, it, expect } from 'vitest';
import { detectDrift, type UpstreamFetcher } from '../../src/lib/pocock-sync.js';
import type { PocockSkill } from '../../src/data/pocock-skills.js';

// Upstream edits prose far more often than it edits behaviour. A repo-wide
// em-dash sweep moves every blob and changes no mechanism, so without a
// per-file review marker the drift report either shows permanent dirt or
// gets silenced by bumping `blobSha` — which would make NOTICE.md attribute
// a revision the file was never lifted from.

function fetcherFor(shas: Record<string, string | null>): UpstreamFetcher {
  return {
    async fetchBlobSha(path: string): Promise<string | null> {
      return path in shas ? shas[path]! : null;
    },
  };
}

const skill = (file: Partial<PocockSkill['files'][number]>): PocockSkill[] => [
  {
    name: 'prototype',
    invocation: 'explicit',
    files: [{ upstreamPath: 'skills/x/SKILL.md', blobSha: 'lift', ...file }],
  },
];

describe('a reviewed upstream revision', () => {
  it('is settled, not drift, when upstream matches the reviewed SHA', async () => {
    const report = await detectDrift(
      fetcherFor({ 'skills/x/SKILL.md': 'reviewed' }),
      'main',
      skill({ reviewedBlobSha: 'reviewed', reviewedNote: 'em dashes only' }),
    );
    expect(report.changed).toHaveLength(0);
    expect(report.acknowledged).toHaveLength(1);
    expect(report.acknowledged[0]?.reviewedNote).toBe('em dashes only');
  });

  it('is drift again once upstream moves past the reviewed revision', async () => {
    const report = await detectDrift(
      fetcherFor({ 'skills/x/SKILL.md': 'newer' }),
      'main',
      skill({ reviewedBlobSha: 'reviewed', reviewedNote: 'em dashes only' }),
    );
    expect(report.changed).toHaveLength(1);
    expect(report.acknowledged).toHaveLength(0);
  });

  it('still reports in-sync when upstream matches the lift itself', async () => {
    const report = await detectDrift(
      fetcherFor({ 'skills/x/SKILL.md': 'lift' }),
      'main',
      skill({ reviewedBlobSha: 'reviewed' }),
    );
    expect(report.inSync).toHaveLength(1);
  });

  it('leaves a file without a review marker reporting drift', async () => {
    const report = await detectDrift(
      fetcherFor({ 'skills/x/SKILL.md': 'moved' }),
      'main',
      skill({}),
    );
    expect(report.changed).toHaveLength(1);
  });

  it('does not hide an upstream deletion behind a review marker', async () => {
    const report = await detectDrift(fetcherFor({}), 'main', skill({ reviewedBlobSha: 'r' }));
    expect(report.removed).toHaveLength(1);
  });

  it('keeps the lift SHA as the attribution record', async () => {
    const report = await detectDrift(
      fetcherFor({ 'skills/x/SKILL.md': 'reviewed' }),
      'main',
      skill({ reviewedBlobSha: 'reviewed' }),
    );
    // NOTICE.md attributes what was lifted, never what was merely read.
    expect(report.acknowledged[0]?.recordedSha).toBe('lift');
  });
});
