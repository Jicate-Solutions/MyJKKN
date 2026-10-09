/**
 * Multi-day comp-off claims (2026-10-05).
 *
 * One submission may carry several individual worked days. Each becomes its
 * OWN credit row — own expiry (worked day + 1 calendar month), own decision —
 * inserted in ONE statement so a refused day refuses the lot. These pin the
 * pure rules the dialog and the approvals queue are built on, and the shape of
 * the insert.
 */

import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { CompOffService } from '@/lib/services/hr/comp-off-service';
import { addOneMonth, claimBatchPosition, claimDayProblem, priorClaimStatus } from '@/types/hr-comp-off';

const TODAY = '2026-10-05';
const free = { clash: null };

describe('claimDayProblem — why one picked day cannot be claimed', () => {
  it('accepts a recent worked day', () => {
    expect(claimDayProblem('2026-09-21', TODAY, free)).toBeNull();
  });

  it('refuses a future day', () => {
    expect(claimDayProblem('2026-10-06', TODAY, free)).toMatch(/not worked yet/i);
  });

  it('refuses a day whose one-month credit already lapsed', () => {
    // 2026-09-04 + 1 month = 2026-10-04 < today
    expect(claimDayProblem('2026-09-04', TODAY, free)).toMatch(/expired on 04\/10\/2026/);
  });

  it('accepts the last day of the window (expires today)', () => {
    expect(claimDayProblem('2026-09-05', TODAY, free)).toBeNull();
  });

  it('refuses an occupied day, naming the clash', () => {
    expect(
      claimDayProblem('2026-09-21', TODAY, { clash: 'Casual Leave on 21/09/2026' })
    ).toMatch(/Casual Leave on 21\/09\/2026/);
  });
});

describe('per-day validity', () => {
  it('each day expires one calendar month after itself, clamped to month end', () => {
    expect(addOneMonth('2026-09-07')).toBe('2026-10-07');
    expect(addOneMonth('2026-09-14')).toBe('2026-10-14');
    expect(addOneMonth('2027-01-31')).toBe('2027-02-28');
  });
});

describe('claimBatchPosition — "Day 2 of 3"', () => {
  const rows = [
    { id: 'c', claim_batch_id: 'b1', worked_date: '2026-09-21' },
    { id: 'a', claim_batch_id: 'b1', worked_date: '2026-09-07' },
    { id: 'b', claim_batch_id: 'b1', worked_date: '2026-09-14' },
    { id: 'solo', claim_batch_id: null, worked_date: '2026-09-28' },
  ];

  it('orders a submission by worked date', () => {
    expect(claimBatchPosition(rows[2], rows)).toEqual({ index: 2, total: 3 });
    expect(claimBatchPosition(rows[0], rows)).toEqual({ index: 3, total: 3 });
  });

  it('is null for a single-day claim', () => {
    expect(claimBatchPosition(rows[3], rows)).toBeNull();
  });

  it('is null when only one day of the batch is loaded', () => {
    expect(claimBatchPosition(rows[0], [rows[0]])).toBeNull();
  });
});

describe('CompOffService.claimWorkedDays — one row per day, one statement', () => {
  function fakeSupabase() {
    const calls: Record<string, unknown>[][] = [];
    const client = {
      from: () => ({
        insert: (rows: Record<string, unknown>[]) => {
          calls.push(rows);
          return Promise.resolve({ error: null });
        },
      }),
    } as unknown as SupabaseClient;
    return { client, calls };
  }
  const base = {
    hr_organization_id: 'org-1',
    employee_id: 'emp-1',
    documents: [{ file_id: 'f1', name: 'p.pdf', url: 'u', mime_type: 'application/pdf' }] as never[],
    work_location: 'inside_campus' as const,
  };

  it('inserts every day in one call, sorted, de-duplicated, sharing a batch id', async () => {
    const { client, calls } = fakeSupabase();
    await CompOffService.claimWorkedDays(client, {
      ...base,
      worked_dates: ['2026-09-21', '2026-09-07', '2026-09-21', '2026-09-14'],
    });
    expect(calls).toHaveLength(1);
    const rows = calls[0];
    expect(rows.map((r) => r.worked_date)).toEqual(['2026-09-07', '2026-09-14', '2026-09-21']);
    const batch = rows[0].claim_batch_id;
    expect(batch).toEqual(expect.any(String));
    expect(rows.every((r) => r.claim_batch_id === batch)).toBe(true);
    // expires_on is left to the per-row trigger.
    expect(rows.every((r) => !('expires_on' in r))).toBe(true);
    // A batch insert needs identical keys on every row.
    const keys = Object.keys(rows[0]).sort().join();
    expect(rows.every((r) => Object.keys(r).sort().join() === keys)).toBe(true);
  });

  it('a single day carries no batch id', async () => {
    const { client, calls } = fakeSupabase();
    await CompOffService.claimWorkedDays(client, { ...base, worked_dates: ['2026-09-07'] });
    expect(calls[0][0].claim_batch_id).toBeNull();
  });

  it('refuses an empty pick and more than 31 days', async () => {
    const { client, calls } = fakeSupabase();
    await expect(CompOffService.claimWorkedDays(client, { ...base, worked_dates: [] })).rejects.toThrow(
      /at least one day/i
    );
    const many = Array.from({ length: 32 }, (_, i) => `2026-08-${String(i + 1).padStart(2, '0')}`);
    await expect(CompOffService.claimWorkedDays(client, { ...base, worked_dates: many })).rejects.toThrow(
      /at most 31/i
    );
    expect(calls).toHaveLength(0);
  });
});

describe('one claim per worked day (2026-10-05)', () => {
  it('pending, approved, used and rejected block the day; withdrawn frees it', () => {
    const prior = priorClaimStatus([
      { worked_date: '2026-09-07', status: 'consumed' },
      { worked_date: '2026-09-14', status: 'rejected' },
      { worked_date: '2026-09-21', status: 'withdrawn' },
      { worked_date: '2026-09-28', status: 'pending' },
    ]);
    expect(prior.get('2026-09-07')).toBe('consumed');
    expect(prior.get('2026-09-14')).toBe('rejected');
    expect(prior.has('2026-09-21')).toBe(false);
    expect(prior.get('2026-09-28')).toBe('pending');
  });

  it('a withdrawn then re-filed day reports the live claim', () => {
    const prior = priorClaimStatus([
      { worked_date: '2026-09-07', status: 'withdrawn' },
      { worked_date: '2026-09-07', status: 'approved' },
    ]);
    expect(prior.get('2026-09-07')).toBe('approved');
  });

  it('claimDayProblem names the earlier claim', () => {
    expect(
      claimDayProblem('2026-09-21', TODAY, { ...free, priorClaim: 'consumed' })
    ).toMatch(/already claimed \(credit already used\)/i);
    expect(
      claimDayProblem('2026-09-21', TODAY, { ...free, priorClaim: 'rejected' })
    ).toMatch(/only once/i);
  });
});
