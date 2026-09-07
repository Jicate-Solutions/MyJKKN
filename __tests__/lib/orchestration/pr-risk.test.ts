/**
 * Tests for `classifyPullRequestRisk` / `fetchPullRequestFiles`
 * (lib/services/orchestration/pr-risk.ts).
 *
 * WHY THIS EXISTS
 *   The merge action decides its tier from this live read. Two failure shapes
 *   must never quietly become "safe": a GitHub read error (must be null, so
 *   the caller fails closed) and a truncated file list (may prove HELD, can
 *   never prove LOW).
 *
 * `server-only` is mocked for the same reason github-merge-ci-guard.test.ts
 * mocks it — Next.js aliases the specifier at build time.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));

import { classifyPullRequestRisk, fetchPullRequestFiles } from '@/lib/services/orchestration/pr-risk';

function jsonResponse(status: number, body: unknown) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

function stubFetch(opts: { pr?: unknown; prStatus?: number; pages?: unknown[][]; filesStatus?: number }) {
  const fetchMock = vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes('/files')) {
      if ((opts.filesStatus ?? 200) !== 200) return jsonResponse(opts.filesStatus!, { message: 'boom' });
      const page = Number(new URL(u).searchParams.get('page') ?? '1');
      return jsonResponse(200, opts.pages?.[page - 1] ?? []);
    }
    if ((opts.prStatus ?? 200) !== 200) return jsonResponse(opts.prStatus!, { message: 'nope' });
    return jsonResponse(200, opts.pr ?? { title: 'chore: x', draft: false });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchPullRequestFiles', () => {
  it('returns null on a non-200 — "could not read" is not "no files"', async () => {
    stubFetch({ filesStatus: 403 });
    expect(await fetchPullRequestFiles('t', 1)).toBeNull();
  });

  it('includes both paths of a rename', async () => {
    stubFetch({ pages: [[{ filename: 'lib/new.ts', previous_filename: 'lib/fees.ts' }]] });
    const read = await fetchPullRequestFiles('t', 1);
    expect(read).toEqual({ files: ['lib/new.ts', 'lib/fees.ts'], truncated: false });
  });

  it('flags truncation when every page came back full', async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({ filename: `docs/${i}.md` }));
    stubFetch({ pages: [full, full, full] });
    const read = await fetchPullRequestFiles('t', 1);
    expect(read?.files).toHaveLength(300);
    expect(read?.truncated).toBe(true);
  });
});

describe('classifyPullRequestRisk', () => {
  it('reads title/draft from GitHub when no meta is supplied, and classifies', async () => {
    stubFetch({ pr: { title: 'feat: payroll export', draft: false }, pages: [[{ filename: 'lib/x.ts' }]] });
    const r = await classifyPullRequestRisk('t', 7);
    expect(r?.tier).toBe('HELD');
    expect(r?.reasons).toContain("title mentions 'payroll'");
    expect(r?.changedFilesCount).toBe(1);
  });

  it('skips the PR read when meta is supplied', async () => {
    const fetchMock = stubFetch({ pages: [[{ filename: 'README.md' }]] });
    const r = await classifyPullRequestRisk('t', 7, { title: 'docs', isDraft: false });
    expect(r?.tier).toBe('LOW');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns null when the PR read fails', async () => {
    stubFetch({ prStatus: 404 });
    expect(await classifyPullRequestRisk('t', 7)).toBeNull();
  });

  it('returns null when the files read fails — caller must fail closed', async () => {
    stubFetch({ filesStatus: 500 });
    expect(await classifyPullRequestRisk('t', 7, { title: 'docs', isDraft: false })).toBeNull();
  });

  it('a truncated all-docs list is NORMAL, never LOW', async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({ filename: `docs/${i}.md` }));
    stubFetch({ pages: [full, full, full] });
    const r = await classifyPullRequestRisk('t', 7, { title: 'docs', isDraft: false });
    expect(r?.tier).toBe('NORMAL');
    expect(r?.filesTruncated).toBe(true);
    expect(r?.reasons[0]).toContain('truncated');
  });

  it('a truncated list still proves HELD', async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({ filename: `docs/${i}.md` }));
    full[50] = { filename: 'supabase/migrations/20261105000000_x.sql' };
    stubFetch({ pages: [full, full, full] });
    const r = await classifyPullRequestRisk('t', 7, { title: 'docs', isDraft: false });
    expect(r?.tier).toBe('HELD');
  });
});
