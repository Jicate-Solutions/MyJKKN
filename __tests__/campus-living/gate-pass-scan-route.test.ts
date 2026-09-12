// ============================================================================
// One scan at the gate: what gets written, and what does not.
//
// The whole gate movement lives in POST /api/campus-living/gate-passes/scan
// rather than in the browser, for one measured reason: hostel_access_log's
// INSERT policy requires campus_living.gate_passes.create AND
// role_has_block_access(block_id). `gate_security` holds no `.create`, and
// role_has_block_access returns false for anyone with no user_block_access row
// — 12 grants across 5 users estate-wide, none of them gate staff. A
// browser-side log write is refused 100% of the time, silently, because an RLS
// denial on an insert arrives in `{ error }` that nobody at a gate will read.
//
// So these tests assert the contract that route now owns:
//
//   GREEN  → pass marked active, out_time set        + log row, direction exit
//   AMBER  → pass marked returned, actual_return set + log row, direction entry
//   RED    → NO pass write at all                    + log row, FLAGGED
//
// The RED case is the one worth having. A refused scan is exactly the record
// somebody will want later — "who was turned away, and when" — and it is the
// one a naive implementation drops, because nothing visibly happened.
// ============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Recording service-role client ───────────────────────────────────────────
type Write = { table: string; op: 'insert' | 'update'; payload: Record<string, unknown> };

let writes: Write[] = [];
let passRows: Record<string, unknown>[] = [];
/** null simulates "the status-scoped UPDATE matched no rows" — another gate got there first. */
let updateReturns: Record<string, unknown> | null = { id: 'pass-1' };

function builder(onWrite?: Write) {
  const b: Record<string, unknown> = {};
  const chain = () => b;
  Object.assign(b, {
    select: chain,
    eq: chain,
    in: chain,
    is: chain,
    order: chain,
    limit: chain,
    maybeSingle: async () => ({
      data: onWrite ? updateReturns : null,
      error: null,
    }),
    single: async () => ({ data: onWrite ? updateReturns : null, error: null }),
    then: (ok: (v: unknown) => unknown, no?: (e: unknown) => unknown) =>
      Promise.resolve({ data: passRows, error: null }).then(ok, no),
  });
  return b as never;
}

const serviceClient = {
  from(table: string) {
    return {
      select: () => builder(),
      insert: (payload: Record<string, unknown>) => {
        const w: Write = { table, op: 'insert', payload };
        writes.push(w);
        return builder(w);
      },
      update: (payload: Record<string, unknown>) => {
        const w: Write = { table, op: 'update', payload };
        writes.push(w);
        return builder(w);
      },
    };
  },
};

let permitted = true;

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'guard-1' } }, error: null }) },
    rpc: async (fn: string) =>
      fn === 'is_super_admin' ? { data: false, error: null } : { data: permitted, error: null },
  }),
  createServiceRoleClient: () => serviceClient,
}));

// The card resolver is exercised by its own suite; here it is a fixture, so
// these tests are about the verdict→write contract and nothing else.
let resolved: unknown = null;
vi.mock('@/lib/services/campus-living/gate-scan-service', () => ({
  resolveScannedLearner: async () => resolved,
}));

vi.mock('@/lib/utils/enhanced-logger', () => ({
  logger: { dev: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// The parent notification is fire-and-forget over HTTP; stub the fetch so the
// route does not reach out during a unit test.
vi.stubGlobal(
  'fetch',
  vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) })),
);

import { POST } from '@/app/api/campus-living/gate-passes/scan/route';

const PASSES = 'hostel_gate_passes';
const LOG = 'hostel_access_log';

const RESIDENT = {
  profileId: 'profile-1',
  learnerProfileId: 'learner-1',
  fullName: 'Aadhira K',
  photoUrl: null,
  institutionId: 'inst-1',
  blockId: 'block-1',
  subject: { kind: 'learner', lifecycleStatus: 'active', hasActiveAllocation: true },
};

/** An approved pass whose window is still open. */
const OPEN_PASS = {
  id: 'pass-1',
  status: 'issued',
  destination: 'Salem',
  expected_return: new Date(Date.now() + 6 * 3_600_000).toISOString(),
  out_time: null,
  pass_number: 'GP-1',
  institution_id: 'inst-1',
  block_id: 'block-1',
};

function request(body: unknown) {
  return {
    json: async () => body,
    headers: new Headers(),
    url: 'http://localhost:3000/api/campus-living/gate-passes/scan',
  } as never;
}

const passWrite = () => writes.find((w) => w.table === PASSES);
const logWrite = () => writes.find((w) => w.table === LOG);

beforeEach(() => {
  writes = [];
  passRows = [];
  updateReturns = { id: 'pass-1' };
  resolved = RESIDENT;
  permitted = true;
});

describe('authorisation', () => {
  it('refuses a caller without the gate write permission', async () => {
    permitted = false;
    const res = await POST(request({ code: '348295-7' }));

    expect(res.status).toBe(403);
    // Nothing at all may be written by a caller who was refused — including
    // the audit row, which would otherwise be a free write primitive.
    expect(writes).toEqual([]);
  });
});

describe('GREEN — an approved learner is marked out', () => {
  beforeEach(() => {
    passRows = [OPEN_PASS];
  });

  it('writes the exit onto the pass without a tap', async () => {
    const res = await POST(request({ code: '348295-7' }));
    const body = await res.json();

    expect(body.verdict).toBe('approved');
    expect(body.recorded).toMatchObject({ direction: 'out' });

    const w = passWrite()!;
    expect(w.op).toBe('update');
    expect(w.payload.status).toBe('active');
    expect(w.payload.out_time).toBeTruthy();
    expect(w.payload.gate_security_out).toBe('guard-1');
  });

  it('logs the movement as an exit, unflagged', async () => {
    await POST(request({ code: '348295-7' }));
    const log = logWrite()!;

    expect(log.op).toBe('insert');
    expect(log.payload.direction).toBe('exit');
    expect(log.payload.method).toBe('qr_scan');
    expect(log.payload.is_flagged).toBe(false);
    expect(log.payload.block_id).toBe('block-1');
    expect(log.payload.person_id).toBe('profile-1');
  });

  it('reports honestly when another gate already recorded it', async () => {
    // The UPDATE is status-scoped, so a second guard scanning the same learner
    // matches zero rows. Reporting "recorded" here would have the next person
    // waved through on a pass that is not in the state they think it is.
    updateReturns = null;
    const body = await (await POST(request({ code: '348295-7' }))).json();

    expect(body.recorded).toBeNull();
    expect(body.detail).toMatch(/already recorded/i);
  });
});

describe('AMBER — a learner who is already out is marked back in', () => {
  it('writes the return, not a second exit', async () => {
    passRows = [{ ...OPEN_PASS, status: 'active', out_time: new Date().toISOString() }];

    const body = await (await POST(request({ code: '348295-7' }))).json();
    expect(body.verdict).toBe('returning');
    expect(body.recorded).toMatchObject({ direction: 'in' });

    const w = passWrite()!;
    expect(w.payload.status).toBe('returned');
    expect(w.payload.actual_return).toBeTruthy();
    expect(w.payload.gate_security_in).toBe('guard-1');
    expect(w.payload).not.toHaveProperty('out_time');

    expect(logWrite()!.payload.direction).toBe('entry');
  });

  it('marks a late learner late, and still lets them in', async () => {
    passRows = [
      {
        ...OPEN_PASS,
        status: 'active',
        expected_return: new Date(Date.now() - 45 * 60_000).toISOString(),
      },
    ];

    const body = await (await POST(request({ code: '348295-7' }))).json();
    expect(body.verdict).toBe('returning');
    expect(body.recorded.isLate).toBe(true);
    expect(body.recorded.lateByMinutes).toBeGreaterThanOrEqual(44);
    // Late is a flag on the verdict, not a refusal — a late learner comes in.
    expect(passWrite()!.payload.status).toBe('returned');
  });
});

describe('RED — a refusal writes no movement, and still gets logged', () => {
  it('an unapproved learner is refused and nothing touches the pass', async () => {
    passRows = []; // nothing open

    const body = await (await POST(request({ code: '348295-7' }))).json();
    expect(body.verdict).toBe('blocked');
    expect(body.headline).toBe('GATE PASS NOT APPROVED');
    expect(body.recorded).toBeNull();
    expect(passWrite()).toBeUndefined();
  });

  it('the refusal is written to the audit log, flagged with its reason', async () => {
    passRows = [];
    await POST(request({ code: '348295-7' }));

    const log = logWrite()!;
    expect(log.payload.is_flagged).toBe(true);
    expect(log.payload.flag_reason).toBe('no_approved_pass');
    expect((log.payload.metadata as Record<string, unknown>).movement_recorded).toBe(false);
  });

  it('a team member is refused at this door, with no pass write', async () => {
    resolved = {
      ...RESIDENT,
      learnerProfileId: null,
      subject: { kind: 'team_member', isActive: true },
    };
    passRows = [OPEN_PASS];

    const body = await (await POST(request({ code: '348295-7' }))).json();
    expect(body.verdict).toBe('blocked');
    expect(body.blockedReason).toBe('not_a_learner');
    expect(passWrite()).toBeUndefined();
  });

  it('a leaver is refused even holding an open pass', async () => {
    resolved = {
      ...RESIDENT,
      subject: { kind: 'learner', lifecycleStatus: 'graduated', hasActiveAllocation: true },
    };
    passRows = [OPEN_PASS];

    const body = await (await POST(request({ code: '348295-7' }))).json();
    expect(body.blockedReason).toBe('has_left');
    expect(passWrite()).toBeUndefined();
  });
});

describe('an unrecognised card', () => {
  it('answers 200 with a verdict the guard can read, not an error', async () => {
    resolved = null;

    const res = await POST(request({ code: 'nonsense' }));
    const body = await res.json();

    // A guard needs to read this, not debug it.
    expect(res.status).toBe(200);
    expect(body.verdict).toBe('unrecognised');
    expect(writes).toEqual([]);
  });
});

describe('a learner with no block cannot be logged, and the route says so', () => {
  it('still records the movement, and reports logged:false rather than pretending', async () => {
    // hostel_access_log.block_id is NOT NULL. Inventing a block would be worse
    // than skipping the row; claiming it was written would be worse still.
    resolved = { ...RESIDENT, blockId: null };
    passRows = [OPEN_PASS];

    const body = await (await POST(request({ code: '348295-7' }))).json();
    expect(body.recorded).toMatchObject({ direction: 'out' });
    expect(body.logged).toBe(false);
    expect(logWrite()).toBeUndefined();
  });
});
