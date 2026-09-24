/**
 * BUG-005031 — "Add Learner to Programme" and "Bulk Add Learners" could not
 * find a learner by roll number.
 *
 * The learners picker read and labelled only `register_number`; the bulk box,
 * labelled "Register / Roll numbers", matched only the register number parsed
 * back out of that label. On production the roll number differs from the
 * register number for most learners, so a roll number matched nobody.
 *
 * The route test fakes Supabase with a builder that honours the `select`
 * column list, so a route that forgets to read `roll_number` fails here too.
 */
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

const ROWS = [
  // Roll number differs from the register number (the common case).
  { id: 'l-1', first_name: 'Asha', last_name: 'K', register_number: '611821104001', roll_number: '21CS01' },
  // No register number at all — only a roll number.
  { id: 'l-2', first_name: 'Bala', last_name: 'M', register_number: null, roll_number: '21CS02' },
  // Roll number equal to the register number — label must not repeat it.
  { id: 'l-3', first_name: 'Chitra', last_name: 'R', register_number: '22AS03', roll_number: '22as03' },
];

function selectable(rows: Record<string, unknown>[]) {
  let columns: string[] | null = null;
  const q: any = {};
  q.select = (cols: string) => {
    columns = cols.split(',').map((c) => c.trim());
    return q;
  };
  for (const m of ['in', 'order', 'limit', 'eq']) q[m] = () => q;
  q.then = (res: any, rej: any) =>
    Promise.resolve({
      data: rows.map((r) =>
        Object.fromEntries((columns ?? Object.keys(r)).map((c) => [c, r[c] ?? null]))
      ),
      error: null,
    }).then(res, rej);
  return q;
}

vi.mock('@/lib/supabase/server', () => ({
  getAuthUser: () => Promise.resolve({ user: { id: 'coordinator-1' }, error: null }),
  createServiceRoleClient: () => ({ from: () => selectable(ROWS) }),
}));

vi.mock('@/lib/auth/api-institution-filter', () => ({
  createApiInstitutionFilter: () =>
    Promise.resolve({ isAllowed: true, institutionIds: ['inst-1'], isSuperAdmin: false }),
  applyInstitutionFilterToQuery: (q: unknown) => q,
}));

import { GET } from '@/app/api/cdc/pickers/learners/route';
import { matchPastedLearnerNumbers } from '@/lib/services/cdc/learner-picker';

type Option = { value: string; label: string; register_number?: string | null; roll_number?: string | null };

async function pickerOptions(): Promise<Option[]> {
  const res = await GET(new NextRequest('http://localhost/api/cdc/pickers/learners'));
  expect(res.status).toBe(200);
  return ((await res.json()) as { options: Option[] }).options;
}

describe('CDC learners picker carries the roll number', () => {
  it('shows the roll number in the searchable label when it differs from the register number', async () => {
    const byId = Object.fromEntries((await pickerOptions()).map((o) => [o.value, o]));
    expect(byId['l-1'].label).toBe('Asha K (611821104001 · Roll 21CS01)');
    expect(byId['l-2'].label).toBe('Bala M (Roll 21CS02)');
    expect(byId['l-3'].label).toBe('Chitra R (22AS03)');
    expect(byId['l-1'].roll_number).toBe('21CS01');
    expect(byId['l-2'].register_number).toBeNull();
  });

  it('bulk paste finds learners by roll number as well as register number', async () => {
    const options = await pickerOptions();
    const match = matchPastedLearnerNumbers(
      ['21cs01', '21CS02', '22AS03', 'NOPE-9'],
      options,
      new Set()
    );
    expect(match.toEnroll).toEqual(['l-1', 'l-2', 'l-3']);
    expect(match.missing).toEqual(['NOPE-9']);
  });
});

describe('matchPastedLearnerNumbers', () => {
  const options = [
    { value: 'a', register_number: 'R1', roll_number: 'X1' },
    { value: 'b', register_number: 'R2', roll_number: 'R1' }, // b's roll = a's register
  ];

  it('refuses a number that belongs to two learners instead of guessing one', () => {
    const match = matchPastedLearnerNumbers(['R1', 'R2'], options, new Set());
    expect(match.ambiguous).toEqual(['R1']);
    expect(match.toEnroll).toEqual(['b']);
  });

  it('enrolls a learner once when both of their numbers are pasted, and skips the enrolled', () => {
    const match = matchPastedLearnerNumbers(['X1', 'x1 ', 'R2'], options, new Set(['b']));
    expect(match.toEnroll).toEqual(['a']);
    expect(match.skipped).toEqual(['R2']);
  });
});
