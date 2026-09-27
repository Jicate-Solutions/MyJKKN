/**
 * BUG-006116 (CRRI intern, Tue 15 Sep 15:21 IST): "Current period showing wrong".
 *
 * Her timetable is a batch (date-keyed) year of clinical postings, all in one
 * 09:00–15:30 period. The learner page folded EVERY date onto its weekday, so
 * each Tuesday carried all eight postings and the current-class badge showed
 * the first — March's — instead of September's. Only the displayed week's
 * dates may reach the weekly view.
 *
 * Runs the REAL parser (enrichTimetableSlots) with the clock fixed at the
 * moment she reported, and a stub client that returns course names.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { StudentTimetableService } from '@/lib/services/learners/student-timetable-service';
import { displayWeek, isDateKeyInDisplayWeek, isShowingToday } from '@/lib/services/learners/timetable-week';

const P1 = 'p1';
const periods = [{ id: P1, period_name: 'Clinical P1', start_time: '09:00:00', end_time: '15:30:00', is_break: false }];

const COURSES = [
  { id: 'c-mar', course_name: 'Oral Medicine posting', course_code: 'OM' },
  { id: 'c-sep', course_name: 'Periodontics posting', course_code: 'PERIO' },
];

function stubClient() {
  return {
    from: (table: string) => ({
      select: () => ({
        in: async () => ({ data: table === 'courses' ? COURSES : [], error: null }),
      }),
    }),
  };
}

// Both dates are Tuesdays: 10 Mar (the March posting) and 15 Sep (the September posting).
const batchTimetable = {
  '2026-03-10': { [P1]: { course_id: 'c-mar' } },
  '2026-09-15': { [P1]: { course_id: 'c-sep' } },
  'RANGE:2026-09-05:2026-10-19': { [P1]: { course_id: 'c-sep' } },
};

async function tuesdayCourses(): Promise<string[]> {
  const slots = await (StudentTimetableService as any).enrichTimetableSlots(batchTimetable, periods, stubClient());
  return slots.filter((s: any) => s.day === 'TUESDAY').map((s: any) => s.course.course_code);
}

describe('batch timetable on the learner weekly view', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T09:51:00Z')); // Tue 15 Sep, 15:21 IST
  });
  afterEach(() => vi.useRealTimers());

  it("Tuesday shows only this week's posting, not every Tuesday of the year", async () => {
    expect(await tuesdayCourses()).toEqual(['PERIO']);
  });

  it('the displayed week is Monday–Sunday on the India calendar', () => {
    expect(displayWeek()).toEqual({ from: '2026-09-14', to: '2026-09-20' });
  });

  it('late on Sunday night UTC is already Monday in India', () => {
    // 20 Sep 20:00 UTC = Mon 21 Sep 01:30 IST → the week of the 21st.
    expect(displayWeek(new Date('2026-09-20T20:00:00Z'))).toEqual({ from: '2026-09-21', to: '2026-09-27' });
  });

  it('on a Sunday (India) the page opens on Monday, so the coming week is shown', () => {
    expect(displayWeek(new Date('2026-09-27T06:00:00Z'))).toEqual({ from: '2026-09-28', to: '2026-10-04' });
  });

  it("a date outside the timetable's own start/end never reaches the week", async () => {
    const slots = await (StudentTimetableService as any).enrichTimetableSlots(
      batchTimetable, periods, stubClient(), { start_date: '2026-03-09', end_date: '2026-09-14T23:59:59Z' });
    expect(slots.filter((s: any) => s.day === 'TUESDAY')).toEqual([]);
  });

  it('the current-class badge knows today by day NAME, not by position in the shown days', () => {
    // A week whose only postings fall on Tuesday shows ['TUESDAY'] — Tuesday is
    // position 0. The old check (getDay() - 1 === position) said "not today".
    expect(isShowingToday('TUESDAY')).toBe(true);
    expect(isShowingToday('WEDNESDAY')).toBe(false);
    expect(isShowingToday('MONDAY', new Date('2026-09-27T06:00:00Z'))).toBe(false); // a Sunday
  });

  it('weekday keys are never filtered', () => {
    expect(isDateKeyInDisplayWeek('TUESDAY')).toBe(true);
  });
});
