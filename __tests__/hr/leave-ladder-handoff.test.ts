/**
 * Hand-off between lane A's leave-deadline notices and the HR chase ladder
 * (draft PR #4152). When the ladder's master switch is the literal `true` and
 * its duty is enabled, lane A stands down its own messages for that duty:
 *   L1 → no leave_escalation notices (the status still flips to 'escalated'
 *        and the ledger row is still written, through the record function)
 *   L2 → no comp_off_expiry_7d / _2d approver nudges (the lapse notice to the
 *        claimant is unchanged)
 * Anything else — switch missing, a string "true", duty disabled, a read
 * error — and lane A sends exactly as it did before.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const notify = vi.hoisted(() => ({
  notifyLeaveEscalated: vi.fn(async () => 1),
  notifyLeaveEscalationOverflow: vi.fn(async () => 1),
  notifyCompOffExpiryNudge: vi.fn(async () => 1),
  notifyCompOffLapsed: vi.fn(async () => 1),
}));
vi.mock('@/lib/services/staff/notification-service', () => ({ StaffNotificationService: notify }));

import { runCompOffExpiryNudges, runLeaveEscalations } from '@/lib/hr/leave/deadline-runner';
import { ladderCoversDuty, LADDER_SWITCH_POLICY_KEY } from '@/lib/hr/leave/ladder-handoff';

// ---------------------------------------------------------------------------
// A small fake of the Supabase query builder: every filter is recorded, the
// table's handler answers on await or maybeSingle().
// ---------------------------------------------------------------------------

type Filters = Array<[string, string, unknown]>;
type Answer = { data: unknown; error: unknown };
type Handler = (filters: Filters) => Answer;

const ERR = { message: 'boom' };

interface Ladder {
  /** undefined = no row; 'error' = the read fails. */
  switchValue?: unknown;
  switchError?: boolean;
  /** undefined = no live row; 'error' = the read fails. */
  dutyEnabled?: unknown;
  dutyError?: boolean;
}

function fakeDb(tables: Record<string, Handler>, rpcs: Record<string, (args: any) => Answer>) {
  const reads: Array<{ table: string; filters: Filters }> = [];
  const rpcCalls: Array<{ name: string; args: any }> = [];
  const db = {
    from(table: string) {
      const filters: Filters = [];
      const answer = (): Answer => {
        reads.push({ table, filters });
        const h = tables[table];
        if (!h) throw new Error(`unexpected table ${table}`);
        return h(filters);
      };
      const b: any = {};
      for (const m of ['select', 'in', 'is', 'eq', 'gte', 'lte', 'like', 'order', 'range']) {
        b[m] = (col: unknown, val: unknown) => {
          filters.push([m, String(col), val]);
          return b;
        };
      }
      b.maybeSingle = async () => answer();
      b.then = (res: (a: Answer) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve().then(answer).then(res, rej);
      return b;
    },
    async rpc(name: string, args: any) {
      rpcCalls.push({ name, args });
      const h = rpcs[name];
      if (!h) throw new Error(`unexpected rpc ${name}`);
      return h(args);
    },
  };
  return { db: db as unknown as SupabaseClient, reads, rpcCalls };
}

function ladderTables(l: Ladder, code: string): Record<string, Handler> {
  return {
    platform_policies: (f) => {
      expect(f).toContainEqual(['eq', 'policy_key', LADDER_SWITCH_POLICY_KEY]);
      expect(f).toContainEqual(['eq', 'scope_type', 'global']);
      expect(f).toContainEqual(['eq', 'is_active', true]);
      if (l.switchError) return { data: null, error: ERR };
      return { data: l.switchValue === undefined ? null : { value: l.switchValue }, error: null };
    },
    hr_duty_definitions: (f) => {
      expect(f).toContainEqual(['eq', 'config_key', code]);
      expect(f).toContainEqual(['eq', 'is_active', true]);
      if (l.dutyError) return { data: null, error: ERR };
      return { data: l.dutyEnabled === undefined ? null : { enabled: l.dutyEnabled }, error: null };
    },
  };
}

const ON: Ladder = { switchValue: true, dutyEnabled: true };
const SENDS: Array<[string, Ladder]> = [
  ['switch row missing', {}],
  ['switch false', { switchValue: false, dutyEnabled: true }],
  ['switch is the string "true"', { switchValue: 'true', dutyEnabled: true }],
  ['switch on, duty disabled', { switchValue: true, dutyEnabled: false }],
  ['switch on, no live duty row', { switchValue: true }],
  ['switch read error', { switchError: true, dutyEnabled: true }],
  ['duty read error', { switchValue: true, dutyError: true }],
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

// ---------------------------------------------------------------------------
// L1 — leave escalations
// ---------------------------------------------------------------------------

const FILED = '2026-10-01T04:00:00.000Z';
const NOW = new Date(Date.parse(FILED) + 100 * 60 * 60 * 1000);

function leaveWorld(l: Ladder) {
  return fakeDb(
    {
      ...ladderTables(l, 'L1'),
      hr_leave_applications: () => ({
        data: [
          {
            id: 'app-1',
            employee_id: 'emp-1',
            leave_type_id: 'lt-1',
            status: 'pending',
            current_step: 0,
            approval_chain: [
              {
                step_order: 1,
                approver_role: 'hod',
                approver_user_id: null,
                status: 'pending',
                decided_at: null,
                decided_by: null,
                comment: null,
                escalate_after_hours: 48,
              },
            ],
            created_at: FILED,
            start_date: '2026-10-10',
            end_date: '2026-10-11',
            superseded_by: null,
            final_decided_at: null,
          },
        ],
        error: null,
      }),
      hr_leave_deadline_nudges: () => ({ data: [], error: null }),
      'staff': () => ({ data: [{ id: 'emp-1', first_name: 'Asha', last_name: 'R' }], error: null }),
      hr_leave_types: () => ({ data: [{ id: 'lt-1', leave_type_name: 'Casual leave' }], error: null }),
    },
    {
      fn_hr_leave_escalation_recipients: () => ({
        data: [
          { tier: 'current', user_id: 'hod', on_leave_today: false },
          { tier: 'hr', user_id: 'hrhead', on_leave_today: false },
        ],
        error: null,
      }),
      // The record function is what flips the status to 'escalated' and writes the ledger row.
      fn_hr_leave_record_escalation: () => ({ data: 'escalated', error: null }),
    }
  );
}

describe('runLeaveEscalations — ladder duty L1', () => {
  it('ladder on and L1 enabled: no notices, but the escalation is still recorded and the status flips', async () => {
    const { db, rpcCalls } = leaveWorld(ON);
    const r = await runLeaveEscalations(db, NOW);

    expect(notify.notifyLeaveEscalated).not.toHaveBeenCalled();
    expect(notify.notifyLeaveEscalationOverflow).not.toHaveBeenCalled();
    expect(r.notified).toBe(0);
    expect(r.ladder_covered).toBe(1);

    const record = rpcCalls.filter((c) => c.name === 'fn_hr_leave_record_escalation');
    expect(record).toHaveLength(1);
    expect(record[0].args).toMatchObject({ p_application_id: 'app-1', p_step_index: 0 });
    // Nobody was messaged, so the ledger records nobody as notified.
    expect(record[0].args.p_notified).toEqual([]);
    expect(r.escalated).toBe(1);
  });

  it.each(SENDS)('%s: notices go out as before', async (_label, l) => {
    const { db, rpcCalls, reads } = leaveWorld(l);
    const r = await runLeaveEscalations(db, NOW);

    expect(notify.notifyLeaveEscalated).toHaveBeenCalledTimes(2);
    expect(r.notified).toBe(2);
    expect(r.ladder_covered).toBe(0);
    expect(r.escalated).toBe(1);
    const rec = rpcCalls.filter((c) => c.name === 'fn_hr_leave_record_escalation');
    expect(rec).toHaveLength(1);
    expect(rec[0].args.p_notified).toEqual(['hod', 'hrhead']);
    if (l.switchValue !== true) {
      expect(reads.some((x) => x.table === 'hr_duty_definitions')).toBe(false);
    }
  });

  it('never looks at the ladder when nothing is overdue', async () => {
    const { db, reads } = fakeDb(
      { ...ladderTables(ON, 'L1'), hr_leave_applications: () => ({ data: [], error: null }) },
      {}
    );
    await runLeaveEscalations(db, NOW);
    expect(reads.map((x) => x.table)).toEqual(['hr_leave_applications']);
  });
});

// ---------------------------------------------------------------------------
// L2 — comp-off expiry nudges
// ---------------------------------------------------------------------------

// 2026-10-05 05:30 UTC = 11:00 IST on 5 Oct.
const CO_NOW = new Date('2026-10-05T05:30:00.000Z');

function compOffWorld(l: Ladder) {
  return fakeDb(
    {
      ...ladderTables(l, 'L2'),
      hr_comp_off_credits: (f) => {
        const status = f.find(([m, c]) => m === 'eq' && c === 'status')?.[2];
        if (status === 'pending') {
          return {
            data: [
              { id: 'c7', employee_id: 'emp-1', worked_date: '2026-09-12', expires_on: '2026-10-10' },
              { id: 'c2', employee_id: 'emp-2', worked_date: '2026-09-06', expires_on: '2026-10-06' },
            ],
            error: null,
          };
        }
        return {
          data: [{ id: 'cl', employee_id: 'emp-3', worked_date: '2026-09-01', expires_on: '2026-10-01' }],
          error: null,
        };
      },
      hr_leave_deadline_nudges: () => ({ data: [], error: null }),
      'staff': () => ({ data: [], error: null }),
    },
    {
      fn_hr_comp_off_nudge_recipients: () => ({
        data: [
          { tier: 'approver', user_id: 'appr', on_leave_today: false },
          { tier: 'claimant', user_id: 'claimant', on_leave_today: false },
        ],
        error: null,
      }),
      fn_hr_comp_off_record_nudge: () => ({ data: 'recorded', error: null }),
    }
  );
}

describe('runCompOffExpiryNudges — ladder duty L2', () => {
  it('ladder on and L2 enabled: no 7-day or 2-day approver nudges; the lapse notice still goes', async () => {
    const { db, rpcCalls } = compOffWorld(ON);
    const r = await runCompOffExpiryNudges(db, CO_NOW);

    expect(notify.notifyCompOffExpiryNudge).not.toHaveBeenCalled();
    expect(r.nudged_7d).toBe(0);
    expect(r.nudged_2d).toBe(0);
    expect(r.ladder_covered).toBe(2);
    const kinds = rpcCalls.filter((c) => c.name === 'fn_hr_comp_off_record_nudge').map((c) => c.args.p_kind);
    expect(kinds).toEqual(['comp_off_lapsed']);

    expect(notify.notifyCompOffLapsed).toHaveBeenCalledTimes(1);
    expect(r.lapse_notices).toBe(1);
  });

  it.each(SENDS)('%s: both nudges and the lapse notice go out as before', async (_label, l) => {
    const { db, reads } = compOffWorld(l);
    const r = await runCompOffExpiryNudges(db, CO_NOW);

    expect(notify.notifyCompOffExpiryNudge).toHaveBeenCalledTimes(2);
    expect(r.nudged_7d).toBe(1);
    expect(r.nudged_2d).toBe(1);
    expect(r.ladder_covered).toBe(0);
    expect(notify.notifyCompOffLapsed).toHaveBeenCalledTimes(1);
    if (l.switchValue !== true) {
      expect(reads.some((x) => x.table === 'hr_duty_definitions')).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// The reader on its own
// ---------------------------------------------------------------------------

describe('ladderCoversDuty', () => {
  it('is true only for a literal true switch and an enabled duty', async () => {
    expect(await ladderCoversDuty(fakeDb(ladderTables(ON, 'L1'), {}).db, 'L1')).toBe(true);
    for (const [, l] of SENDS) {
      expect(await ladderCoversDuty(fakeDb(ladderTables(l, 'L1'), {}).db, 'L1')).toBe(false);
    }
  });

  it('answers false and warns when the query itself throws', async () => {
    const db = {
      from() {
        throw new Error('network down');
      },
    } as unknown as SupabaseClient;
    expect(await ladderCoversDuty(db, 'L2')).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('[hr/leave-ladder-handoff]'),
      expect.objectContaining({ duty: 'L2', error: 'network down' })
    );
  });
});
