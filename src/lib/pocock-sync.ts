import {
  POCOCK_SKILLS,
  POCOCK_UPSTREAM_REPO,
  type PocockSkill,
  type PocockUpstreamStatus,
} from '../data/pocock-skills.js';

/**
 * Fetcher abstraction. Tests inject a fake fetcher; production passes a
 * GitHub-API-backed implementation.
 */
export interface UpstreamFetcher {
  /**
   * Returns the current blob SHA for a file in the upstream repo at
   * `ref` (branch or commit SHA). Returns `null` if the file no longer
   * exists upstream.
   */
  fetchBlobSha(path: string, ref: string): Promise<string | null>;
}

export interface DriftEntry {
  skill: string;
  path: string;
  recordedSha: string;
  upstreamSha: string | null;
  status: 'in-sync' | 'changed' | 'removed' | 'acknowledged';
  /**
   * Present when the manifest already records a terminal or structural fact
   * about this path, so the report can separate settled history from work.
   */
  acknowledged?: PocockUpstreamStatus;
}

export interface DriftReport {
  ref: string;
  entries: DriftEntry[];
  changed: DriftEntry[];
  removed: DriftEntry[];
  inSync: DriftEntry[];
  /** Settled: upstream deleted or moved the path and the manifest says so. */
  acknowledged: DriftEntry[];
}

/**
 * Compares the manifest's recorded blob SHAs against the upstream repo at
 * `ref`. Pure function over the fetcher — testable without network.
 */
export async function detectDrift(
  fetcher: UpstreamFetcher,
  ref: string,
  skills: PocockSkill[] = POCOCK_SKILLS,
): Promise<DriftReport> {
  const entries: DriftEntry[] = [];

  for (const skill of skills) {
    for (const file of skill.files) {
      const ack = file.upstreamStatus;

      // Deleted upstream and recorded as such. Still verified rather than
      // assumed: a path that reappears is news, not settled history.
      if (ack?.kind === 'removed') {
        const upstream = await fetcher.fetchBlobSha(file.upstreamPath, ref);
        entries.push({
          skill: skill.name,
          path: file.upstreamPath,
          recordedSha: file.blobSha,
          upstreamSha: upstream,
          status: upstream === null ? 'acknowledged' : 'changed',
          acknowledged: ack,
        });
        continue;
      }

      // Upstream reorganised: the mechanism lives under a new path, so drift
      // is measured there. Otherwise a pure move reads as a deleted skill.
      if (ack?.kind === 'relocated' && ack.movedTo) {
        const baseline = ack.movedToBlobSha ?? file.blobSha;
        const upstream = await fetcher.fetchBlobSha(ack.movedTo, ref);
        let status: DriftEntry['status'];
        if (upstream === null) status = 'removed';
        else if (upstream === baseline) status = 'acknowledged';
        else status = 'changed';
        entries.push({
          skill: skill.name,
          path: ack.movedTo,
          recordedSha: baseline,
          upstreamSha: upstream,
          status,
          acknowledged: ack,
        });
        continue;
      }

      const upstream = await fetcher.fetchBlobSha(file.upstreamPath, ref);
      let status: DriftEntry['status'];
      if (upstream === null) {
        status = 'removed';
      } else if (upstream === file.blobSha) {
        status = 'in-sync';
      } else {
        status = 'changed';
      }
      entries.push({
        skill: skill.name,
        path: file.upstreamPath,
        recordedSha: file.blobSha,
        upstreamSha: upstream,
        status,
      });
    }
  }

  return {
    ref,
    entries,
    changed: entries.filter((e) => e.status === 'changed'),
    removed: entries.filter((e) => e.status === 'removed'),
    inSync: entries.filter((e) => e.status === 'in-sync'),
    acknowledged: entries.filter((e) => e.status === 'acknowledged'),
  };
}

/**
 * Default fetcher backed by GitHub's contents API via the `gh` CLI is
 * intentionally not implemented here; the CLI layer can wire either a
 * `fetch`-based or `gh`-based implementation. Keeping this module
 * dependency-free leaves it pure and testable.
 */
export interface GitHubContentsResponse {
  sha: string;
  type: string;
}

/**
 * fetch-based UpstreamFetcher using the public GitHub contents API.
 * No authentication is sent; rate-limited to 60 requests/hour unhauthenticated.
 */
export function createGitHubFetcher(repo: string = POCOCK_UPSTREAM_REPO): UpstreamFetcher {
  return {
    async fetchBlobSha(path: string, ref: string): Promise<string | null> {
      const url = `https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`;
      const res = await fetch(url, {
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (res.status === 404) return null;
      if (!res.ok) {
        throw new Error(`GitHub API ${res.status} on ${url}`);
      }
      const body = (await res.json()) as GitHubContentsResponse;
      if (body.type !== 'file' || typeof body.sha !== 'string') {
        return null;
      }
      return body.sha;
    },
  };
}

export function formatDriftReport(report: DriftReport): string {
  const lines: string[] = [];
  lines.push(`praxis sync-pocock — drift report against ${POCOCK_UPSTREAM_REPO}@${report.ref}`);
  lines.push('');
  lines.push(
    `  in-sync: ${report.inSync.length}, changed: ${report.changed.length}, ` +
      `removed: ${report.removed.length}, settled: ${report.acknowledged.length}`,
  );
  lines.push('');

  if (report.changed.length > 0) {
    lines.push('  Changed upstream since lift:');
    for (const e of report.changed) {
      lines.push(`    [${e.skill}] ${e.path}`);
      lines.push(`      recorded: ${e.recordedSha}`);
      lines.push(`      upstream: ${e.upstreamSha}`);
    }
    lines.push('');
  }

  if (report.removed.length > 0) {
    lines.push('  Removed upstream since lift:');
    for (const e of report.removed) {
      lines.push(`    [${e.skill}] ${e.path}`);
    }
    lines.push('');
  }

  // Settled history is reported, but below the actionable sections and
  // without next steps: there is no work here, and mixing it in is what made
  // earlier runs look permanently dirty.
  if (report.acknowledged.length > 0) {
    lines.push('  Settled (recorded in the manifest, no action):');
    for (const e of report.acknowledged) {
      const kind = e.acknowledged?.kind === 'relocated' ? 'moved' : 'deleted';
      lines.push(`    [${e.skill}] ${kind}: ${e.path}`);
      if (e.acknowledged?.note) lines.push(`      ${e.acknowledged.note}`);
    }
    lines.push('');
  }

  if (report.changed.length === 0 && report.removed.length === 0) {
    lines.push('  ✓ Every live lifted file matches its recorded SHA. No action needed.');
  } else {
    lines.push('  Next steps:');
    lines.push('    1. Review the upstream diff for each changed file.');
    lines.push('    2. If the upstream change preserves the mechanism, update the');
    lines.push('       lifted file in templates/claude-skills/<name>/ to match the new');
    lines.push('       intent — keep the mechanism-pure rewrite policy.');
    lines.push('    3. Bump the blob SHA in src/data/pocock-skills.ts and refresh the');
    lines.push('       NOTICE.md to record the new repo commit SHA.');
    lines.push('    4. Re-run tests.');
  }

  return lines.join('\n');
}
