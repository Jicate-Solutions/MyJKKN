// __tests__/lib/services/learners/student-attendance-derive.test.ts
// ============================================================================
// Regression cover for BUG-004853 / BUG-004856 — "My attendance page is not
// visible".
//
// The My Attendance page asked the service for statistics, course-wise data,
// trend data AND the raw records. Three of those four calls re-ran the whole
// heavy fetch internally, so one page view pulled the same section's
// attendance JSONB out of Postgres four times over and the learner sat on a
// loading skeleton.
//
// The fix fetches once and derives the other three in memory. These tests lock
// down the derivations: they must produce exactly what the three original
// methods produced, from one array of records.
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  deriveAttendanceStatistics,
  deriveCourseWiseAttendance,
  deriveAttendanceTrend
} from '@/lib/services/learners/student-attendance-service';
import type { StudentAttendanceRecord } from '@/types/student-attendance';

/** Build a record with sensible defaults; override only what a test cares about. */
function record(over: Partial<StudentAttendanceRecord> = {}): StudentAttendanceRecord {
  return {
    date: '2026-03-02',
    period_name: 'Period 1',
    start_time: '09:00',
    end_time: '09:50',
    course_name: 'Microprocessors',
    course_code: '24UCSC03',
    status: 'Present',
    marked_at: '2026-03-02T09:05:00Z',
    ...over
  };
}

/** A date N days before today, as the YYYY-MM-DD the JSONB records carry. */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

describe('deriveAttendanceStatistics', () => {
  it('counts present and absent and rounds the percentage', () => {
    const records = [
      record({ status: 'Present' }),
      record({ status: 'Present' }),
      record({ status: 'Absent' })
    ];

    expect(deriveAttendanceStatistics(records)).toEqual({
      totalClasses: 3,
      presentCount: 2,
      absentCount: 1,
      percentage: 67,
      threshold: 75,
      isAboveThreshold: false
    });
  });

  it('reports 0% rather than NaN when there are no records', () => {
    expect(deriveAttendanceStatistics([])).toEqual({
      totalClasses: 0,
      presentCount: 0,
      absentCount: 0,
      percentage: 0,
      threshold: 75,
      isAboveThreshold: false
    });
  });

  it('treats exactly 75% as above the threshold', () => {
    const records = [
      record({ status: 'Present' }),
      record({ status: 'Present' }),
      record({ status: 'Present' }),
      record({ status: 'Absent' })
    ];

    const stats = deriveAttendanceStatistics(records);
    expect(stats.percentage).toBe(75);
    expect(stats.isAboveThreshold).toBe(true);
  });
});

describe('deriveCourseWiseAttendance', () => {
  it('groups by course code and sorts by course name', () => {
    const records = [
      record({ course_code: 'B', course_name: 'Zoology', status: 'Present' }),
      record({ course_code: 'A', course_name: 'Anatomy', status: 'Present' }),
      record({ course_code: 'A', course_name: 'Anatomy', status: 'Absent' }),
      record({ course_code: 'B', course_name: 'Zoology', status: 'Present' })
    ];

    const courses = deriveCourseWiseAttendance(records);

    expect(courses.map(c => c.course_code)).toEqual(['A', 'B']);
    expect(courses[0]).toMatchObject({
      course_name: 'Anatomy',
      total: 2,
      present: 1,
      absent: 1,
      percentage: 50
    });
    expect(courses[1]).toMatchObject({ total: 2, present: 2, absent: 0, percentage: 100 });
  });

  it('falls back to the course name when a record carries no course code', () => {
    const records = [
      record({ course_code: undefined, course_name: 'Unknown', status: 'Present' }),
      record({ course_code: undefined, course_name: 'Unknown', status: 'Absent' })
    ];

    const courses = deriveCourseWiseAttendance(records);
    expect(courses).toHaveLength(1);
    expect(courses[0]).toMatchObject({ course_name: 'Unknown', total: 2, percentage: 50 });
  });

  it('returns an empty list for no records', () => {
    expect(deriveCourseWiseAttendance([])).toEqual([]);
  });
});

describe('deriveAttendanceTrend', () => {
  it('keeps only the last N days and returns one point per date, oldest first', () => {
    const records = [
      record({ date: daysAgo(40), status: 'Present' }), // outside the window
      record({ date: daysAgo(2), status: 'Present' }),
      record({ date: daysAgo(2), status: 'Absent' }),
      record({ date: daysAgo(5), status: 'Present' })
    ];

    const trend = deriveAttendanceTrend(records, 30);

    expect(trend).toEqual([
      { date: daysAgo(5), percentage: 100 },
      { date: daysAgo(2), percentage: 50 }
    ]);
  });

  it('honours a shorter window', () => {
    const records = [
      record({ date: daysAgo(10), status: 'Present' }),
      record({ date: daysAgo(1), status: 'Present' })
    ];

    expect(deriveAttendanceTrend(records, 3)).toEqual([{ date: daysAgo(1), percentage: 100 }]);
  });

  it('returns an empty trend for no records', () => {
    expect(deriveAttendanceTrend([], 30)).toEqual([]);
  });
});

describe('derivations agree with each other', () => {
  it('the statistics total equals the sum of the course-wise totals', () => {
    const records = [
      record({ course_code: 'A', status: 'Present' }),
      record({ course_code: 'A', status: 'Absent' }),
      record({ course_code: 'B', course_name: 'Botany', status: 'Present' })
    ];

    const stats = deriveAttendanceStatistics(records);
    const courses = deriveCourseWiseAttendance(records);

    expect(courses.reduce((sum, c) => sum + c.total, 0)).toBe(stats.totalClasses);
    expect(courses.reduce((sum, c) => sum + c.present, 0)).toBe(stats.presentCount);
    expect(courses.reduce((sum, c) => sum + c.absent, 0)).toBe(stats.absentCount);
  });
});
