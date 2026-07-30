/**
 * app/api/cron/rcltp-question-generate — the unattended notices.
 *
 * notify-targets.test.ts covers WHO is told. This covers the two things the
 * route itself decides: which passages the non-English scan can ever reach, and
 * which drought an empty-night notice belongs to.
 *
 * The route's helpers cannot be exported for testing — Next.js rejects any
 * export from an app/**\/route.ts that is not a recognised route field — so
 * everything is driven through GET(?mode=enqueue) against an in-memory
 * Supabase fake that actually applies the filters the route sends.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const CRON_SECRET = 'test-secret';

// ---------------------------------------------------------------------------
// In-memory PostgREST fake. Filters are APPLIED, not just recorded, so a test
// about "which rows the window can reach" is a test of behaviour.
// ---------------------------------------------------------------------------
type Row = Record<string, any>;
let tables: Record<string, Row[]> = {};

function makeAdmin() {
  function from(table: string) {
    const ops: Array<(rows: Row[]) => Row[]> = [];
    let orderCol: string | null = null;
    let asc = true;
    let lim: number | null = null;

    const run = (): Row[] => {
      let rows = [...(tables[table] ?? [])];
      for (const op of ops) rows = op(rows);
      if (orderCol) {
        const col = orderCol;
        rows.sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (asc ? 1 : -1));
      }
      if (lim !== null) rows = rows.slice(0, lim);
      return rows;
    };

    const self: any = {
      select: () => self,
      eq: (c: string, v: unknown) => {
        ops.push((rows) => rows.filter((r) => r[c] === v));
        return self;
      },
      neq: (c: string, v: unknown) => {
        ops.push((rows) => rows.filter((r) => r[c] !== v));
        return self;
      },
      in: (c: string, vals: unknown[]) => {
        ops.push((rows) => rows.filter((r) => vals.includes(r[c])));
        return self;
      },
      not: (c: string, op: string, v: unknown) => {
        ops.push((rows) => rows.filter((r) => (op === 'is' && v === null ? r[c] != null : true)));
        return self;
      },
      order: (c: string, opts?: { ascending?: boolean }) => {
        orderCol = c;
        asc = opts?.ascending !== false;
        return self;
      },
      limit: (n: number) => {
        lim = n;
        return self;
      },
      maybeSingle: () => Promise.resolve({ data: run()[0] ?? null, error: null }),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve({ data: run(), error: null }).then(res, rej),
    };
    return self;
  }

  return { from, rpc: async () => ({ data: 25, error: null }) };
}

// ---------------------------------------------------------------------------
// Mocks — everything except the route's own decisions.
// ---------------------------------------------------------------------------
const fanouts: Array<Record<string, any>> = [];

vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => makeAdmin() }));

vi.mock('@/lib/services/_shared/notifications/notify', () => ({
  fanoutNotification: vi.fn(async (_admin: unknown, opts: Record<string, any>) => {
    fanouts.push(opts);
    return { notified: (opts.userIds as string[]).length, notificationId: 'notif-1' };
  }),
}));

vi.mock('@/lib/services/platform/ai-jobs-lane', () => ({ collectJobsLane: vi.fn() }));

vi.mock('@/lib/services/rcltp/question-generation-service', () => ({
  QUESTION_GEN_JOB_TYPE: 'rcltp.question_generation',
  QUESTION_KEYCHECK_JOB_TYPE: 'rcltp.question_keycheck',
  RCLTP_QGEN_JOB_TYPES: ['rcltp.question_generation', 'rcltp.question_keycheck'],
  enqueueQuestionGeneration: vi.fn(async () => ({ ok: true })),
  enqueueKeyCheck: vi.fn(),
  loadGenPassage: vi.fn(),
  recordQuestions: vi.fn(),
  parseQuestionMessage: vi.fn(),
  parseCheckMessage: vi.fn(),
  generateQuestionsForPassage: vi.fn(),
}));

vi.mock('@/lib/services/rcltp/notify-targets', () => ({
  resolveRcltpNotifyTargets: vi.fn(
    async (_admin: unknown, opts?: { institutionId?: string | null }) => ({
      userIds: ['head-1'],
      via: 'head',
      institutionId: opts?.institutionId ?? null,
    }),
  ),
  resolveRcltpProgrammeInstitutionId: vi.fn(async () => 'inst-1'),
}));

import { GET } from '@/app/api/cron/rcltp-question-generate/route';

async function enqueueRun(query = ''): Promise<any> {
  const res = await GET(
    new NextRequest(
      `https://example.test/api/cron/rcltp-question-generate?mode=enqueue&secret=${CRON_SECRET}${query}`,
    ),
  );
  return res.json();
}

beforeEach(() => {
  process.env.CRON_SECRET = CRON_SECRET;
  fanouts.length = 0;
  tables = { rcltp_passages: [], rcltp_part_b_questions: [], ai_jobs: [], profiles: [] };
});

afterEach(() => {
  vi.useRealTimers();
});

// ===========================================================================
// The non-English window — decision 7 is worthless if it cannot reach the row
// ===========================================================================
describe('non-English scan window', () => {
  const CAP = 25;

  /** `n` approved, active Tamil passages, oldest first. */
  function seedTamil(n: number) {
    tables.rcltp_passages = Array.from({ length: n }, (_, i) => ({
      id: `ta-${String(i).padStart(3, '0')}`,
      title: `Tamil passage ${i}`,
      language: 'ta',
      status: 'approved',
      is_active: true,
      institution_id: 'inst-1',
      created_by: null,
      created_at: `2026-01-${String(i + 1).padStart(2, '0')}`,
    }));
  }

  it('reaches the 26th passage once the first 25 have been dealt with', async () => {
    seedTamil(26);
    // The first 25 already have hand-written questions — nothing left to say
    // about them. Capping the RAW scan would leave them occupying the window
    // for ever and passage 26 would never be scanned on any night.
    tables.rcltp_part_b_questions = tables.rcltp_passages
      .slice(0, 25)
      .map((p) => ({ passage_id: p.id }));

    const body = await enqueueRun();

    expect(body.non_english.found).toBe(26);
    expect(body.non_english.pending).toBe(1);
    expect(body.non_english.notified).toBe(1);
    expect(fanouts).toHaveLength(1);
    expect(fanouts[0].idempotencyKey).toBe('rcltp-qgen-lang-ta-025');
  });

  it('still caps the work it does in one night at 25', async () => {
    seedTamil(40);
    const body = await enqueueRun();
    expect(body.non_english.found).toBe(40);
    expect(body.non_english.pending).toBe(CAP);
    expect(fanouts).toHaveLength(CAP);
  });

  it('works oldest-first, so the queue drains in order', async () => {
    seedTamil(30);
    const body = await enqueueRun();
    expect(body.non_english.pending).toBe(CAP);
    expect(fanouts[0].metadata.passage_id).toBe('ta-000');
    expect(fanouts[CAP - 1].metadata.passage_id).toBe('ta-024');
  });

  it('English passages are never in this set', async () => {
    tables.rcltp_passages = [
      {
        id: 'en-1',
        title: 'An English passage',
        language: 'en',
        status: 'approved',
        is_active: true,
        institution_id: 'inst-1',
        created_by: null,
        created_at: '2026-01-01',
      },
    ];
    const body = await enqueueRun();
    expect(body.non_english.found).toBe(0);
    expect(fanouts).toHaveLength(0);
  });
});

// ===========================================================================
// Decision 7's recipient — the person who added it
// ===========================================================================
describe('who hears about a non-English passage', () => {
  function seedOne(createdBy: string | null) {
    tables.rcltp_passages = [
      {
        id: 'ta-1',
        title: 'ஒரு பாடம்',
        language: 'ta',
        status: 'approved',
        is_active: true,
        institution_id: 'inst-1',
        created_by: createdBy,
        created_at: '2026-01-01',
      },
    ];
  }

  it('tells the person who added it when created_by is recorded', async () => {
    seedOne('adder-1');
    tables.profiles = [{ id: 'adder-1', is_active: true }];

    await enqueueRun();

    expect(fanouts).toHaveLength(1);
    expect(fanouts[0].userIds).toEqual(['adder-1']);
    expect(fanouts[0].metadata.recipient_path).toBe('creator');
  });

  it('falls back to the school head when created_by is null', async () => {
    seedOne(null);

    await enqueueRun();

    expect(fanouts).toHaveLength(1);
    expect(fanouts[0].userIds).toEqual(['head-1']);
    expect(fanouts[0].metadata.recipient_path).toBe('head');
  });

  it('falls back to the school head when the adder is no longer active', async () => {
    seedOne('adder-gone');
    tables.profiles = [{ id: 'adder-gone', is_active: false }];

    await enqueueRun();

    expect(fanouts[0].userIds).toEqual(['head-1']);
    expect(fanouts[0].metadata.recipient_path).toBe('head');
  });

  it('sends nothing on ?dry=1', async () => {
    seedOne('adder-1');
    tables.profiles = [{ id: 'adder-1', is_active: true }];

    const body = await enqueueRun('&dry=1');

    expect(fanouts).toHaveLength(0);
    expect(body.non_english.would_notify).toEqual([
      { passage_id: 'ta-1', language: 'ta', via: 'creator', recipients: 1 },
    ]);
  });
});

// ===========================================================================
// The empty-night key — one drought must not back-fill onto the next
// ===========================================================================
describe('empty-streak idempotency key', () => {
  const DAY = 86_400_000;

  /** Pin the clock and say when the sweep last had something to do. */
  function droughtOf(nowIso: string, lastJobIso: string) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(nowIso));
    tables.ai_jobs = [{ job_type: 'rcltp.question_generation', requested_at: lastJobIso }];
  }

  it('keys the notice to the drought, not just to the night count', async () => {
    droughtOf('2026-01-10T02:00:00.000Z', '2026-01-07T00:00:00.000Z');
    const body = await enqueueRun();

    expect(body.empty_streak.nights).toBe(3);
    expect(body.empty_streak.alerted).toBe(true);
    expect(fanouts[0].idempotencyKey).toBe('rcltp-qgen-empty-2026-01-07-3');
    expect(fanouts[0].metadata.nights_empty).toBe(3);
    expect(fanouts[0].metadata.streak_started_on).toBe('2026-01-07');
  });

  it('a SECOND drought at night three gets its own key', async () => {
    droughtOf('2026-01-10T02:00:00.000Z', '2026-01-07T00:00:00.000Z');
    await enqueueRun();

    // Content was added, a stage-1 job ran, the streak reset, a new drought
    // began. Under `rcltp-qgen-empty-${nights}` this second night three
    // collided with the first drought's row: the idempotency pre-check found
    // it, fanned the WEEKS-OLD notification out to the new recipient, and
    // reported alerted:true.
    droughtOf('2026-03-20T02:00:00.000Z', '2026-03-17T00:00:00.000Z');
    await enqueueRun();

    expect(fanouts).toHaveLength(2);
    expect(fanouts[1].idempotencyKey).toBe('rcltp-qgen-empty-2026-03-17-3');
    expect(fanouts[1].idempotencyKey).not.toBe(fanouts[0].idempotencyKey);
  });

  it('a repeat run on the SAME night still produces the same key', async () => {
    droughtOf('2026-01-10T02:00:00.000Z', '2026-01-07T00:00:00.000Z');
    await enqueueRun();
    droughtOf('2026-01-10T22:30:00.000Z', '2026-01-07T00:00:00.000Z');
    await enqueueRun();

    expect(fanouts).toHaveLength(2);
    expect(fanouts[1].idempotencyKey).toBe(fanouts[0].idempotencyKey);
  });

  it('the weekly repeat within one drought keeps the same drought prefix', async () => {
    droughtOf('2026-01-17T02:00:00.000Z', '2026-01-07T00:00:00.000Z');
    const body = await enqueueRun();

    expect(body.empty_streak.nights).toBe(10);
    expect(fanouts[0].idempotencyKey).toBe('rcltp-qgen-empty-2026-01-07-10');
  });

  // -------------------------------------------------------------------------
  // REGRESSION GUARD. Production already holds notification
  // 785999f3-0f26-484b-8e42-b5af39727c2c with idempotency_key
  // 'rcltp-qgen-empty-3', delivered 2026-07-29 to 14 administrators. The drought
  // it belongs to began with the last stage-1 job at 2026-07-25T16:08:10Z and is
  // still running; its next due night is 10. The new key must not collide with
  // that row, or the shipped change would re-fan a stale notice.
  // -------------------------------------------------------------------------
  it('the live drought\'s night 10 cannot collide with the delivered rcltp-qgen-empty-3 row', async () => {
    droughtOf('2026-08-04T17:00:00.000Z', '2026-07-25T16:08:10.210921Z');
    const body = await enqueueRun();

    expect(body.empty_streak.nights).toBe(10);
    expect(fanouts[0].idempotencyKey).toBe('rcltp-qgen-empty-2026-07-25-10');
    expect(fanouts[0].idempotencyKey).not.toBe('rcltp-qgen-empty-3');
  });

  it('the threshold, the weekly repeat and the due nights are unchanged', async () => {
    const base = Date.parse('2026-01-07T00:00:00.000Z');
    const due: number[] = [];
    for (let n = 0; n <= 18; n++) {
      fanouts.length = 0;
      droughtOf(new Date(base + n * DAY + 2 * 3_600_000).toISOString(), '2026-01-07T00:00:00.000Z');
      const body = await enqueueRun();
      expect(body.empty_streak.nights).toBe(n);
      if (body.empty_streak.alerted) due.push(n);
    }
    expect(due).toEqual([3, 10, 17]);
  });

  it('?dry=1 reports the drought but sends nothing', async () => {
    droughtOf('2026-01-10T02:00:00.000Z', '2026-01-07T00:00:00.000Z');
    const body = await enqueueRun('&dry=1');

    expect(fanouts).toHaveLength(0);
    expect(body.empty_streak.alerted).toBe(false);
    expect(body.empty_streak.would_notify).toBe(1);
    expect(body.empty_streak.streak_started_on).toBe('2026-01-07');
  });

  it('says nothing at all when the module has never run', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-10T02:00:00.000Z'));
    tables.ai_jobs = [];

    const body = await enqueueRun();

    expect(body.empty_streak.nights).toBeNull();
    expect(body.empty_streak.reason).toBe('no prior run to measure from');
    expect(fanouts).toHaveLength(0);
  });
});
