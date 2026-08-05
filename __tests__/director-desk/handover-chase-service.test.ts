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
          const row = { id: raw.id ?? uuid(), created_at: new Date().toISOString(), ...raw };
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
      return { data: matched(), error: null };
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

beforeEach(() => {
  uuidSeq = 0;
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
    const r = resolveRunRecipients({ live: [a, b], expired: [], orphaned: [] }, [DIRECTOR]);
    expect(r).toEqual([DIRECTOR, person(1)].sort());
  });

  it('does NOT write to a grantee who has left — only their Director', () => {
    const gone = handover({ id: 'a', grantee_user_id: person(9), granted_by: DIRECTOR });
    const r = resolveRunRecipients({ live: [], expired: [], orphaned: [gone] }, []);
    expect(r).toEqual([DIRECTOR]);
    expect(r).not.toContain(person(9));
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
    // 6 live handovers held by 6 different people. Plus the Director, the
    // resolved list is 7 — over the limit of 5.
    const hs = Array.from({ length: 6 }, (_, i) =>
      handover({ id: `h${i}`, grantee_user_id: person(100 + i) })
    );
    seed({ handovers: hs });

    const r = await runHandoverChase({ now: NOW });

    expect(r.fuse_blown).toBe(true);
    expect(r.recipients_resolved).toBe(7);
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

  it('records the refusal, with the list it computed', async () => {
    process.env.HANDOVER_CHASE_MAX_RECIPIENTS = '1';
    seed({ handovers: [handover({ id: 'h0', grantee_user_id: person(300) })] });

    await runHandoverChase({ now: NOW });

    expect(tables.director_handover_chase_runs).toHaveLength(1);
    const run = tables.director_handover_chase_runs[0];
    expect(run.outcome).toBe('halted_volume_fuse');
    expect(run.fuse_blown).toBe(true);
    expect(run.fuse_limit).toBe(1);
    expect(run.detail.recipient_ids).toEqual([DIRECTOR, person(300)].sort());
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
  it('expires a handover past its date and opens the 24h valve on it', async () => {
    seed({
      handovers: [
        handover({ id: 'h0', grantee_user_id: person(1), due_date: '2026-08-07' }),
      ],
    });

    const r = await runHandoverChase({ now: NOW });

    expect(r.expired).toBe(1);
    expect(tables.director_handovers[0].status).toBe('expired');

    const audit = tables.director_handover_audit.filter((a) => a.action === 'expired');
    expect(audit).toHaveLength(1);
    expect(audit[0].detail.days_past_due).toBe(3);

    // The valve row is what makes decision 11's meeting happen, and it happens
    // through the EXISTING booking pass: judge -> host, notified[0] -> attendee.
    // If these two fields are wrong the meeting is booked between the wrong
    // people, silently.
    expect(tables.meeting_trigger_events).toHaveLength(1);
    const ev = tables.meeting_trigger_events[0];
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
    // An expired handover is not also nudged — it is no longer live.
    expect(nudges()).toHaveLength(0);
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
    expect(tables.meeting_trigger_events).toHaveLength(0);
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
  function openValve(deadline: string) {
    tables.meeting_trigger_events.push({
      id: 'ev1',
      rule_id: RULE_ID,
      subject_type: 'handover',
      subject_id: 'h0',
      subject_label: 'NAAC criterion 3',
      status: 'notified',
      judge_profile_id: DIRECTOR,
      notified_profile_ids: [person(1)],
      explanation_deadline: deadline,
      created_at: '2026-08-10T06:00:00.000Z',
    });
  }

  it('routes an explanation to the Director and STOPS escalating', async () => {
    seed({ handovers: [handover({ id: 'h0', grantee_user_id: person(1) })] });
    openValve('2026-08-11T06:00:00.000Z');
    tables.director_handover_audit.push({
      id: 'a1',
      handover_id: 'h0',
      action: 'progress',
      actor_user_id: person(1),
      detail: { note: 'Waiting on the vendor quote, due Friday.' },
      created_at: '2026-08-10T09:00:00.000Z',
    });

    const r = await reconcileHandoverExplanations({ now: new Date('2026-08-12T06:00:00Z') });

    // Note the clock: it is TWO days past the deadline. An explanation that
    // arrived in time must still stop the meeting, even if the reconcile itself
    // runs late.
    expect(r.explained).toBe(1);
    expect(r.escalated).toBe(0);
    const ev = tables.meeting_trigger_events[0];
    expect(ev.status).toBe('explained');
    expect(ev.explanation_text).toBe('Waiting on the vendor quote, due Friday.');
    expect(ev.explained_by).toBe(person(1));
    expect(
      tables.notifications.filter((n) => n.category === 'director:handover-explained')
    ).toHaveLength(1);
  });

  it('ignores a progress note written BEFORE the item went overdue', async () => {
    // Otherwise a note posted a week earlier answers a question that had not
    // been asked, and the valve closes on nothing.
    seed({ handovers: [handover({ id: 'h0', grantee_user_id: person(1) })] });
    openValve('2026-08-11T06:00:00.000Z');
    tables.director_handover_audit.push({
      id: 'a1',
      handover_id: 'h0',
      action: 'progress',
      actor_user_id: person(1),
      detail: { note: 'Started on this.' },
      created_at: '2026-08-01T09:00:00.000Z',
    });

    const r = await reconcileHandoverExplanations({ now: new Date('2026-08-12T06:00:00Z') });
    expect(r.explained).toBe(0);
    expect(r.escalated).toBe(1);
    expect(tables.meeting_trigger_events[0].status).toBe('meeting_pending');
  });

  it('does nothing while the window is still open', async () => {
    seed({ handovers: [handover({ id: 'h0', grantee_user_id: person(1) })] });
    openValve('2026-08-11T06:00:00.000Z');
    const r = await reconcileHandoverExplanations({ now: new Date('2026-08-10T18:00:00Z') });
    expect(r).toMatchObject({ explained: 0, escalated: 0 });
    expect(tables.meeting_trigger_events[0].status).toBe('notified');
  });

  it('escalates to meeting_pending on silence, which is what books the meeting', async () => {
    seed({ handovers: [handover({ id: 'h0', grantee_user_id: person(1) })] });
    openValve('2026-08-11T06:00:00.000Z');

    const r = await reconcileHandoverExplanations({ now: new Date('2026-08-11T07:00:00Z') });

    expect(r.escalated).toBe(1);
    const ev = tables.meeting_trigger_events[0];
    // bookPendingMeetings() reads exactly this: status + a null booking_id.
    expect(ev.status).toBe('meeting_pending');
    expect(ev.judge_profile_id).toBe(DIRECTOR);
    expect(ev.notified_profile_ids).toEqual([person(1)]);
    expect(
      tables.notifications.filter((n) => n.category === 'director:handover-escalated')
    ).toHaveLength(1);
  });

  it('is safe to run repeatedly — the second pass is a no-op', async () => {
    seed({ handovers: [handover({ id: 'h0', grantee_user_id: person(1) })] });
    openValve('2026-08-11T06:00:00.000Z');
    await reconcileHandoverExplanations({ now: new Date('2026-08-11T07:00:00Z') });
    const again = await reconcileHandoverExplanations({ now: new Date('2026-08-11T08:00:00Z') });
    expect(again).toMatchObject({ explained: 0, escalated: 0 });
    expect(
      tables.notifications.filter((n) => n.category === 'director:handover-escalated')
    ).toHaveLength(1);
  });
});
