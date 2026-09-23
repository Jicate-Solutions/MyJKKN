/**
 * BUG-006198 (2026-09-23, DR.S.UMAMAHESWARI, faculty): "Attendance posted but
 * not shown". She marked her Zoology practical (Batch B, Periods 4 & 5) for
 * 2 July; the student_attendance row held both slots, but My Classes kept
 * showing them as pending.
 *
 * getFacultyTodayPeriods emitted `sections: []` for practical periods (the
 * sections live only in practical_config.batches[*].section_ids), so the
 * marked-state pre-check logged "Period missing section_id, skipping
 * attendance check" and never looked for the record.
 */
import { describe, it, expect } from 'vitest';
import { practicalSectionIdsForStaff } from '@/lib/utils/practical-period-sections';

const SEC = '442bdd4d-1af3-40dd-9750-bf3f7f3dce3b';
const UMA = 'b034275b-c128-4ddf-a6b8-4c0b9213435a';
const OTHER = 'dcb7d625-8f8b-43e9-b13b-0789e91ddbeb';

// Shape of prod slot c859ac12 (timetable e9d019bd, Period 5).
const batches = [
  {
    batch_name: 'Batch A',
    section_ids: [SEC],
    staff_mapping: { 'e68ac496-abd9-45f7-95d1-4a221139bc49': [OTHER] },
  },
  {
    batch_name: 'Batch B',
    section_ids: [SEC],
    staff_mapping: { 'dc09574e-e0e6-47da-b2e2-fc960bf0e460': [UMA] },
  },
];

describe('practicalSectionIdsForStaff', () => {
  it('returns the sections of the batches the staff teaches', () => {
    expect(practicalSectionIdsForStaff(batches, UMA)).toEqual([SEC]);
  });

  it('ignores batches the staff does not teach', () => {
    const X = '11111111-1111-1111-1111-111111111111';
    const mixed = [
      { section_ids: [X], staff_mapping: { c1: [OTHER] } },
      { section_ids: [SEC], staff_mapping: { c2: [UMA] } },
    ];
    expect(practicalSectionIdsForStaff(mixed, UMA)).toEqual([SEC]);
  });

  it('dedupes across batches and keeps order', () => {
    const Y = '22222222-2222-2222-2222-222222222222';
    const many = [
      { section_ids: [SEC], staff_mapping: { c1: [UMA] } },
      { section_ids: [SEC, Y], staff_mapping: { c2: [UMA] } },
    ];
    expect(practicalSectionIdsForStaff(many, UMA)).toEqual([SEC, Y]);
  });

  it('tolerates malformed batches', () => {
    expect(
      practicalSectionIdsForStaff(
        [null, {}, { section_ids: 'x', staff_mapping: { c: [UMA] } }, { staff_mapping: null }] as any,
        UMA
      )
    ).toEqual([]);
    expect(practicalSectionIdsForStaff(undefined as any, UMA)).toEqual([]);
  });
});
