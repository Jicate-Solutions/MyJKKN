import 'server-only';

// lib/services/orchestration/pr-risk.ts
//
// Live risk classification of one pull request: reads the PR's title/draft
// flag and its changed-file list from the GitHub REST API, then hands both to
// the pure classifier in risk-tier.ts.
//
// Two consumers, two postures:
//   - the sync cron (app/api/cron/orchestration-sync) persists the result on
//     orchestration_prs so the console can show a badge without a GitHub
//     round-trip per page load;
//   - the merge action (app/api/admin/orchestration/actions/merge) classifies
//     LIVE at click time, because the stored tier may predate a push that
//     added a migration. A read failure there is a refusal, never a NORMAL.
//
// Same token, same headers, same repo constants as github-merge.ts. This file
// only READS; it never calls the merge endpoint — that stays in one place.

import { classifyRiskTier, type RiskTierResult } from './risk-tier';

const GITHUB_API = 'https://api.github.com';
const REPO_OWNER = 'Jicate-Solutions';
const REPO_NAME = 'MyJKKN';

// GitHub pages the files endpoint at 100 and caps it at 3000 files. Three
// pages is generous for this repo; a PR beyond it is classified on what was
// read (so HELD still fires) and can never be LOW — see classifyPullRequestRisk.
const FILES_PER_PAGE = 100;
const MAX_FILE_PAGES = 3;

export interface PullRequestFiles {
  files: string[];
  truncated: boolean;
}

export interface PullRequestRisk extends RiskTierResult {
  changedFilesCount: number;
  filesTruncated: boolean;
}

function ghHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

/**
 * Reads the changed file paths of a pull request. Returns `null` on ANY read
 * failure (non-200, unparseable body, thrown request) so a caller can tell
 * "no files" from "could not read" — the classifier treats those very
 * differently (empty is NORMAL; unreadable must fail closed at the caller).
 *
 * Renamed files contribute BOTH paths: a file moved out of `fees/` is still a
 * fee change.
 */
export async function fetchPullRequestFiles(
  token: string,
  prNumber: number
): Promise<PullRequestFiles | null> {
  const headers = ghHeaders(token);
  const files: string[] = [];
  try {
    for (let page = 1; page <= MAX_FILE_PAGES; page++) {
      const res = await fetch(
        `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${prNumber}/files?per_page=${FILES_PER_PAGE}&page=${page}`,
        { headers, cache: 'no-store' }
      );
      if (res.status !== 200) return null;
      const json = await res.json().catch(() => null);
      if (!Array.isArray(json)) return null;
      for (const entry of json as Array<{ filename?: unknown; previous_filename?: unknown }>) {
        if (typeof entry?.filename === 'string') files.push(entry.filename);
        if (typeof entry?.previous_filename === 'string') files.push(entry.previous_filename);
      }
      if (json.length < FILES_PER_PAGE) {
        return { files, truncated: false };
      }
    }
    // Every page came back full — there may be more we did not read.
    return { files, truncated: true };
  } catch {
    return null;
  }
}

/**
 * Classifies a PR live from GitHub. Returns `null` when the PR or its file
 * list could not be read — callers decide what "unknown" means for them (the
 * merge action refuses; the cron leaves the stored tier untouched).
 *
 * `meta` lets a caller that already holds the PR's title/draft flag (the sync
 * cron does, from the list call) skip the extra PR read.
 */
export async function classifyPullRequestRisk(
  token: string,
  prNumber: number,
  meta?: { title: string; isDraft: boolean }
): Promise<PullRequestRisk | null> {
  let resolvedMeta = meta;
  if (!resolvedMeta) {
    try {
      const res = await fetch(`${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${prNumber}`, {
        headers: ghHeaders(token),
        cache: 'no-store',
      });
      if (res.status !== 200) return null;
      const pr = (await res.json().catch(() => null)) as { title?: unknown; draft?: unknown } | null;
      if (!pr) return null;
      resolvedMeta = {
        title: typeof pr.title === 'string' ? pr.title : '',
        isDraft: pr.draft === true,
      };
    } catch {
      return null;
    }
  }

  const read = await fetchPullRequestFiles(token, prNumber);
  if (!read) return null;

  const result = classifyRiskTier(read.files, resolvedMeta);

  // A partial file list can prove HELD (one hit is enough) but can never prove
  // LOW (LOW needs EVERY file to be in the low set, and we did not see every
  // file). Downgrade to NORMAL and say why.
  if (read.truncated && result.tier === 'LOW') {
    return {
      tier: 'NORMAL',
      reasons: [`file list truncated at ${read.files.length} — cannot verify LOW`],
      changedFilesCount: read.files.length,
      filesTruncated: true,
    };
  }

  return {
    ...result,
    changedFilesCount: read.files.length,
    filesTruncated: read.truncated,
  };
}
