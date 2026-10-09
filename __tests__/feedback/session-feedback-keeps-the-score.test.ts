/**
 * app/api/cron/feedback-adapter-session — the learner's 1..5 score must survive
 * the copy into the feedback spine, and the copy must converge.
 *
 * WHY THIS EXISTS, since the diff alone does not say it. Measured on production
 * 2026-10-01:
 *
 *   session_feedback.understood is a SMALLINT 1..5 — the class poll seeds that
 *   question as a scale whose option labels ARE the numbers 1 to 5. The adapter's
 *   hand-written row interface declared it `boolean | null`, so the mapping was
 *   written `r.understood === true ? 1 : r.understood === false ? 0 : null`.
 *   A number is never strictly true or false, so EVERY score became NULL:
 *   0 of 67,190 ingested rows carried a rating. The scores survived only
 *   incidentally inside raw->>'understood'.
 *
 *     score 5 : 16,424     score 2 :   329
 *     score 4 : 35,213     score 1 :   205
 *     score 3 :  9,159
 *
 *   The 534 learners who answered 1 or 2 are the ones the teaching loop most
 *   needed to surface, and no screen could see them.
 *
 *   Second defect, same file: the read took the newest 1,000 source rows per run
 *   with no not-yet-ingested filter, so 148,748 of 215,938 source rows were never
 *   copied at all. It now reads a view that excludes already-ingested rows, OLDEST
 *   FIRST. Reading the base table ASC instead would be the mirror of the original
 *   bug — the same oldest 1,000 re-served for ever.
 *
 * Four things must hold, and none is provable by reading the diff:
 *
 *  1. EVERY SCORE SURVIVES, 1 THROUGH 5 — not just the extremes, and 1 must not
 *     collapse to 0 or to null. A test that only checks 5 would pass on code that
 *     mangles the low scores, which are the ones that matter.
 *  2. A LOW SCORE IS NOT FALSY-DROPPED. 1 is truthy and 0 is not a valid answer
 *     here, but any future `r.understood || null` would silently eat a real score.
 *  3. IT READS THE PENDING VIEW, OLDEST FIRST. Against the base table or newest
 *     first, the copy never converges.
 *  4. A MISSING ANSWER STAYS NULL. Not every learner answers the scale.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const CRON_SECRET = 'session-score-secret';

type Src = {
  id: string;
  institution_id: string | null;
  student_id: string | null;
  timetable_id: string | null;
  course_code: string | null;
  course_name: string | null;
  faculty_email: string | null;
  attendance_date: string | null;
  understood: number | null;
  checklist: unknown;
  free_text: string | null;
  created_at: string | null;
};

let source: Src[] = [];
/** What the route asked the database for — the subject of assertions 3. */
let readFrom: { table: string; ascending: boolean; limit: number } | null = null;
/** What the route handed the ingest layer. */
let ingested: Record<string, unknown>[] = [];

/** Ids the fake ingest has accepted — the real view hides these, so the fake must too. */
let accepted = new Set<string>();

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from(table: string) {
      const q: any = {
        _asc: false,
        select() { return q; },
        order(_c: string, o: { ascending: boolean }) { q._asc = o.ascending; return q; },
        limit(n: number) {
          readFrom = { table, ascending: q._asc, limit: n };
          // The pending-ingest view excludes rows already in the spine. Modelling
          // that is the whole point: a fake that keeps returning ingested rows
          // would let a non-converging loop pass.
          const pending = source.filter((r) => !accepted.has(r.id));
          const sorted = [...pending].sort((a, b) =>
            q._asc
              ? String(a.created_at).localeCompare(String(b.created_at))
              : String(b.created_at).localeCompare(String(a.created_at)),
          );
          return Promise.resolve({ data: sorted.slice(0, n), error: null });
        },
      };
      return q;
    },
  }),
}));

vi.mock('@/lib/services/feedback/feedback-ingest', () => ({
  ingestFeedbackEvents: async (events: Record<string, unknown>[]) => {
    ingested = ingested.concat(events);
    for (const e of events) accepted.add(String(e.source_ref));
    return { inserted: events.length, error: null };
  },
}));

function req(): NextRequest {
  return new NextRequest('https://example.test/api/cron/feedback-adapter-session', {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
}

function row(id: string, understood: number | null, free_text: string | null = null): Src {
  return {
    id,
    institution_id: 'inst-1',
    student_id: `learner-${id}`,
    timetable_id: `tt-${id}`,
    course_code: 'CSE101',
    course_name: 'Intro',
    faculty_email: 'f@jkkn.ac.in',
    attendance_date: '2026-10-01',
    understood,
    checklist: {},
    free_text,
    created_at: '2026-10-01T09:00:00.000Z',
  };
}

describe('session feedback adapter keeps the learner score', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = CRON_SECRET;
    source = [];
    ingested = [];
    accepted = new Set();
    readFrom = null;
    vi.resetModules();
  });

  it('carries every score 1 through 5 across unchanged', async () => {
    source = [1, 2, 3, 4, 5].map((n) => row(`s${n}`, n));
    const { GET } = await import('@/app/api/cron/feedback-adapter-session/route');
    await GET(req());

    expect(ingested).toHaveLength(5);
    expect(ingested.map((e) => e.rating)).toEqual([1, 2, 3, 4, 5]);
  });

  it('does not drop a score of 1 — the answer that matters most', async () => {
    source = [row('low', 1)];
    const { GET } = await import('@/app/api/cron/feedback-adapter-session/route');
    await GET(req());

    expect(ingested[0].rating).toBe(1);
    expect(ingested[0].rating).not.toBeNull();
    // The old code turned every score into null; assert the specific regression.
    expect(ingested[0].rating).not.toBe(0);
  });

  it('leaves the rating null when the learner did not answer the scale', async () => {
    source = [row('none', null, 'but I wrote a comment')];
    const { GET } = await import('@/app/api/cron/feedback-adapter-session/route');
    await GET(req());

    expect(ingested[0].rating).toBeNull();
    expect(ingested[0].content).toBe('but I wrote a comment');
  });

  it('does not take a value outside whole 1..5 as a score, but keeps it in raw', async () => {
    source = [row('zero', 0), row('six', 6), row('half', 2.5), row('ok', 4)];
    const { GET } = await import('@/app/api/cron/feedback-adapter-session/route');
    await GET(req());

    expect(ingested.map((e) => e.rating)).toEqual([null, null, null, 4]);
    expect((ingested[0].raw as Record<string, unknown>).understood).toBe(0);
    expect((ingested[1].raw as Record<string, unknown>).understood).toBe(6);
  });

  it('keeps the score in raw as well, so the two can be reconciled', async () => {
    source = [row('both', 3)];
    const { GET } = await import('@/app/api/cron/feedback-adapter-session/route');
    await GET(req());

    expect(ingested[0].rating).toBe(3);
    expect((ingested[0].raw as Record<string, unknown>).understood).toBe(3);
  });

  it('reads the not-yet-ingested view, oldest first — or the copy never converges', async () => {
    source = [row('a', 4)];
    const { GET } = await import('@/app/api/cron/feedback-adapter-session/route');
    await GET(req());

    expect(readFrom).not.toBeNull();
    expect(readFrom!.table).toBe('v_session_feedback_pending_ingest');
    expect(readFrom!.ascending).toBe(true);
    expect(readFrom!.limit).toBeGreaterThan(0);
  });

  it('copies MORE THAN ONE PAGE in a single run — a single fetch never converges', async () => {
    // Source intake is about 2,000 rows a day and this route is on no Vercel
    // schedule, so a run that stops after one page of 1,000 leaves the pending
    // set growing for ever. 2,300 rows must all land in one run.
    source = Array.from({ length: 2300 }, (_, i) => {
      const r = row(`r${String(i).padStart(4, '0')}`, (i % 5) + 1);
      r.created_at = new Date(Date.UTC(2026, 6, 1, 0, 0, i)).toISOString();
      return r;
    });

    const { GET } = await import('@/app/api/cron/feedback-adapter-session/route');
    const body = await (await GET(req())).json();

    expect(body.inserted).toBe(2300);
    expect(body.pages).toBeGreaterThan(1);
    expect(ingested).toHaveLength(2300);
    // Oldest first: the first row copied is the oldest in the source.
    expect(ingested[0].source_ref).toBe('r0000');
  });

  it('refuses an unauthenticated caller', async () => {
    source = [row('a', 4)];
    const { GET } = await import('@/app/api/cron/feedback-adapter-session/route');
    const res = await GET(new NextRequest('https://example.test/api/cron/feedback-adapter-session'));
    expect(res.status).toBe(401);
    expect(ingested).toHaveLength(0);
  });
});
