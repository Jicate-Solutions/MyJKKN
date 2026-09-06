/**
 * Director's Desk — the chase engine.
 *
 * Two halves:
 *
 *  1. The pure decisions (fuse limit, classification, targeting validation,
 *     copy) tested against invented inputs whose expected answers are reasoned
 *     out in the comments — NOT against the functions' own output.
 *
 *  2. The run itself, driven through an in-memory PostgREST fake that APPLIES
 *     the filters the service sends and enforces the one database constraint the
 *     design leans on (the partial unique index on notifications.idempotency_key).
 *     A fake that merely records calls would let the daily-nudge test pass while
 *     the real once-per-day guarantee was broken.
 *
 * The notification path is NOT mocked: createBellNotification runs for real
 * against the fake, so "was the person nudged" means a notifications row AND a
 * user_notifications row, which is the platform's actual bell contract.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// The service imports the meetings trigger engine (on purpose — it EXTENDS it
// rather than forking it), which transitively reaches the booking email module,
// which constructs a Resend client at import time and throws without a key.
// Nothing here sends email; a placeholder is enough to let the module load.
vi.hoisted(() => {
  process.env.RESEND_API_KEY ||= 'test-key';
});

// ---------------------------------------------------------------------------
// In-memory PostgREST fake
// ---------------------------------------------------------------------------
type Row = Record<string, any>;
let tables: Record<string, Row[]> = {};
/** Unique indexes the fake enforces: table -> columns that must be unique when non-null. */
const UNIQUE: Record<string, string[]> = { notifications: ['idempotency_key'] };
/**
 * Test seam for concurrency. Fires once, immediately AFTER a read of the named
 * table resolves — which is how you write down "somebody else changed this row
 * between the run loading it and the run acting on it" without any timing luck.
 */
let afterRead: Record<string, (() => void) | undefined> = {};
/**
 * Test seam for a failing read. Fires once, on the next SELECT of the named
 * table, and returns the given PostgREST error instead of rows — which is how
 * you write down "I could not look", the state that is indistinguishable from
 * "there was nothing there" unless the code fails closed.
 */
let failReadOnce: Record<string, { code: string; message: string } | undefined> = {};

let uuidSeq = 0;
function uuid(): string {
  uuidSeq += 1;
  const h = uuidSeq.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${h}`;
}

function makeDb(): any {
  function from(table: string) {
    const filters: Array<(r: Row) => boolean> = [];
    const orders: Array<{ col: string; asc: boolean }> = [];
    let lim: number | null = null;
    let pending: { kind: 'insert'; rows: Row[] } | { kind: 'update'; patch: Row } | null =
      null;

    const rows = () => (tables[table] ??= []);

    const matched = () => {
      let out = rows().filter((r) => filters.every((f) => f(r)));
      for (const o of [...orders].reverse()) {
        out = [...out].sort((a, b) => {
          const x = a[o.col];
          const y = b[o.col];
          return (x < y ? -1 : x > y ? 1 : 0) * (o.asc ? 1 : -1);
        });
      }
      if (lim !== null) out = out.slice(0, lim);
      return out;
    };

    /** Returns {data,error}; error mimics a 23505 on a duplicate unique value. */
    const apply = (): { data: Row[]; error: any } => {
      if (pending?.kind === 'insert') {
        const written: Row[] = [];
        for (const raw of pending.rows) {
          // created_at emulates the column's DEFAULT now(). It MUST come from the
          // simulated clock, not the wall clock. Every other timestamp in this
          // file is frozen in August 2026, and reconcileHandoverExplanations
          // anchors its audit search at `.gte('created_at', ev.created_at)` — so
          // a wall-clock stamp makes the event look NEWER than the answer that
          // came after it, and the answer becomes invisible.
          //
          // This was a real defect with a fuse on it. Written 2026-08-05 against
          // NOW=2026-08-10, the wall clock was BEHIND the simulated one, the
          // comparison held, and four tests passed. On 2026-08-10 the wall clock
          // overtook NOW and the same four went red — no code changed, the
          // calendar did. Nothing globs __tests__/director-desk/, so they stayed
          // red and unseen. A fake that reads the real clock is a test that
          // expires.
          const row = { id: raw.id ?? uuid(), created_at: NOW.toISOString(), ...raw };
          for (const col of UNIQUE[table] ?? []) {
            if (row[col] != null && rows().some((r) => r[col] === row[col])) {
              return { data: [], error: { code: '23505', message: `duplicate ${col}` } };
            }
          }
          rows().push(row);
          written.push(row);
        }
        return { data: written, error: null };
      }
      if (pending?.kind === 'update') {
        const hit = matched();
        for (const r of hit) Object.assign(r, pending.patch);
        return { data: hit, error: null };
      }
      const boom = failReadOnce[table];
      if (boom) {
        failReadOnce[table] = undefined;
        return { data: [], error: boom };
      }
      const data = matched();
      const hook = afterRead[table];
      if (hook) {
        afterRead[table] = undefined;
        hook();
      }
      return { data, error: null };
    };

    const self: any = {
      select: () => self,
      insert: (r: Row | Row[]) => {
        pending = { kind: 'insert', rows: Array.isArray(r) ? r : [r] };
        return self;
      },
      update: (patch: Row) => {
        pending = { kind: 'update', patch };
        return self;
      },
      eq: (c: string, v: unknown) => {
        filters.push((r) => r[c] === v);
        return self;
      },
      neq: (c: string, v: unknown) => {
        filters.push((r) => r[c] !== v);
        return self;
      },
      in: (c: string, vals: unknown[]) => {
        filters.push((r) => vals.includes(r[c]));
        return self;
      },
      is: (c: string, v: unknown) => {
        filters.push((r) => (v === null ? r[c] == null : r[c] === v));
        return self;
      },
      not: (c: string, op: string, v: unknown) => {
        filters.push((r) => (op === 'is' && v === null ? r[c] != null : true));
        return self;
      },
      gte: (c: string, v: any) => {
        filters.push((r) => r[c] >= v);
        return self;
      },
      or: () => self,
      order: (c: string, o?: { ascending?: boolean }) => {
        orders.push({ col: c, asc: o?.ascending !== false });
        return self;
      },
      limit: (n: number) => {
        lim = n;
        return self;
      },
      maybeSingle: () => {
        const { data, error } = apply();
        return Promise.resolve({ data: data[0] ?? null, error });
      },
      single: () => {
        const { data, error } = apply();
        return Promise.resolve({ data: data[0] ?? null, error });
      },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(apply()).then(res as any, rej),
    };
    return self;
  }

  return { from, rpc: async () => ({ data: null, error: null }) };
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => makeDb(),
}));

vi.mock('@/lib/utils/enhanced-logger', () => ({
  logger: { dev: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), log: vi.fn() },
}));

import {
  readFuseLimit,
  daysPastDue,
  classifyHandovers,
  resolveRunRecipients,
  decideExpiryAction,
  explanationFromAudit,
  resolveDirectors,
  validateTargeting,
  nudgeIdempotencyKey,
  nudgeCopy,
  runHandoverChase,
  reconcileHandoverExplanations,
  DEFAULT_MAX_RECIPIENTS,
  type HandoverRow,
  type GranteeProfile,
} from '@/lib/services/director-desk/handover-chase-service';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const DIRECTOR = '00000000-0000-4000-9000-00000000d001';
const RULE_ID = '00000000-0000-4000-9000-00000000r001';

function person(n: number): string {
  return `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`;
}

function handover(p: Partial<HandoverRow> & { id: string }): HandoverRow {
  return {
    route: '/accreditation/naac',
    title: 'NAAC criterion 3',
    grantee_user_id: person(1),
    granted_by: DIRECTOR,
    institution_id: null,
    status: 'accepted',
    due_date: '2026-08-20',
    last_activity_at: null,
    responded_at: null,
    ...p,
  };
}

/** now() fixed so "today" is deterministic. 06:00 UTC = 11:30 IST, same date. */
const NOW = new Date('2026-08-10T06:00:00.000Z');
const TODAY = '2026-08-10';

function seed(opts: { handovers?: HandoverRow[]; ruleActive?: boolean } = {}) {
  tables = {
    director_handovers: (opts.handovers ?? []).map((h) => ({ ...h, revoked_at: null })),
    director_handover_audit: [],
    profiles: [],
    notifications: [],
    user_notifications: [],
    meeting_trigger_rules: [
      {
        id: RULE_ID,
        metric_key: 'handover_overdue',
        institution_id: null,
        threshold: 1,
        active: opts.ruleActive !== false,
      },
    ],
    meeting_trigger_events: [],
    director_handover_chase_runs: [],
  };
  tables.profiles.push({
    id: DIRECTOR,
    role: 'director',
    is_active: true,
    is_super_admin: false,
    created_at: '2020-01-01',
    full_name: 'The Director',
  });
  for (const h of opts.handovers ?? []) {
    if (!tables.profiles.some((p) => p.id === h.grantee_user_id)) {
      tables.profiles.push({
        id: h.grantee_user_id,
        role: 'hod',
        is_active: true,
        is_super_admin: false,
        created_at: '2021-01-01',
        full_name: 'A colleague',
      });
    }
  }
}

const nudges = () =>
  tables.notifications.filter((n) => n.category === 'director:handover-nudge');
const bellsTo = (id: string) =>
  tables.user_notifications.filter((u) => u.user_id === id);

/**
 * Post an update the way the grantee actually can — THROUGH the status gate.
 *
 * This is the whole of defect E1 in four lines. `fn_director_handover_progress`
 * (migration 20260811100200, PR1) opens with:
 *
 *     IF v_row.status NOT IN ('pending','accepted') THEN
 *       RAISE EXCEPTION 'This handover is closed' USING ERRCODE = '22023';
 *
 * so an audit row with action='progress' CANNOT exist against a handover the
 * sweep has already marked 'expired'. The first version of this test file
 * pushed such a row straight into `tables.director_handover_audit` and never
 * touched the handover's status — it fabricated a precondition production
 * cannot produce, and certified the escalation-for-everyone bug as fixed.
 *
 * Every test below that needs an explanation goes through here instead. If the
 * sweep ever closes the handover before the window again, these throw.
 */
function postAnswer(
  handoverId: string,
  action: 'progress' | 'done' | 'declined',
  detail: Record<string, unknown>,
  actor: string,
  at: string
) {
  const h = tables.director_handovers.find((r) => r.id === handoverId);
  if (!h) throw new Error(`No such handover (42501)`);
  if (!['pending', 'accepted'].includes(h.status)) {
    throw new Error(`This handover is closed (22023) — status is '${h.status}'`);
  }
  if (action === 'done') h.status = 'done';
  if (action === 'declined') h.status = 'declined';
  h.last_activity_at = at;
  tables.director_handover_audit.push({
    id: uuid(),
    handover_id: handoverId,
    action,
    actor_user_id: actor,
    detail,
    created_at: at,
  });
}

const events = () => tables.meeting_trigger_events;

beforeEach(() => {
  uuidSeq = 0;
  afterRead = {};
  failReadOnce = {};
  delete process.env.HANDOVER_CHASE_MAX_RECIPIENTS;
  seed();
});

// ===========================================================================
// 1. Pure decisions
// ===========================================================================

describe('readFuseLimit', () => {
  it('defaults to 50 when unset or blank', () => {
    expect(readFuseLimit({})).toBe(DEFAULT_MAX_RECIPIENTS);
    expect(readFuseLimit({ HANDOVER_CHASE_MAX_RECIPIENTS: '   ' })).toBe(
      DEFAULT_MAX_RECIPIENTS
    );
  });

  it('honours a sane override', () => {
    expect(readFuseLimit({ HANDOVER_CHASE_MAX_RECIPIENTS: '5' })).toBe(5);
  });

  it('refuses to be DISABLED by a bad value — the whole point of a fuse', () => {
    // Each of these, taken literally, would either turn the fuse off (0, -1) or
    // make every comparison against NaN false, i.e. also off. The safe answer is
    // the default, never "no limit".
    for (const bad of ['0', '-1', 'lots', '12.5', 'NaN', 'Infinity']) {
      expect(readFuseLimit({ HANDOVER_CHASE_MAX_RECIPIENTS: bad })).toBe(
        DEFAULT_MAX_RECIPIENTS
      );
    }
  });
});

describe('daysPastDue', () => {
  it('is 0 on the due date, negative before, positive after', () => {
    expect(daysPastDue('2026-08-10', '2026-08-10')).toBe(0);
    expect(daysPastDue('2026-08-12', '2026-08-10')).toBe(-2);
    expect(daysPastDue('2026-08-07', '2026-08-10')).toBe(3);
  });

  it('crosses a month boundary correctly', () => {
    expect(daysPastDue('2026-07-31', '2026-08-02')).toBe(2);
  });
});

describe('classifyHandovers', () => {
  const active = (id: string): GranteeProfile => ({ id, is_active: true });

  it('keeps a handover due TODAY live — the due date is inclusive (decision 4)', () => {
    const h = handover({ id: 'a', due_date: TODAY });
    const c = classifyHandovers([h], new Map([[h.grantee_user_id, active(h.grantee_user_id)]]), TODAY);
    expect(c.live.map((x) => x.id)).toEqual(['a']);
    expect(c.expired).toEqual([]);
  });

  it('expires it the following day', () => {
    const h = handover({ id: 'a', due_date: '2026-08-09' });
    const c = classifyHandovers([h], new Map([[h.grantee_user_id, active(h.grantee_user_id)]]), TODAY);
    expect(c.expired.map((x) => x.id)).toEqual(['a']);
  });

  it('orphans a handover whose grantee is inactive', () => {
    const h = handover({ id: 'a' });
    const c = classifyHandovers(
      [h],
      new Map([[h.grantee_user_id, { id: h.grantee_user_id, is_active: false }]]),
      TODAY
    );
    expect(c.orphaned.map((x) => x.id)).toEqual(['a']);
  });

  it('orphans a handover whose grantee has no profile row at all', () => {
    // Should be impossible (FK + CASCADE) — but "the row vanished" and "they
    // left" deserve the same answer, and the alternative is an item nobody is
    // ever nudged about.
    const h = handover({ id: 'a' });
    const c = classifyHandovers([h], new Map(), TODAY);
    expect(c.orphaned.map((x) => x.id)).toEqual(['a']);
  });

  it('orphaned BEATS expired when both are true', () => {
    // Telling the Director "it expired" would hide the fact that the person is
    // gone, which is the thing he actually has to act on (decision 7).
    const h = handover({ id: 'a', due_date: '2026-01-01' });
    const c = classifyHandovers(
      [h],
      new Map([[h.grantee_user_id, { id: h.grantee_user_id, is_active: false }]]),
      TODAY
    );
    expect(c.orphaned.map((x) => x.id)).toEqual(['a']);
    expect(c.expired).toEqual([]);
  });
});

describe('resolveRunRecipients', () => {
  it('counts each person once even when they hold several handovers', () => {
    const a = handover({ id: 'a', grantee_user_id: person(1) });
    const b = handover({ id: 'b', grantee_user_id: person(1) });
    const r = resolveRunRecipients({ live: [a, b], expired: [], orphaned: [] });
    expect(r).toEqual([person(1)]);
  });

  it('does NOT write to a grantee who has left — only the person who handed it over', () => {
    const gone = handover({ id: 'a', grantee_user_id: person(9), granted_by: DIRECTOR });
    const r = resolveRunRecipients({ live: [], expired: [], orphaned: [gone] });
    expect(r).toEqual([DIRECTOR]);
    expect(r).not.toContain(person(9));
  });

  it('excludes the run-level alert audience — the fuse must mean 50 grantees', () => {
    // Defect E2. The alert audience was unioned in unconditionally, and with no
    // Director role live it resolves to up to TEN super admins — so a stated
    // ceiling of 50 was an actual ceiling of 40, and ten of the "recipients"
    // were people the run never writes to unless it halts.
    const live = Array.from({ length: 3 }, (_, i) =>
      handover({ id: `h${i}`, grantee_user_id: person(500 + i) })
    );
    const r = resolveRunRecipients({ live, expired: [], orphaned: [] });
    expect(r).toEqual([person(500), person(501), person(502)]);
    expect(r).not.toContain(DIRECTOR);
    // The signature no longer even accepts a director list, so no future edit
    // can quietly put them back.
    expect(resolveRunRecipients.length).toBe(1);
  });
});

describe('decideExpiryAction — the ordering that defect E1 got backwards', () => {
  const base = { existingEventStatus: null, ruleActive: true, overdueBy: 1, threshold: 1 };

  it('opens the window first and does NOT relabel', () => {
    expect(decideExpiryAction(base)).toBe('open_window');
  });

  it('leaves a handover alone while its window is still open', () => {
    // The load-bearing case: relabelling here is what made
    // fn_director_handover_progress raise 22023 and escalated everyone.
    expect(decideExpiryAction({ ...base, existingEventStatus: 'notified' })).toBe(
      'wait_for_window'
    );
  });

  it('relabels once the window has resolved, whichever way it went', () => {
    for (const s of ['explained', 'meeting_pending', 'booked', 'dismissed', 'expired']) {
      expect(decideExpiryAction({ ...base, existingEventStatus: s })).toBe('close_out');
    }
  });

  it('relabels immediately when no window will ever open', () => {
    // Nothing to protect: the rule is off, or its threshold puts the valve out
    // of reach. The grantee is not being asked anything, so keeping the row open
    // would buy them nothing and only delay the label.
    expect(decideExpiryAction({ ...base, ruleActive: false })).toBe('expire_now');
    expect(decideExpiryAction({ ...base, threshold: 3, overdueBy: 1 })).toBe('expire_now');
  });
});

describe('explanationFromAudit', () => {
  it('passes a progress note through verbatim', () => {
    expect(
      explanationFromAudit({ action: 'progress', detail: { note: '  Vendor quote Friday. ' } })
    ).toBe('Vendor quote Friday.');
  });

  it('says something useful when the answer was "I finished it"', () => {
    expect(explanationFromAudit({ action: 'done', detail: {} })).toBe('Marked it done.');
    expect(explanationFromAudit({ action: 'done', detail: { note: 'Submitted.' } })).toBe(
      'Submitted.'
    );
  });

  it('reads a decline reason out of `reason`, which is where the RPC puts it', () => {
    expect(
      explanationFromAudit({ action: 'declined', detail: { reason: 'not my area' } })
    ).toBe('Handed it back: not my area');
    expect(explanationFromAudit({ action: 'declined', detail: {} })).toBe('Handed it back.');
  });
});

describe('validateTargeting', () => {
  it('rejects the payloads that would silently reach nobody', () => {
    // notifications.targeting is unvalidated by the schema — each of these is
    // accepted by the database and produces a notification with no audience,
    // which looks delivered.
    expect(validateTargeting([]).ok).toBe(false);
    expect(validateTargeting([null]).ok).toBe(false);
    expect(validateTargeting(['']).ok).toBe(false);
    expect(validateTargeting('not-an-array' as unknown).ok).toBe(false);
    expect(validateTargeting(['not-a-uuid']).ok).toBe(false);
  });

  it('accepts uuids and collapses duplicates', () => {
    const r = validateTargeting([DIRECTOR, DIRECTOR, person(1)]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.userIds).toEqual([DIRECTOR, person(1)]);
  });
});

describe('nudgeIdempotencyKey', () => {
  it('changes with the day and with the handover, and nothing else', () => {
    expect(nudgeIdempotencyKey('h1', '2026-08-10')).toBe(
      'handover-chase:nudge:h1:2026-08-10'
    );
    expect(nudgeIdempotencyKey('h1', '2026-08-11')).not.toBe(
      nudgeIdempotencyKey('h1', '2026-08-10')
    );
    expect(nudgeIdempotencyKey('h2', '2026-08-10')).not.toBe(
      nudgeIdempotencyKey('h1', '2026-08-10')
    );
  });
});

describe('nudgeCopy', () => {
  it('asks a PENDING handover for an answer, not for progress (decision 8)', () => {
    const c = nudgeCopy(handover({ id: 'a', status: 'pending', due_date: '2026-08-12' }), TODAY);
    expect(c.title).toMatch(/accept or decline/i);
    expect(c.body).toMatch(/due in 2 days/);
  });

  it('asks an ACCEPTED handover for an update', () => {
    const c = nudgeCopy(handover({ id: 'a', status: 'accepted', due_date: TODAY }), TODAY);
    expect(c.title).toMatch(/Still with you/i);
    expect(c.body).toMatch(/due today/);
  });

  it('says "due tomorrow" rather than "due in 1 days"', () => {
    const c = nudgeCopy(handover({ id: 'a', due_date: '2026-08-11' }), TODAY);
    expect(c.body).toMatch(/due tomorrow/);
  });
});

// ===========================================================================
// 2. The run
// ===========================================================================

describe('runHandoverChase — the volume fuse', () => {
  it('sends NOTHING and tells the Director alone when the list exceeds the limit', async () => {
    process.env.HANDOVER_CHASE_MAX_RECIPIENTS = '5';
    // 6 live handovers held by 6 different people = 6 recipients, over the
    // limit of 5. The Director is NOT among them (defect E2): he is written to
    // only because the fuse blew, and counting the alert audience toward the
    // ceiling made the ceiling describe something other than the run.
    const hs = Array.from({ length: 6 }, (_, i) =>
      handover({ id: `h${i}`, grantee_user_id: person(100 + i) })
    );
    seed({ handovers: hs });

    const r = await runHandoverChase({ now: NOW });

    expect(r.fuse_blown).toBe(true);
    expect(r.recipients_resolved).toBe(6);
    expect(r.nudged).toBe(0);
    // Not one grantee heard anything.
    for (let i = 0; i < 6; i++) expect(bellsTo(person(100 + i))).toHaveLength(0);
    // Exactly one notification exists, and it is the Director's alert.
    expect(tables.notifications).toHaveLength(1);
    expect(tables.notifications[0].category).toBe('director:handover-chase-halted');
    expect(bellsTo(DIRECTOR)).toHaveLength(1);
  });

  it('halts the status sweep too, so a run is all-or-nothing', async () => {
    process.env.HANDOVER_CHASE_MAX_RECIPIENTS = '2';
    const hs = [
      handover({ id: 'h0', grantee_user_id: person(200), due_date: '2026-01-01' }),
      handover({ id: 'h1', grantee_user_id: person(201) }),
      handover({ id: 'h2', grantee_user_id: person(202) }),
    ];
    seed({ handovers: hs });

    await runHandoverChase({ now: NOW });

    // h0 is months past due but was NOT relabelled — access is already governed
    // live by fn_handover_grants_key, so the label can wait for a run that is
    // trustworthy.
    expect(tables.director_handovers.map((h) => h.status)).toEqual([
      'accepted',
      'accepted',
      'accepted',
    ]);
    expect(tables.director_handover_audit).toHaveLength(0);
    expect(tables.meeting_trigger_events).toHaveLength(0);
  });

  it('records the refusal, with the list it computed — in the LEDGER, not the alert', async () => {
    process.env.HANDOVER_CHASE_MAX_RECIPIENTS = '1';
    seed({
      handovers: [
        handover({ id: 'h0', grantee_user_id: person(300) }),
        handover({ id: 'h1', grantee_user_id: person(301) }),
      ],
    });

    await runHandoverChase({ now: NOW });

    expect(tables.director_handover_chase_runs).toHaveLength(1);
    const run = tables.director_handover_chase_runs[0];
    expect(run.outcome).toBe('halted_volume_fuse');
    expect(run.fuse_blown).toBe(true);
    expect(run.fuse_limit).toBe(1);
    expect(run.detail.recipient_ids).toEqual([person(300), person(301)]);

    // Defect E2: the list must NOT ride along on the notification. That alert
    // falls back to up to ten super admins when no Director can be resolved —
    // which is the live state today — so the list would be a cross-college
    // roster of who is holding what, handed to people not party to any of it.
    const alert = tables.notifications.find(
      (n) => n.category === 'director:handover-chase-halted'
    );
    expect(alert).toBeTruthy();
    expect(JSON.stringify(alert.metadata)).not.toContain(person(300));
    expect(JSON.stringify(alert.metadata)).not.toContain(person(301));
    expect(alert.body).not.toContain(person(300));
    expect(alert.metadata.resolved).toBe(2);
    expect(alert.metadata.recipient_ids_recorded_in).toBe(
      'director_handover_chase_runs.detail'
    );
  });

  it('45 grantees do NOT blow a ceiling of 50 — the alert audience is not counted', async () => {
    // Defect E2's second-order effect, in live numbers. Verified against
    // production 2026-08-05: profiles.role='director' -> 0 rows,
    // custom_roles.role_key='director' -> 0 of 85, director.handover.create ->
    // 0 of 85. So the alert audience ALWAYS resolved to super admins, and
    // getSuperAdminIds caps at SUPER_ADMIN_FANOUT_CAP = 10 of the 14 live ones.
    //
    // Unioning those 10 into the count meant 41 grantees already exceeded 50:
    // the run would have sent NOTHING to anyone and reported a "recipient
    // resolution bug" that was really just a busy desk. 45 must pass.
    const hs = Array.from({ length: 45 }, (_, i) =>
      handover({ id: `h${i}`, grantee_user_id: person(600 + i) })
    );
    seed({ handovers: hs });
    // Ten super admins, the live fallback audience.
    for (let i = 0; i < 10; i++) {
      tables.profiles.push({
        id: person(700 + i),
        role: 'admin',
        is_active: true,
        is_super_admin: true,
        created_at: `2019-01-${String(i + 1).padStart(2, '0')}`,
      });
    }
    // No Director exists — the production reality.
    tables.profiles = tables.profiles.filter((p) => p.id !== DIRECTOR);

    const r = await runHandoverChase({ now: NOW });

    expect(r.recipients_resolved).toBe(45);
    expect(r.fuse_blown).toBe(false);
    expect(r.nudged).toBe(45);
    expect(r.director_resolution).toBe('super_admin_fallback');
  });

  it('splits its lookups so a big night does not become a 414', async () => {
    // PostgREST puts an `.in(...)` list in the QUERY STRING at 37 bytes a uuid.
    // 250 held by one person is 2 recipients — the fuse holds, the run proceeds,
    // and a single unsplit lookup would be ~9 KB of URL against an 8 KB ceiling.
    // A 414 reads as "I could not look", which fails closed, which means the
    // labels silently stop being written on the busiest night.
    const hs = Array.from({ length: 250 }, (_, i) =>
      handover({ id: `h${i}`, grantee_user_id: person(1), due_date: '2026-08-07' })
    );
    seed({ handovers: hs });

    const r = await runHandoverChase({ now: NOW });

    expect(r.recipients_resolved).toBe(2); // the one grantee + the one granter
    expect(r.fuse_blown).toBe(false);
    expect(r.loaded).toBe(250);
    expect(r.overdue_opened).toBe(250);
    expect(r.errors).toEqual([]);
  });

  it('records a run that did NOT blow the fuse too', async () => {
    seed({ handovers: [handover({ id: 'h0', grantee_user_id: person(400) })] });
    await runHandoverChase({ now: NOW });
    const run = tables.director_handover_chase_runs[0];
    expect(run.outcome).toBe('sent');
    expect(run.fuse_blown).toBe(false);
    expect(run.fuse_limit).toBe(DEFAULT_MAX_RECIPIENTS);
  });
});

describe('runHandoverChase — the daily nudge (decision 10)', () => {
  it('nudges the grantee of every live handover', async () => {
    seed({
      handovers: [
        handover({ id: 'h0', grantee_user_id: person(1), status: 'pending' }),
        handover({ id: 'h1', grantee_user_id: person(2), status: 'accepted' }),
      ],
    });
    const r = await runHandoverChase({ now: NOW });
    expect(r.nudged).toBe(2);
    expect(bellsTo(person(1))).toHaveLength(1);
    expect(bellsTo(person(2))).toHaveLength(1);
  });

  it('does not nudge twice on the same day, even if the cron runs twice', async () => {
    seed({ handovers: [handover({ id: 'h0', grantee_user_id: person(1) })] });
    await runHandoverChase({ now: NOW });
    const second = await runHandoverChase({ now: NOW });

    // The DB's unique index on idempotency_key is the arbiter, not a
    // read-then-write check that two overlapping runs could both pass.
    expect(second.nudged).toBe(0);
    expect(second.already_nudged).toBe(1);
    expect(nudges()).toHaveLength(1);
  });

  it('nudges again the next day', async () => {
    seed({ handovers: [handover({ id: 'h0', grantee_user_id: person(1) })] });
    await runHandoverChase({ now: NOW });
    await runHandoverChase({ now: new Date('2026-08-11T06:00:00.000Z') });
    expect(nudges()).toHaveLength(2);
  });
});

describe('runHandoverChase — the status sweep', () => {
  it('opens the 24h valve on a past-due handover and leaves it ANSWERABLE', async () => {
    seed({
      handovers: [
        handover({ id: 'h0', grantee_user_id: person(1), due_date: '2026-08-07' }),
      ],
    });

    const r = await runHandoverChase({ now: NOW });

    // DEFECT E1. The status is deliberately NOT 'expired' yet.
    // fn_director_handover_progress raises 22023 on anything outside
    // ('pending','accepted'), so relabelling here made the explanation the very
    // next notification asks for physically impossible to write — and 24 hours
    // later everybody was escalated to a meeting regardless.
    expect(tables.director_handovers[0].status).toBe('accepted');
    expect(r.expired).toBe(0);
    expect(r.overdue_opened).toBe(1);
    expect(r.awaiting_explanation).toBe(1);
    // Proven, not asserted: the grantee's button works right now.
    expect(() =>
      postAnswer('h0', 'progress', { note: 'x' }, person(1), '2026-08-10T07:00:00.000Z')
    ).not.toThrow();

    // The trail says 'overdue', not 'expired' — the door shut on the due date
    // (fn_handover_grants_key tests the date, not the label) but the row is not
    // closed yet, and two rows claiming 'expired' would make the trail lie.
    const audit = tables.director_handover_audit.filter((a) => a.action === 'overdue');
    expect(audit).toHaveLength(1);
    expect(audit[0].detail.days_past_due).toBe(3);
    expect(
      tables.director_handover_audit.filter((a) => a.action === 'expired')
    ).toHaveLength(0);

    // The valve row is what makes decision 11's meeting happen, and it happens
    // through the EXISTING booking pass: judge -> host, notified[0] -> attendee.
    // If these two fields are wrong the meeting is booked between the wrong
    // people, silently.
    expect(events()).toHaveLength(1);
    const ev = events()[0];
    expect(ev.subject_type).toBe('handover');
    expect(ev.subject_id).toBe('h0');
    expect(ev.judge_profile_id).toBe(DIRECTOR);
    expect(ev.notified_profile_ids).toEqual([person(1)]);
    expect(ev.status).toBe('notified');
    expect(new Date(ev.explanation_deadline).getTime() - NOW.getTime()).toBe(
      24 * 60 * 60 * 1000
    );

    // And the person was told, once.
    expect(
      tables.notifications.filter((n) => n.category === 'director:handover-overdue')
    ).toHaveLength(1);
    // A past-due handover is not also nudged — it is no longer live.
    expect(nudges()).toHaveLength(0);
  });

  it('does not open a SECOND window the next night while the first is running', async () => {
    // The unique index is (rule_id, breach_date, subject_id) and breach_date
    // moves every night, so it does not stop this on its own — the subject
    // lookup does. Without it the grantee is asked again every 24h and the
    // deadline resets forever.
    seed({
      handovers: [
        handover({ id: 'h0', grantee_user_id: person(1), due_date: '2026-08-07' }),
      ],
    });
    await runHandoverChase({ now: NOW });
    const second = await runHandoverChase({ now: new Date('2026-08-11T06:00:00.000Z') });

    expect(second.overdue_opened).toBe(0);
    expect(second.awaiting_explanation).toBe(1);
    expect(events()).toHaveLength(1);
    expect(tables.director_handovers[0].status).toBe('accepted');
  });

  it('writes the label once the window has closed, not before', async () => {
    seed({
      handovers: [
        handover({ id: 'h0', grantee_user_id: person(1), due_date: '2026-08-07' }),
      ],
    });
    await runHandoverChase({ now: NOW });
    // 25 hours later: nobody said anything, so the window closes, the event goes
    // to the booking pass, and NOW the handover is relabelled.
    const r = await runHandoverChase({ now: new Date('2026-08-11T07:00:00.000Z') });

    expect(r.escalated).toBe(1);
    expect(r.expired).toBe(1);
    expect(tables.director_handovers[0].status).toBe('expired');
    expect(
      tables.director_handover_audit.filter((a) => a.action === 'expired')
    ).toHaveLength(1);
    expect(events()[0].status).toBe('meeting_pending');
  });

  it('a run whose window lookup FAILS sweeps nothing rather than guessing', async () => {
    // "No window exists" and "I could not look" produce the same empty map.
    // Acting on the first when it was the second opens a duplicate window every
    // night and resets the grantee's clock forever.
    seed({
      handovers: [
        handover({ id: 'h0', grantee_user_id: person(1), due_date: '2026-08-07' }),
      ],
    });
    await runHandoverChase({ now: NOW });
    tables.meeting_trigger_events = [];
    // Second night, with the window lookup broken.
    failReadOnce.meeting_trigger_events = { code: '57014', message: 'statement timeout' };
    const r = await runHandoverChase({ now: new Date('2026-08-11T06:00:00.000Z') });

    expect(r.overdue_opened).toBe(0);
    expect(r.expired).toBe(0);
    expect(events()).toHaveLength(0);
    expect(r.errors.join(' ')).toMatch(/load handover windows/);
    expect(tables.director_handovers[0].status).toBe('accepted');
  });

  it('does not open the valve when the rule threshold has been raised past reach', async () => {
    // A threshold above 1 switches the valve OFF rather than granting a grace
    // period: access ends at the due date, so the handover is labelled expired
    // on day 1 and never comes back round for a day-3 pass. Asserted so nobody
    // "fixes" the threshold check later believing it buys leniency.
    seed({ handovers: [handover({ id: 'h0', due_date: '2026-08-09' })] });
    tables.meeting_trigger_rules[0].threshold = 3;
    const r = await runHandoverChase({ now: NOW });
    // No window will ever open, so there is nothing to keep the row open FOR —
    // the label goes on straight away, as it always did.
    expect(r.expired).toBe(1);
    expect(tables.director_handovers[0].status).toBe('expired');
    expect(events()).toHaveLength(0);
  });

  it('does not open the valve when the rule has been switched off', async () => {
    seed({
      handovers: [handover({ id: 'h0', due_date: '2026-08-07' })],
      ruleActive: false,
    });
    const r = await runHandoverChase({ now: NOW });
    // The sweep still runs — the label and the audit trail are not the rule's
    // to withhold. Only the chasing stops.
    expect(r.expired).toBe(1);
    expect(tables.director_handovers[0].status).toBe('expired');
    expect(events()).toHaveLength(0);
  });

  it('orphans a handover whose holder has left and puts it back on the Director', async () => {
    seed({ handovers: [handover({ id: 'h0', grantee_user_id: person(1) })] });
    tables.profiles.find((p) => p.id === person(1))!.is_active = false;

    const r = await runHandoverChase({ now: NOW });

    expect(r.orphaned).toBe(1);
    expect(tables.director_handovers[0].status).toBe('orphaned');
    expect(
      tables.director_handover_audit.filter((a) => a.action === 'orphaned')
    ).toHaveLength(1);
    // The Director is told; the person who left is not written to at all.
    expect(
      tables.notifications.filter((n) => n.category === 'director:handover-orphaned')
    ).toHaveLength(1);
    expect(bellsTo(DIRECTOR)).toHaveLength(1);
    expect(bellsTo(person(1))).toHaveLength(0);
  });

  it('does not chase a handover that was closed while the run was thinking', async () => {
    // The run loads its candidates, then resolves people, then sweeps. If the
    // grantee marks it done in between, the conditional UPDATE matches no row —
    // and without reading that back, the sweep would still write an audit entry,
    // send a "past its date" notice, and 24h later book a meeting with the
    // Director about work that was already finished.
    seed({
      handovers: [
        handover({ id: 'h0', grantee_user_id: person(1), due_date: '2026-08-07' }),
      ],
    });
    // The row IS loaded as 'accepted' and IS classified as expiring — the change
    // lands the instant after the load returns, which is the only arrangement
    // that actually exercises the guard rather than the load filter.
    afterRead.director_handovers = () => {
      tables.director_handovers[0].status = 'done';
    };

    const r = await runHandoverChase({ now: NOW });
    expect(r.loaded).toBe(1); // it really was in the candidate set
    expect(r.expired).toBe(0);
    expect(tables.director_handover_audit).toHaveLength(0);
    expect(tables.meeting_trigger_events).toHaveLength(0);
    expect(tables.notifications).toHaveLength(0);
  });

  it('leaves declined / done / revoked handovers alone entirely', async () => {
    seed({ handovers: [handover({ id: 'h0', due_date: '2020-01-01' })] });
    tables.director_handovers[0].status = 'done';
    const r = await runHandoverChase({ now: NOW });
    expect(r.loaded).toBe(0);
    expect(tables.notifications).toHaveLength(0);
    expect(tables.director_handovers[0].status).toBe('done');
  });
});

describe('reconcileHandoverExplanations — decision 11 steps 2 and 3', () => {
  /**
   * Open the valve the way the ENGINE opens it — by running the sweep — rather
   * than by pushing a row in by hand.
   *
   * The first version of these tests hand-built both the event AND the
   * `action:'progress'` audit row, against a handover the fake had never marked
   * expired. Production cannot reach that state: the sweep set 'expired' before
   * opening the valve, and fn_director_handover_progress raises 22023 on any
   * status outside pending/accepted. So the test fabricated its own precondition
   * and went green over a bug that escalated every grantee to a meeting.
   */
  async function openValveByRunning() {
    seed({
      handovers: [
        handover({ id: 'h0', grantee_user_id: person(1), due_date: '2026-08-07' }),
      ],
    });
    await runHandoverChase({ now: NOW });
    expect(events()).toHaveLength(1);
    expect(events()[0].explanation_deadline).toBe('2026-08-11T06:00:00.000Z');
    return events()[0];
  }

  it('routes an explanation to the Director and STOPS escalating', async () => {
    await openValveByRunning();
    // Three hours into the window, posted THROUGH the same status gate the RPC
    // enforces. If the sweep had closed the handover first this line throws.
    postAnswer(
      'h0',
      'progress',
      { note: 'Waiting on the vendor quote, due Friday.' },
      person(1),
      '2026-08-10T09:00:00.000Z'
    );

    const r = await reconcileHandoverExplanations({ now: new Date('2026-08-12T06:00:00Z') });

    // Note the clock: it is TWO days past the deadline. An explanation that
    // arrived in time must still stop the meeting, even if the reconcile itself
    // runs late.
    expect(r.explained).toBe(1);
    expect(r.escalated).toBe(0);
    const ev = events()[0];
    expect(ev.status).toBe('explained');
    expect(ev.explanation_text).toBe('Waiting on the vendor quote, due Friday.');
    expect(ev.explained_by).toBe(person(1));
    expect(
      tables.notifications.filter((n) => n.category === 'director:handover-explained')
    ).toHaveLength(1);
    // No meeting is pending for anyone.
    expect(events().filter((e) => e.status === 'meeting_pending')).toHaveLength(0);
    // And the label the sweep held back is written now that the window is shut.
    expect(tables.director_handovers[0].status).toBe('expired');
    expect(r.relabelled).toBe(1);
  });

  it('DEFECT E1 END TO END — answer inside 24h, and no meeting is ever booked', async () => {
    // The full trace from the defect report, run forward: handover accepted,
    // due 2026-08-07. The 08-10 sweep opens the window and tells the grantee to
    // "post a short note within 24 hours". They do, at hour 3. Then the hourly
    // reconcile runs at hour 4, and again at hour 25 and hour 49 — well past
    // the deadline — and the answer must hold every time.
    await openValveByRunning();

    expect(tables.director_handovers[0].status).toBe('accepted'); // answerable
    postAnswer(
      'h0',
      'progress',
      { note: 'Two of five sections drafted; the rest by Friday.' },
      person(1),
      '2026-08-10T09:00:00.000Z'
    );

    const atHour4 = await reconcileHandoverExplanations({
      now: new Date('2026-08-10T10:00:00Z'),
    });
    expect(atHour4).toMatchObject({ explained: 1, escalated: 0, dismissed: 0 });

    for (const t of ['2026-08-11T07:00:00Z', '2026-08-12T07:00:00Z']) {
      const later = await reconcileHandoverExplanations({ now: new Date(t) });
      expect(later).toMatchObject({ explained: 0, escalated: 0 });
    }

    // Nothing anywhere is waiting to be booked.
    expect(events().filter((e) => e.status === 'meeting_pending')).toHaveLength(0);
    expect(events()[0].status).toBe('explained');
    expect(
      tables.notifications.filter((n) => n.category === 'director:handover-escalated')
    ).toHaveLength(0);
    expect(
      tables.notifications.filter((n) => n.category === 'director:handover-explained')
    ).toHaveLength(1);
  });

  it('marking it DONE inside the window is an answer too', async () => {
    // Once the relabel moved after the window, "I finished it" became reachable
    // — and escalating that to a meeting about finished work would be the same
    // bug wearing a different hat.
    await openValveByRunning();
    postAnswer('h0', 'done', { note: 'Submitted on Monday.' }, person(1), '2026-08-10T12:00:00.000Z');

    const r = await reconcileHandoverExplanations({ now: new Date('2026-08-11T07:00:00Z') });
    expect(r).toMatchObject({ explained: 1, escalated: 0 });
    expect(events()[0].explanation_text).toBe('Submitted on Monday.');
    // Already 'done' — the reconciler must not overwrite that with 'expired'.
    expect(tables.director_handovers[0].status).toBe('done');
    expect(r.relabelled).toBe(0);
  });

  it('handing it BACK inside the window is an answer too', async () => {
    await openValveByRunning();
    postAnswer(
      'h0',
      'declined',
      { reason: 'this sits with the IQAC office' },
      person(1),
      '2026-08-10T12:00:00.000Z'
    );

    const r = await reconcileHandoverExplanations({ now: new Date('2026-08-11T07:00:00Z') });
    expect(r).toMatchObject({ explained: 1, escalated: 0 });
    expect(events()[0].explanation_text).toBe('Handed it back: this sits with the IQAC office');
    expect(events()[0].status).toBe('explained');
  });

  it('ignores a progress note written BEFORE the item went overdue', async () => {
    // Otherwise a note posted a week earlier answers a question that had not
    // been asked, and the valve closes on nothing.
    seed({
      handovers: [
        handover({ id: 'h0', grantee_user_id: person(1), due_date: '2026-08-07' }),
      ],
    });
    postAnswer('h0', 'progress', { note: 'Started on this.' }, person(1), '2026-08-01T09:00:00.000Z');
    await runHandoverChase({ now: NOW });

    const r = await reconcileHandoverExplanations({ now: new Date('2026-08-12T06:00:00Z') });
    expect(r.explained).toBe(0);
    expect(r.escalated).toBe(1);
    expect(events()[0].status).toBe('meeting_pending');
  });

  it('does nothing while the window is still open', async () => {
    await openValveByRunning();
    const r = await reconcileHandoverExplanations({ now: new Date('2026-08-10T18:00:00Z') });
    expect(r).toMatchObject({ explained: 0, escalated: 0, dismissed: 0 });
    expect(events()[0].status).toBe('notified');
    // Crucially, the handover is STILL answerable while the clock runs.
    expect(tables.director_handovers[0].status).toBe('accepted');
  });

  it('escalates to meeting_pending on silence, which is what books the meeting', async () => {
    await openValveByRunning();

    const r = await reconcileHandoverExplanations({ now: new Date('2026-08-11T07:00:00Z') });

    expect(r.escalated).toBe(1);
    const ev = events()[0];
    // bookPendingMeetings() reads exactly this: status + a null booking_id.
    expect(ev.status).toBe('meeting_pending');
    expect(ev.judge_profile_id).toBe(DIRECTOR);
    expect(ev.notified_profile_ids).toEqual([person(1)]);
    expect(
      tables.notifications.filter((n) => n.category === 'director:handover-escalated')
    ).toHaveLength(1);
    expect(tables.director_handovers[0].status).toBe('expired');
  });

  it('dismisses rather than escalates when the Director took the item back', async () => {
    await openValveByRunning();
    tables.director_handovers[0].status = 'revoked';

    const r = await reconcileHandoverExplanations({ now: new Date('2026-08-11T07:00:00Z') });
    expect(r).toMatchObject({ escalated: 0, dismissed: 1 });
    expect(events()[0].status).toBe('dismissed');
    expect(
      tables.notifications.filter((n) => n.category === 'director:handover-escalated')
    ).toHaveLength(0);
  });

  it('escalates nothing when it cannot read the handovers at all', async () => {
    // An unreadable table and an empty one look identical from here. Guessing
    // "empty" books meetings about work nobody can see.
    await openValveByRunning();
    failReadOnce.director_handovers = { code: '57014', message: 'statement timeout' };
    const r = await reconcileHandoverExplanations({ now: new Date('2026-08-11T07:00:00Z') });
    expect(r).toMatchObject({ explained: 0, escalated: 0, dismissed: 0 });
    expect(r.errors.join(' ')).toMatch(/load handovers for events/);
    expect(events()[0].status).toBe('notified');
  });

  it('is safe to run repeatedly — the second pass is a no-op', async () => {
    await openValveByRunning();
    await reconcileHandoverExplanations({ now: new Date('2026-08-11T07:00:00Z') });
    const again = await reconcileHandoverExplanations({ now: new Date('2026-08-11T08:00:00Z') });
    expect(again).toMatchObject({ explained: 0, escalated: 0, dismissed: 0 });
    expect(
      tables.notifications.filter((n) => n.category === 'director:handover-escalated')
    ).toHaveLength(1);
  });
});

// ===========================================================================
// 3. Who "the Director" is (defect E2)
// ===========================================================================

describe('resolveDirectors — all three of fn_can_hand_over()\'s paths', () => {
  const CR_DIRECTOR = '00000000-0000-4000-9000-0000000000c1';
  const CR_DEAN = '00000000-0000-4000-9000-0000000000c2';

  function blankSeed() {
    seed();
    tables.profiles = [];
    tables.custom_roles = [];
    tables.user_roles = [];
  }

  function profile(id: string, role: string, extra: Record<string, unknown> = {}) {
    tables.profiles.push({
      id,
      role,
      is_active: true,
      is_super_admin: false,
      created_at: '2021-01-01',
      ...extra,
    });
  }

  it('path 1 — the legacy profiles.role string', async () => {
    blankSeed();
    profile(person(11), 'director');
    const r = await resolveDirectors(makeDb());
    expect(r.ids).toEqual([person(11)]);
    expect(r.source).toBe('director');
    expect(r.by_path.legacy_profile_role).toBe(1);
  });

  it('path 2 — a user_roles assignment to the director role', async () => {
    // The CANONICAL path, and the one the old query missed entirely. It matched
    // only profiles.role='director', so a Director assigned the role properly —
    // through Role Management, which writes user_roles — was invisible.
    blankSeed();
    profile(person(12), 'hod');
    tables.custom_roles.push({ id: CR_DIRECTOR, role_key: 'director', permissions: {} });
    tables.user_roles.push({ user_id: person(12), role_id: CR_DIRECTOR });
    const r = await resolveDirectors(makeDb());
    expect(r.ids).toEqual([person(12)]);
    expect(r.by_path.user_roles_assignment).toBe(1);
  });

  it('path 2 — a user_roles assignment to ANY role carrying director.handover.create', async () => {
    blankSeed();
    profile(person(13), 'principal');
    tables.custom_roles.push({
      id: CR_DEAN,
      role_key: 'dean',
      permissions: { 'director.handover.create': true },
    });
    tables.user_roles.push({ user_id: person(13), role_id: CR_DEAN });
    const r = await resolveDirectors(makeDb());
    expect(r.ids).toEqual([person(13)]);
  });

  it('path 3 — profiles.role names a role that carries the permission', async () => {
    blankSeed();
    profile(person(14), 'dean');
    tables.custom_roles.push({
      id: CR_DEAN,
      role_key: 'dean',
      permissions: { 'director.handover.create': true },
    });
    const r = await resolveDirectors(makeDb());
    expect(r.ids).toEqual([person(14)]);
    expect(r.by_path.profile_role_permission).toBe(1);
  });

  it('reads the permission the way the SQL does — "true" as well as true', async () => {
    // (cr.permissions->>'key')::boolean accepts the STRING "true"; a strict
    // === true in TypeScript would disagree with every RLS check on the
    // platform for exactly those rows.
    blankSeed();
    profile(person(15), 'dean');
    tables.custom_roles.push({
      id: CR_DEAN,
      role_key: 'dean',
      permissions: { 'director.handover.create': 'true' },
    });
    const r = await resolveDirectors(makeDb());
    expect(r.ids).toEqual([person(15)]);
  });

  it('uses the PROJECTED key when PostgREST supplies it', async () => {
    // The fast path. Production ships 2,877,263 bytes for the whole permissions
    // blob across 85 roles and 8,547 for this projection, and this runs nightly.
    // PostgREST returns `handover_create` as text: "true" / "false" / null.
    blankSeed();
    profile(person(19), 'dean');
    tables.custom_roles.push({
      id: CR_DEAN,
      role_key: 'dean',
      // No `permissions` at all — exactly what the projected query returns.
      handover_create: 'true',
    });
    const r = await resolveDirectors(makeDb());
    expect(r.ids).toEqual([person(19)]);
  });

  it('falls back to the full blob when the projection did not take effect', async () => {
    // The tripwire. PostgREST emits the alias on every row even when null
    // (verified 85 of 85 against production), so a MISSING alias means the
    // projection silently did not apply — and reporting "no Director" then
    // would be defect E2 all over again, from a different cause.
    blankSeed();
    profile(person(20), 'dean');
    tables.custom_roles.push({
      id: CR_DEAN,
      role_key: 'dean',
      // No `handover_create` alias -> tripwire -> re-read using `permissions`.
      permissions: { 'director.handover.create': true },
    });
    const r = await resolveDirectors(makeDb());
    expect(r.ids).toEqual([person(20)]);
  });

  it('does not count a role whose permission is false, or an inactive person', async () => {
    blankSeed();
    profile(person(16), 'dean');
    profile(person(17), 'director', { is_active: false });
    tables.custom_roles.push({
      id: CR_DEAN,
      role_key: 'dean',
      permissions: { 'director.handover.create': false },
    });
    const r = await resolveDirectors(makeDb());
    expect(r.ids).toEqual([]);
    expect(r.source).toBe('none');
  });

  it('falls back to super admins but SAYS SO — the live state today', async () => {
    // Verified live 2026-08-05: profiles.role='director' -> 0 rows,
    // custom_roles.role_key='director' -> 0 of 85, director.handover.create ->
    // 0 of 85 roles. So this is not a hypothetical branch, it is every run
    // until the role is created — and the old code could not tell it apart
    // from success.
    blankSeed();
    profile(person(18), 'admin', { is_super_admin: true, created_at: '2019-01-01' });
    const r = await resolveDirectors(makeDb());
    expect(r.ids).toEqual([person(18)]);
    expect(r.source).toBe('super_admin_fallback');
    expect(r.by_path).toEqual({
      legacy_profile_role: 0,
      user_roles_assignment: 0,
      profile_role_permission: 0,
    });
  });

  it('the run SHOUTS when it fell back, instead of fanning out quietly', async () => {
    seed({ handovers: [handover({ id: 'h0', grantee_user_id: person(1) })] });
    // Take the Director away — the production reality this feature ships into.
    tables.profiles = tables.profiles.filter((p) => p.id !== DIRECTOR);
    tables.profiles.push({
      id: person(90),
      role: 'admin',
      is_active: true,
      is_super_admin: true,
      created_at: '2019-01-01',
    });

    const r = await runHandoverChase({ now: NOW });
    expect(r.director_resolution).toBe('super_admin_fallback');
    expect(r.errors.join(' ')).toMatch(/no Director found on any of the three paths/);
    const run = tables.director_handover_chase_runs[0];
    expect(run.detail.director_resolution.source).toBe('super_admin_fallback');
    // The grantee is still nudged: a missing Director must not stop the work.
    expect(r.nudged).toBe(1);
  });
});
