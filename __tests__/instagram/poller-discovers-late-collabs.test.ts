/**
 * The Instagram poller must discover posts that enter a feed LATE, without
 * re-measuring the posts it already holds, and without freezing them.
 *
 * WHY THIS EXISTS, since the diff alone does not say it. Proven 2026-10-07:
 * a youth_tn_assembly post with jkkninstitutions as collaborator (28 Sep) is
 * visible on the jkkninstitutions profile. We hold 82 jkkninstitutions posts —
 * seven from that very week — and not that one. The poller fetched with
 * `since: last_polled_at`, and a collaboration keeps its AUTHOR's timestamp,
 * so one accepted after our hourly visit arrives already "old" and a
 * since-filtered fetch never returns it.
 *
 * Dropping the filter alone would have caused two worse problems, each now
 * guarded below:
 *
 *  1. TRAFFIC. Re-measuring the whole 25-post page every hour on every account,
 *     with nine insight calls per reel, is on the order of thousands of extra
 *     Graph calls an hour. Only unknown media may be measured.
 *
 *  2. FROZEN NUMBERS. The re-poll pass skips every id it is handed. Hand it the
 *     whole fetched page and the media we chose not to re-measure are skipped by
 *     BOTH steps — every recent post's metrics silently stop updating.
 *
 * The helper is tested directly; one source guard pins the route to it, because
 * the route is a 1,500-line orchestrator with no existing test harness and a
 * mock of all of it would mostly test the mock.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { partitionFetchedMedia } from '@/lib/instagram/media-discovery';

const LAST_POLL = '2026-09-28T05:00:00.000Z';

const m = (id: string, timestamp: string) => ({ id, timestamp });

describe('which fetched media are new to us', () => {
  it('finds the collaboration accepted AFTER our last visit — the bug this fixes', () => {
    // Authored 04:00, accepted after our 05:00 visit, so it carries a timestamp
    // older than last_polled_at. A since-filtered fetch never returned it.
    const lateCollab = m('collab-28sep', '2026-09-28T04:00:00.000Z');
    const out = partitionFetchedMedia([lateCollab], new Set(), LAST_POLL);

    expect(out.newMedia.map((x) => x.id)).toEqual(['collab-28sep']);
    expect(out.lateDiscovered.map((x) => x.id)).toEqual(['collab-28sep']);
  });

  it('does NOT re-measure media we already hold — guards the traffic blow-up', () => {
    const fetched = [
      m('held-1', '2026-09-27T03:30:00.000Z'),
      m('held-2', '2026-09-29T04:30:00.000Z'),
      m('brand-new', '2026-10-06T09:00:00.000Z'),
    ];
    const out = partitionFetchedMedia(fetched, new Set(['held-1', 'held-2']), LAST_POLL);

    expect(out.newMedia.map((x) => x.id)).toEqual(['brand-new']);
  });

  it('the re-poll skip list holds ONLY what was measured — guards frozen numbers', () => {
    const fetched = [m('held-1', '2026-09-27T03:30:00.000Z'), m('brand-new', '2026-10-06T09:00:00.000Z')];
    const out = partitionFetchedMedia(fetched, new Set(['held-1']), LAST_POLL);

    // If held-1 were in the skip list, neither step would refresh it.
    expect(out.skipForRepoll.has('held-1')).toBe(false);
    expect([...out.skipForRepoll]).toEqual(['brand-new']);
  });

  it('a genuinely new post is new but NOT late', () => {
    const out = partitionFetchedMedia([m('fresh', '2026-09-28T06:00:00.000Z')], new Set(), LAST_POLL);
    expect(out.newMedia).toHaveLength(1);
    expect(out.lateDiscovered).toHaveLength(0);
  });

  it('on a first-ever poll everything is new and nothing is late', () => {
    const out = partitionFetchedMedia(
      [m('a', '2026-01-01T00:00:00.000Z'), m('b', '2026-02-01T00:00:00.000Z')],
      new Set(),
      null
    );
    expect(out.newMedia).toHaveLength(2);
    expect(out.lateDiscovered).toHaveLength(0);
  });

  it('a held post older than the last visit is neither new nor late', () => {
    const out = partitionFetchedMedia([m('old-held', '2026-09-01T00:00:00.000Z')], new Set(['old-held']), LAST_POLL);
    expect(out.newMedia).toHaveLength(0);
    expect(out.lateDiscovered).toHaveLength(0);
    expect(out.skipForRepoll.size).toBe(0);
  });
});

describe('the poller is wired to the helper', () => {
  const src = readFileSync('app/api/cron/instagram-metrics-poller/route.ts', 'utf8');

  it('no longer asks Instagram for media since the last visit', () => {
    // The getMedia call for the media page must not carry a since option.
    const fetchFn = src.slice(src.indexOf('async function fetchRecentMedia('));
    const body = fetchFn.slice(0, fetchFn.indexOf('\n}\n'));
    expect(body).not.toMatch(/since\s*:/);
  });

  it('hands the re-poll pass the measured set, not the whole fetched page', () => {
    expect(src).toMatch(/const processedMediaIds = skipForRepoll;/);
    expect(src).not.toMatch(/new Set\(fetchedMedia\.map/);
  });
});
