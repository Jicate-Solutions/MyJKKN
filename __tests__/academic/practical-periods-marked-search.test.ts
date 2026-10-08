/**
 * BUG-004733 (2026-07-14, MBA HOD): every faculty member marked on 13 Jul, but
 * Search Periods showed each specialisation (practical) hour as not marked.
 * available-periods-cards hard-coded practical periods to isMarked:false.
 *
 * Shapes below are prod II MBA TIME TABLE (254c52b7), Monday 13 Jul 2026. Note
 * the SCINVM save sits in the row of section 8e292d24, which no batch lists —
 * why the check reads batch_selected instead of looking rows up by section.
 */
import { describe, it, expect } from 'vitest';
import { practicalPeriodsMarkedFromRecords } from '@/lib/utils/practical-period-sections';

const TT = '254c52b7-a91b-4e04-b0c5-f4def81f8879';
const OTHER_TT = 'ffffffff-0000-0000-0000-000000000000';
const SLOT_42 = '42d47144-3bab-4e8f-88f7-a2774f1ef6d6';
const SLOT_2E = '2e9c27ae-56dc-472c-8018-42b02df2de83';
// attendance_data's stored roster key (a DB field name, not copy).
const ROSTER = 'students';

const entry = (batchId: string, n = 3) => ({
  period_mode: 'practical',
  batch_selected: { batch_id: batchId, batch_name: batchId },
  [ROSTER]: Array.from({ length: n }, (_, i) => ({ student_id: `s${i}`, status: 'Present' }))
});

const periods = [
  {
    timetable_slot_id: SLOT_42,
    timetable_id: TT,
    practical_config: {
      batches: [
        { batch_id: 'batch_SCINVM', section_ids: ['2445209c'] },
        { batch_id: 'batch_IHRM', section_ids: ['59ea02d7', '99d040e4'] }
      ]
    }
  },
  {
    timetable_slot_id: SLOT_2E,
    timetable_id: TT,
    practical_config: {
      batches: [
        { batch_id: 'batch_SSM', section_ids: ['2445209c'] },
        { batch_id: 'batch_KMI', section_ids: ['59ea02d7', '99d040e4'] }
      ]
    }
  }
];

const records = [
  { id: 'row-99d0', timetable_id: TT, attendance_data: { [SLOT_42]: entry('batch_IHRM') } },
  { id: 'row-8e29', timetable_id: TT, attendance_data: { [SLOT_42]: entry('batch_SCINVM') } },
  { id: 'row-2445', timetable_id: TT, attendance_data: { [SLOT_2E]: entry('batch_SSM') } }
];

describe('practicalPeriodsMarkedFromRecords', () => {
  it('marks a practical period once every batch has saved, whichever row holds it', () => {
    const res = practicalPeriodsMarkedFromRecords(periods, records);
    expect(res.get(SLOT_42)).toEqual({ isMarked: true, recordId: 'row-99d0' });
  });

  it('keeps a period pending while any batch is unsaved (KMI never marked on 13 Jul)', () => {
    const res = practicalPeriodsMarkedFromRecords(periods, records);
    expect(res.get(SLOT_2E)).toEqual({ isMarked: false });
  });

  it('ignores entries with no learners, unknown batches and other timetables', () => {
    const res = practicalPeriodsMarkedFromRecords(periods, [
      { id: 'a', timetable_id: TT, attendance_data: { [SLOT_42]: entry('batch_IHRM', 0) } },
      { id: 'b', timetable_id: TT, attendance_data: { [SLOT_42]: entry('batch_OTHER') } },
      { id: 'c', timetable_id: OTHER_TT, attendance_data: { [SLOT_42]: entry('batch_SCINVM') } },
      { id: 'd', timetable_id: TT, attendance_data: { [SLOT_42]: { [ROSTER]: [{ student_id: 'x' }] } } }
    ]);
    expect(res.get(SLOT_42)).toEqual({ isMarked: false });
  });

  it('leaves a period with no batches unmarked', () => {
    const res = practicalPeriodsMarkedFromRecords(
      [
        { timetable_slot_id: 'p1', timetable_id: TT, practical_config: { batches: [] } },
        { timetable_slot_id: 'p2', timetable_id: TT },
        { timetable_slot_id: 'p3', timetable_id: TT, practical_config: { batches: [{ section_ids: ['x'] }] } }
      ],
      [{ id: 'r', timetable_id: TT, attendance_data: { p1: entry('b'), p2: entry('b'), p3: entry('b') } }]
    );
    expect(res.get('p1')).toEqual({ isMarked: false });
    expect(res.get('p2')).toEqual({ isMarked: false });
    expect(res.get('p3')).toEqual({ isMarked: false });
  });

  it('tolerates null attendance_data', () => {
    const res = practicalPeriodsMarkedFromRecords(periods, [
      { id: 'n', timetable_id: TT, attendance_data: null }
    ]);
    expect(res.get(SLOT_42)).toEqual({ isMarked: false });
  });
});
