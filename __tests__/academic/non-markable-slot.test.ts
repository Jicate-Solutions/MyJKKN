import { describe, it, expect } from 'vitest';
import { isNonMarkableSlot } from '@/lib/utils/academic/non-markable-slot';

// BUG-005817: III B.Sc Zoology cycle-1 had a slot in the "Break" row flagged
// is_break_slot=true but still carrying a course + staff. The master period's
// is_break was false, so "My Classes" listed it as a class ("III hour").
describe('isNonMarkableSlot', () => {
  it('skips a slot flagged is_break_slot even when the period definition is not a break', () => {
    expect(
      isNonMarkableSlot(
        { is_break_slot: true, course_id: 'c1', staff_ids: ['s1'] },
        { is_break: false }
      )
    ).toBe(true);
  });

  it('skips a slot whose period definition is a break', () => {
    expect(isNonMarkableSlot({ is_break_slot: false }, { is_break: true })).toBe(true);
  });

  it('keeps an ordinary teaching slot', () => {
    expect(
      isNonMarkableSlot({ is_break_slot: false, course_id: 'c1' }, { is_break: false })
    ).toBe(false);
  });

  it('keeps a slot with no break flags at all', () => {
    expect(isNonMarkableSlot({ course_id: 'c1' }, {})).toBe(false);
    expect(isNonMarkableSlot({ course_id: 'c1' }, null)).toBe(false);
  });
});
