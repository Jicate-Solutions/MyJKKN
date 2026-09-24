/**
 * BUG-005845 — "I created a timetable for 4th semester B.Sc. Nursing but now it
 * shows 0 rows."
 *
 * A HOD or faculty member's timetable list defaults to their profile
 * department. A timetable belongs to the PROGRAM's department, which is often
 * not the creator's, so the row they had just saved was filtered out of their
 * own list. Production 2026-09-24: every timetable the reporter created sits in
 * a department other than their profile's.
 *
 * The test runs the real page scope helper and the real server fetcher against
 * an in-memory table that applies the filters, so it checks WHICH ROWS come
 * back rather than which methods were called.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const MY_DEPT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROGRAM_DEPT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const THIRD_DEPT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

type Row = Record<string, unknown>;
let rows: Row[] = [];

/** Minimal PostgREST stand-in: eq, or (flat `col.eq.val` lists), range, order. */
function fakeQuery() {
  const preds: Array<(r: Row) => boolean> = [];
  const q: any = {
    select: () => q,
    order: () => q,
    range: () => q,
    eq: (col: string, val: unknown) => {
      preds.push((r) => r[col] === val);
      return q;
    },
    or: (expr: string) => {
      const alts = expr.split(',').map((part) => {
        const [col, op, ...rest] = part.split('.');
        if (op !== 'eq') throw new Error(`fake only supports eq, got ${op}`);
        const val = rest.join('.');
        return (r: Row) => String(r[col]) === val;
      });
      preds.push((r) => alts.some((a) => a(r)));
      return q;
    },
    then: (resolve: (v: unknown) => void) => {
      const data = rows.filter((r) => preds.every((p) => p(r)));
      resolve({ data, error: null, count: data.length });
    }
  };
  return q;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ from: () => fakeQuery() }))
}));

import { getTimetables } from '@/app/(routes)/academic/timetables/_data/get-timetables';
import { resolveTimetableListScope } from '@/app/(routes)/academic/timetables/_data/list-scope';

const names = (data: unknown[]) =>
  data.map((r) => (r as Row).timetable_name).sort();

describe('timetable list keeps the creator\'s own timetables (BUG-005845)', () => {
  beforeEach(() => {
    rows = [
      { timetable_name: 'mine, my dept', department_id: MY_DEPT, created_by: ME },
      { timetable_name: 'mine, program dept', department_id: PROGRAM_DEPT, created_by: ME },
      { timetable_name: 'colleague, my dept', department_id: MY_DEPT, created_by: OTHER },
      { timetable_name: 'colleague, program dept', department_id: PROGRAM_DEPT, created_by: OTHER },
      { timetable_name: 'colleague, third dept', department_id: THIRD_DEPT, created_by: OTHER }
    ];
  });

  const faculty = { role: 'faculty', department_id: MY_DEPT };

  it('default scope: my department plus every timetable I created', async () => {
    const scope = resolveTimetableListScope({
      userId: ME,
      profile: faculty,
      isSuperAdmin: false
    });
    const { data } = await getTimetables(scope);
    expect(names(data)).toEqual([
      'colleague, my dept',
      'mine, my dept',
      'mine, program dept'
    ]);
  });

  it('the filter bar writing my own department into the URL gives the same answer', async () => {
    const scope = resolveTimetableListScope({
      urlDepartmentId: MY_DEPT,
      userId: ME,
      profile: faculty,
      isSuperAdmin: false
    });
    const { data } = await getTimetables(scope);
    expect(names(data)).toContain('mine, program dept');
  });

  it('a department the user picks is honoured exactly', async () => {
    const scope = resolveTimetableListScope({
      urlDepartmentId: THIRD_DEPT,
      userId: ME,
      profile: faculty,
      isSuperAdmin: false
    });
    expect(scope.alsoCreatedBy).toBeUndefined();
    const { data } = await getTimetables(scope);
    expect(names(data)).toEqual(['colleague, third dept']);
  });

  it('super admins and other roles get no department default', () => {
    expect(
      resolveTimetableListScope({ userId: ME, profile: faculty, isSuperAdmin: true })
    ).toEqual({ departmentId: undefined, alsoCreatedBy: undefined });
    expect(
      resolveTimetableListScope({
        userId: ME,
        profile: { role: 'admin', department_id: MY_DEPT },
        isSuperAdmin: false
      })
    ).toEqual({ departmentId: undefined, alsoCreatedBy: undefined });
  });
});
