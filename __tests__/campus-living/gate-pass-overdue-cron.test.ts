// ============================================================================
// The overdue sweep: what it flips, and what it must leave alone.
//
// `overdue` was an UNREACHABLE status. Four surfaces read it — the queue's
// "Out now" tab, the campus-living dashboard card, the /campus-living landing
// alert and the Morning Page's gate_pass_overdue exception — and nothing set
// it, so all four were structurally zero. Not "nobody is late tonight", but
// "this number cannot move", which reads identically on a screen.
//
// The two assertions that matter most here are about what the sweep does NOT
// touch:
//
//   • `issued` — a pass whose window closed but whose holder never left. That
//     is an expired approval, not a missing person. Sweeping it would put a
//     learner asleep in their own room onto a list of people off campus, and
//     the gate scanner already reads it correctly as approved_window_closed.
//   • anything already closed — returned, cancelled, rejected.
//
// Filters are asserted rather than mocked away, because a missing `.eq`
// clause here is silent: the sweep would still return 200 and a count, and
// the damage would only surface as wrong rows on somebody's morning list.
// ============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';

type Recorded = {
  table: string;
  payload: Record<string, unknown>;
  filters: [string, unknown][];
};

let recorded: Recorded[] = [];
let returnRows: unknown[] = [];
let updateError: { message: string } | null = null;

function builder(rec: Recorded) {
  const b: Record<string, unknown> = {};
  Object.assign(b, {
    eq: (col: string, val: unknown) => {
      rec.filters.push([col, val]);
      return b;
    },
    lt: (col: string, val: unknown) => {
      rec.filters.push([`lt:${col}`, val]);
      return b;
    },
    is: (col: string, val: unknown) => {
      rec.filters.push([`is:${col}`, val]);
      return b;
    },
    select: async () => ({ data: updateError ? null : returnRows, error: updateError }),
  });
  return b as never;
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => ({
      update: (payload: Record<string, unknown>) => {
        const rec: Recorded = { table, payload, filters: [] };
        recorded.push(rec);
        return builder(rec);
      },
    }),
  }),
}));

import { GET } from '@/app/api/cron/campus-living/gate-pass-overdue/route';

const SECRET = 'test-cron-secret';

function request(opts: { secret?: string; bearer?: string } = {}) {
  const url = new URL('http://localhost:3000/api/cron/campus-living/gate-pass-overdue');
  if (opts.secret) url.searchParams.set('secret', opts.secret);
  return {
    headers: new Headers(opts.bearer ? { authorization: `Bearer ${opts.bearer}` } : {}),
    nextUrl: url,
  } as never;
}

const sweep = () => recorded.find((r) => r.table === 'hostel_gate_passes')!;
const filterFor = (key: string) => sweep().filters.find(([c]) => c === key);

beforeEach(() => {
  recorded = [];
  returnRows = [];
  updateError = null;
  process.env.CRON_SECRET = SECRET;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('authorisation', () => {
  it('refuses a caller with no secret, and writes nothing', async () => {
    const res = await GET(request());
    expect(res.status).toBe(401);
    expect(recorded).toEqual([]);
  });

  it('refuses a wrong secret', async () => {
    const res = await GET(request({ secret: 'nope' }));
    expect(res.status).toBe(401);
    expect(recorded).toEqual([]);
  });

  it('refuses everything when CRON_SECRET is not configured', async () => {
    // Otherwise an unconfigured environment would be an OPEN endpoint that
    // rewrites gate-pass statuses.
    delete process.env.CRON_SECRET;
    const res = await GET(request({ secret: 'anything' }));
    expect(res.status).toBe(401);
    expect(recorded).toEqual([]);
  });

  it('accepts the Vercel cron Bearer header', async () => {
    const res = await GET(request({ bearer: SECRET }));
    expect(res.status).toBe(200);
  });

  it('accepts the ?secret= query param for a manual run', async () => {
    const res = await GET(request({ secret: SECRET }));
    expect(res.status).toBe(200);
  });
});

describe('what the sweep touches', () => {
  it('writes only the status, nothing else', async () => {
    await GET(request({ secret: SECRET }));
    expect(sweep().payload).toEqual({ status: 'overdue' });
  });

  it('only flips passes that are ACTIVE — never an expired issued pass', async () => {
    await GET(request({ secret: SECRET }));

    // An 'issued' pass whose window closed belongs to a learner who never
    // left. Flipping it would report somebody asleep in their room as
    // missing from campus.
    expect(filterFor('status')).toEqual(['status', 'active']);
  });

  it('only flips passes whose return time has actually passed', async () => {
    await GET(request({ secret: SECRET }));

    const due = filterFor('lt:expected_return');
    expect(due, 'the sweep does not compare against expected_return at all').toBeTruthy();
    expect(new Date(due![1] as string).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('never flips a pass the learner already returned on', async () => {
    await GET(request({ secret: SECRET }));
    expect(filterFor('is:actual_return')).toEqual(['is:actual_return', null]);
  });

  it('is idempotent — it matches active and writes overdue, so a rerun finds nothing', async () => {
    await GET(request({ secret: SECRET }));
    const { filters, payload } = sweep();
    const matched = filters.find(([c]) => c === 'status')![1];
    expect(matched).not.toBe(payload.status);
  });
});

describe('what it reports', () => {
  it('reports the count and the passes it flipped', async () => {
    returnRows = [
      {
        id: 'p1',
        learner_id: 'l1',
        institution_id: 'i1',
        pass_number: 'GP-1',
        expected_return: '2026-09-12T12:00:00.000Z',
      },
      {
        id: 'p2',
        learner_id: 'l2',
        institution_id: 'i1',
        pass_number: 'GP-2',
        expected_return: '2026-09-12T13:00:00.000Z',
      },
    ];

    const body = await (await GET(request({ secret: SECRET }))).json();
    expect(body.ok).toBe(true);
    expect(body.marked_overdue).toBe(2);
    expect(body.passes).toHaveLength(2);
    expect(body.passes[0].pass_number).toBe('GP-1');
  });

  it('reports a quiet run as zero, not as a failure', async () => {
    const body = await (await GET(request({ secret: SECRET }))).json();
    expect(body.ok).toBe(true);
    expect(body.marked_overdue).toBe(0);
  });

  it('fails LOUDLY when the sweep errors, instead of reporting zero', async () => {
    // A silent failure leaves every overdue surface reading zero, which is
    // indistinguishable from "nobody is late" — the exact ambiguity this
    // route exists to remove.
    updateError = { message: 'connection reset' };

    const res = await GET(request({ secret: SECRET }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.error).toContain('connection reset');
    expect(body).not.toHaveProperty('marked_overdue');
  });
});
