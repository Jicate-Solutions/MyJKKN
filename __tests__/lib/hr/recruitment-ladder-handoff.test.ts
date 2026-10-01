import { describe, it, expect, vi, afterEach } from 'vitest';
import { applyLadderHandoff, ladderCoversDuty } from '@/lib/hr/recruitment/ladder-handoff';
import type { Nudge, NudgeKind } from '@/lib/hr/recruitment/harness-selection';

// ---------------------------------------------------------------------------
// A tiny fake of the Supabase client: one canned answer per table, and a log of
// which tables (and filters) were read.
// ---------------------------------------------------------------------------

type Answer = { data: unknown; error: unknown };

function fakeDb(answers: Record<string, Answer | 'throw'>) {
  const reads: { table: string; filters: Record<string, unknown> }[] = [];
  const db = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      reads.push({ table, filters });
      const q = {
        select: () => q,
        eq: (col: string, val: unknown) => {
          filters[col] = val;
          return q;
        },
        maybeSingle: async () => {
          const a = answers[table];
          if (a === 'throw') throw new Error('network down');
          return a ?? { data: null, error: null };
        },
      };
      return q;
    },
  };
  return { db: db as any, reads };
}

const switchRow = (value: unknown): Answer => ({ data: { value }, error: null });
const r5Row = (enabled: unknown): Answer => ({ data: { enabled }, error: null });

function nudge(kind: NudgeKind, ref: string): Nudge {
  return { kind, refKey: ref, candidateId: 'c1', recipients: ['u1'], title: 't', body: 'b', url: '/x' };
}

const ALL_KINDS: Nudge[] = [
  nudge('approval_reminder', 'r1'),
  nudge('approval_escalation', 'e1'),
  nudge('scorecard_missing', 's1'),
  nudge('offer_not_issued', 'o1'),
  nudge('joining_outcome_missing', 'j1'),
];

const kinds = (ns: Nudge[]) => ns.map((n) => n.kind);

afterEach(() => vi.restoreAllMocks());

describe('recruitment harness hands approval chasing to the HR chase ladder', () => {
  it('switch row missing: every nudge is still sent and the duty table is never read', async () => {
    const { db, reads } = fakeDb({ platform_policies: { data: null, error: null } });
    const out = await applyLadderHandoff(db, ALL_KINDS);
    expect(kinds(out.nudges)).toEqual(kinds(ALL_KINDS));
    expect(out.handedToLadder).toBe(0);
    expect(reads.map((r) => r.table)).toEqual(['platform_policies']);
  });

  it('switch on and R5 enabled: approval reminders and escalations go to the ladder, the rest are sent', async () => {
    const { db, reads } = fakeDb({ platform_policies: switchRow(true), hr_duty_definitions: r5Row(true) });
    const out = await applyLadderHandoff(db, ALL_KINDS);
    expect(kinds(out.nudges)).toEqual(['scorecard_missing', 'offer_not_issued', 'joining_outcome_missing']);
    expect(out.handedToLadder).toBe(2);
    expect(reads[0].filters).toEqual({ policy_key: 'hr.harness.chase.enabled', scope_type: 'global', is_active: true });
    expect(reads[1]).toEqual({ table: 'hr_duty_definitions', filters: { config_key: 'R5', is_active: true } });
  });

  it('switch on but R5 disabled: every nudge is still sent', async () => {
    const { db } = fakeDb({ platform_policies: switchRow(true), hr_duty_definitions: r5Row(false) });
    const out = await applyLadderHandoff(db, ALL_KINDS);
    expect(kinds(out.nudges)).toEqual(kinds(ALL_KINDS));
    expect(out.handedToLadder).toBe(0);
  });

  it('switch on but no active R5 row: every nudge is still sent', async () => {
    const { db } = fakeDb({ platform_policies: switchRow(true), hr_duty_definitions: { data: null, error: null } });
    const out = await applyLadderHandoff(db, ALL_KINDS);
    expect(out.handedToLadder).toBe(0);
  });

  it('switch stored as the string "true": treated as off, every nudge sent, duty table not read', async () => {
    const { db, reads } = fakeDb({ platform_policies: switchRow('true'), hr_duty_definitions: r5Row(true) });
    const out = await applyLadderHandoff(db, ALL_KINDS);
    expect(kinds(out.nudges)).toEqual(kinds(ALL_KINDS));
    expect(out.handedToLadder).toBe(0);
    expect(reads.map((r) => r.table)).toEqual(['platform_policies']);
  });

  it('switch read returns an error: every nudge is still sent, with a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { db } = fakeDb({ platform_policies: { data: null, error: { message: 'boom' } } });
    const out = await applyLadderHandoff(db, ALL_KINDS);
    expect(kinds(out.nudges)).toEqual(kinds(ALL_KINDS));
    expect(warn).toHaveBeenCalled();
  });

  it('duty read returns an error (table not there yet): every nudge is still sent', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { db } = fakeDb({
      platform_policies: switchRow(true),
      hr_duty_definitions: { data: null, error: { code: '42P01', message: 'relation does not exist' } },
    });
    const out = await applyLadderHandoff(db, ALL_KINDS);
    expect(kinds(out.nudges)).toEqual(kinds(ALL_KINDS));
    expect(warn).toHaveBeenCalled();
  });

  it('a read that throws: ladderCoversDuty answers false', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { db } = fakeDb({ platform_policies: 'throw' });
    await expect(ladderCoversDuty(db, 'R5')).resolves.toBe(false);
  });

  it('no approval nudges due: nothing is read at all', async () => {
    const { db, reads } = fakeDb({ platform_policies: switchRow(true), hr_duty_definitions: r5Row(true) });
    const only = ALL_KINDS.slice(2);
    const out = await applyLadderHandoff(db, only);
    expect(out.nudges).toEqual(only);
    expect(reads).toEqual([]);
  });
});
