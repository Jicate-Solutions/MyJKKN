// Added: 2026-09-28 (BUG-004733, BUG-004557) - The attendance tab stayed "not
// marked" after attendance was saved.
//
// The records below copy the SHAPE of MBA timetable 254c52b7 on 25 Sep 2026
// (ids shortened): the day is saved as several records, one per section group,
// and a practical / specialisation slot lives only in the record of the batch
// that marked it. The old lookup read ONE record, picked by the period's FIRST
// section, and the periods screen never checked practical periods at all.

import { readFileSync } from 'fs';
import path from 'path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = { id: string; timetable_id: string; attendance_date: string; section_id: string | null; section_ids: string[] | null; attendance_data: Record<string, unknown> };
let table: Row[] = [];

// A tiny in-memory PostgREST stand-in: eq / contains / maybeSingle / await.
function query() {
  let rows = [...table];
  const api: any = {
    select: () => api,
    eq: (col: keyof Row, val: unknown) => { rows = rows.filter((r) => r[col] === val); return api; },
    contains: (col: keyof Row, vals: string[]) => {
      rows = rows.filter((r) => vals.every((v) => ((r[col] as string[] | null) ?? []).includes(v)));
      return api;
    },
    maybeSingle: async () =>
      rows.length > 1
        ? { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned' } }
        : { data: rows[0] ?? null, error: null },
    then: (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null }),
  };
  return api;
}

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({ from: () => query() }),
}));
vi.mock('@/lib/utils/enhanced-logger', () => ({
  logger: { dev: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { AttendanceRosterService } from '@/lib/services/academic/attendance-roster-service';

const TT = 'tt-mba';
const DAY = '2026-09-25';
const PRESENT = 'Present';
const LEARNER = 'l1';
const present = { students: [{ student_id: LEARNER, status: PRESENT }] };
const emptySlot = { students: [] };

// Section groups as saved on 25 Sep: A alone; B with C; C alone (a later batch).
const A = 'sec-2445', B = 'sec-59ea', C = 'sec-5ba6', D = 'sec-8e29';

beforeEach(() => {
  table = [
    { id: 'rec-A', timetable_id: TT, attendance_date: DAY, section_id: A, section_ids: [A], attendance_data: { 'slot-0455': present, 'slot-7616': present } },
    { id: 'rec-B', timetable_id: TT, attendance_date: DAY, section_id: B, section_ids: [B, C], attendance_data: { 'slot-7616': present, 'slot-dd6f': present } },
    { id: 'rec-C', timetable_id: TT, attendance_date: DAY, section_id: C, section_ids: [C, B], attendance_data: { 'slot-a7f6': present } },
    { id: 'rec-D', timetable_id: TT, attendance_date: DAY, section_id: D, section_ids: null, attendance_data: { 'slot-7cc9': present, 'slot-empty': emptySlot } },
  ];
});

const check = (slot: string, sections: string[]) =>
  AttendanceRosterService.checkExistingAttendanceForPeriods([
    { timetable_slot_id: slot, timetable_id: TT, section_id: sections[0] ?? '', section_ids: sections, attendance_date: DAY },
  ]).then((m) => m.get(slot));

describe('checkExistingAttendanceForPeriods — every record of the day, not one', () => {
  it('a practical slot saved in another section group\'s record is marked (the first section\'s own record lacks it)', async () => {
    // A teacher of batch C: C's own record (rec-C) does not hold slot-dd6f; rec-B does and covers C.
    expect(await check('slot-dd6f', [C])).toEqual({ isMarked: true, recordId: 'rec-B' });
  });

  it('a period with no known section is marked when any record of the day holds it', async () => {
    expect(await check('slot-dd6f', [])).toEqual({ isMarked: true, recordId: 'rec-B' });
  });

  it('two records containing the section no longer read as not marked', async () => {
    // B appears in rec-B and rec-C; the old containment query hit .maybeSingle() with 2 rows.
    expect((await check('slot-a7f6', ['sec-none', B]))?.isMarked).toBe(true);
  });

  it('a slot saved for section A does not mark the same period for section D', async () => {
    expect((await check('slot-0455', [D]))?.isMarked).toBe(false);
    expect((await check('slot-0455', [A]))?.isMarked).toBe(true);
  });

  it('an empty slot, a missing slot and a missing timetable are not marked', async () => {
    expect((await check('slot-empty', [D]))?.isMarked).toBe(false);
    expect((await check('slot-none', []))?.isMarked).toBe(false);
    const m = await AttendanceRosterService.checkExistingAttendanceForPeriods([
      { timetable_slot_id: 'slot-7cc9', timetable_id: '', section_id: D, attendance_date: DAY },
    ]);
    expect(m.get('slot-7cc9')?.isMarked).toBe(false);
  });
});

describe('with #4092 (BUG-006204): a practical batch is marked only by its own learners', () => {
  const checkBatch = (slot: string, sections: string[], learners: string[] | null) =>
    AttendanceRosterService.checkExistingAttendanceForPeriods([
      { timetable_slot_id: slot, timetable_id: TT, section_id: sections[0] ?? '', section_ids: sections, attendance_date: DAY, student_ids: learners },
    ]).then((m) => m.get(slot));

  it('another batch\'s save in a covering record does not mark this batch', async () => {
    // rec-B holds slot-dd6f for learner l1 only; batch C's learners are l7, l8.
    expect((await checkBatch('slot-dd6f', [C], ['l7', 'l8']))?.isMarked).toBe(false);
  });

  it('this batch\'s save in another section group\'s record still marks it', async () => {
    expect(await checkBatch('slot-dd6f', [C], [LEARNER, 'l8'])).toEqual({ isMarked: true, recordId: 'rec-B' });
  });

  it('no learner list keeps the any-learner rule', async () => {
    expect((await checkBatch('slot-dd6f', [C], null))?.isMarked).toBe(true);
  });
});

describe('the Senior Learner\'s own periods view checks every period', () => {
  const read = (f: string) =>
    readFileSync(path.resolve(__dirname, '../../../app/(routes)/academic/attendance/_components', f), 'utf8');

  it('faculty-quick-attendance no longer skips a period that has no section', () => {
    expect(read('faculty-quick-attendance.tsx')).not.toMatch(/skipping attendance check/);
  });
});
