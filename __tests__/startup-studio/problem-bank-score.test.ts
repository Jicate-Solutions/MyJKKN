// __tests__/startup-studio/problem-bank-score.test.ts
//
// Regression suite for ProblemBankService.addScore.
//
// The bug: composite_score is a GENERATED column in Postgres —
//   (COALESCE(severity_score,0) + COALESCE(validation_score,0)
//    + COALESCE(uniqueness_score,0) + COALESCE(feasibility_score,0)
//    + COALESCE(impact_potential_score,0)) / 5.0
// and Postgres refuses any insert that supplies a value for it (SQLSTATE
// 428C9). addScore computed a composite in TypeScript — from four field names
// that have never been columns on this table — and inserted it anyway, so
// every call threw before a row was written. ss_problem_scores has been empty
// since March 2026 because scoring has never once succeeded, not because
// problems score badly.
//
// Verified against production 2026-09-13: an insert carrying composite_score
// fails with 428C9; the same insert without it succeeds and the database
// returns composite_score 4.00 for dimensions 8/6/4/2 with impact unset.
//
// These tests drive the real method body and assert what it puts on the wire.

import { describe, expect, it, vi } from 'vitest';

// base-service.ts builds a Supabase browser client at module load, which needs
// NEXT_PUBLIC_* env vars. Tests must not carry production credentials, so the
// client module is stubbed; each test swaps in its own recording double below.
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({ from: () => ({}) }),
}));

import { ProblemBankService } from '@/lib/services/startup-studio/problem-bank-service';

type Insert = { table: string; payload: any };

/** Minimal chainable Supabase double that records what was inserted. */
function makeClient(recorder: { inserts: Insert[] }) {
  function builder(table: string) {
    const api: any = {
      insert(payload: unknown) {
        recorder.inserts.push({ table, payload });
        return api;
      },
      select: () => api,
      single: () =>
        Promise.resolve({ data: recorder.inserts.at(-1)?.payload, error: null }),
    };
    return api;
  }
  return { from: builder } as any;
}

/** Runs addScore against the double and returns the row it tried to write. */
async function insertedRow(
  data: Parameters<typeof ProblemBankService.addScore>[1],
) {
  const recorder = { inserts: [] as Insert[] };
  const client = makeClient(recorder);
  const original = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(ProblemBankService),
    'supabase',
  );
  Object.defineProperty(ProblemBankService, 'supabase', {
    get: () => client,
    configurable: true,
  });
  try {
    await ProblemBankService.addScore('problem-1', data);
  } finally {
    if (original) {
      Object.defineProperty(ProblemBankService, 'supabase', original);
    } else {
      delete (ProblemBankService as any).supabase;
    }
  }
  const row = recorder.inserts.find((i) => i.table === 'ss_problem_scores');
  expect(row, 'addScore should insert into ss_problem_scores').toBeTruthy();
  return row!.payload;
}

describe('ProblemBankService.addScore', () => {
  it('never sends composite_score — the column is generated and rejects it', async () => {
    // This single assertion is the whole bug. Sending this key is what made
    // Postgres throw 428C9 on every call since March.
    const row = await insertedRow({
      severity_score: 8,
      validation_score: 6,
      uniqueness_score: 4,
      feasibility_score: 2,
    });
    expect(row).not.toHaveProperty('composite_score');
  });

  it('sends none of the four field names that never existed', async () => {
    const row = await insertedRow({ severity_score: 8 });
    for (const phantom of ['severity', 'frequency', 'solvability', 'market_size']) {
      expect(row).not.toHaveProperty(phantom);
    }
  });

  it('passes the real dimension columns through untouched', async () => {
    const row = await insertedRow({
      severity_score: 8,
      validation_score: 6,
      uniqueness_score: 4,
      feasibility_score: 2,
      impact_potential_score: 5,
    });
    expect(row).toMatchObject({
      problem_id: 'problem-1',
      severity_score: 8,
      validation_score: 6,
      uniqueness_score: 4,
      feasibility_score: 2,
      impact_potential_score: 5,
    });
  });

  it('keeps the scorer and notes alongside the dimensions', async () => {
    const row = await insertedRow({
      severity_score: 7,
      scored_by: 'panel',
      notes: 'shortlisted',
    });
    expect(row.scored_by).toBe('panel');
    expect(row.notes).toBe('shortlisted');
  });

  it('sends a partial rating as-is and lets the database fill the gaps', async () => {
    // Unset dimensions are NOT sent as 0 — the generated column COALESCEs
    // them, so the database decides what a missing dimension is worth.
    const row = await insertedRow({ severity_score: 8 });
    expect(row.severity_score).toBe(8);
    expect(row).not.toHaveProperty('validation_score');
  });
});
