// __tests__/app/learners/my-attendance-load.test.ts
// ============================================================================
// BUG-004853 / BUG-004856 — "My attendance page is not visible".
//
// Two things could leave a learner on a skeleton or on a lie:
//
//   1. The read fails and the service answers with an empty array, so the page
//      renders a confident "No Attendance Records" for a query that was
//      actually refused.
//   2. The read never comes back at all, so the server render never comes back,
//      and the skeleton is all the learner ever sees.
//
// These tests pin both, plus the thing the whole fix exists for: ONE fetch per
// page view, not four.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  loadAttendanceOverview,
  resolveAttendanceViewState,
  withDeadline,
  AttendanceLoadTimeoutError,
  ATTENDANCE_LOAD_TIMEOUT_MS,
  type AttendanceLoadOutcome
} from '@/app/(routes)/learners/my-attendance/_lib/load-attendance-overview';
import {
  StudentAttendanceService,
  AttendanceFetchError,
  type AttendanceOverview
} from '@/lib/services/learners/student-attendance-service';
import type { StudentAttendanceRecord } from '@/types/student-attendance';

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

function overviewOf(records: StudentAttendanceRecord[]): AttendanceOverview {
  return { records, statistics: {} as never, courseWise: [], trend: [] };
}

beforeEach(() => {
  vi.restoreAllMocks();
  // The load logs why it failed; keep the test output readable.
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. A failed read must not arrive looking like an empty semester.
// ---------------------------------------------------------------------------

describe('a service error reaches the page as a failure, not as empty data', () => {
  it('getAttendanceOverview throws when the fetch reports an error', async () => {
    vi.spyOn(StudentAttendanceService, 'fetchAttendanceRecords').mockResolvedValue({
      data: [],
      error: new AttendanceFetchError('attendance', 'permission denied for table student_attendance')
    });

    await expect(
      StudentAttendanceService.getAttendanceOverview('learner-1', 'sem-1')
    ).rejects.toBeInstanceOf(AttendanceFetchError);
  });

  it('a partial read — records returned AND an error — still throws', async () => {
    // A timetable query that failed leaves the record list incomplete rather
    // than empty. Incomplete attendance shown as fact is the worse outcome.
    vi.spyOn(StudentAttendanceService, 'fetchAttendanceRecords').mockResolvedValue({
      data: [record(), record({ status: 'Absent' })],
      error: new AttendanceFetchError('timetables', 'could not read timetables')
    });

    await expect(
      StudentAttendanceService.getAttendanceOverview('learner-1', 'sem-1')
    ).rejects.toMatchObject({ stage: 'timetables' });
  });

  it('the page load turns that throw into a failed outcome, never an empty one', async () => {
    vi.spyOn(StudentAttendanceService, 'fetchAttendanceRecords').mockResolvedValue({
      data: [],
      error: new AttendanceFetchError('learner', 'could not read the learner profile')
    });

    const outcome = await loadAttendanceOverview('learner-1', 'sem-1');

    expect(outcome.status).toBe('failed');
    expect(outcome).toMatchObject({ reason: 'error' });
    expect(resolveAttendanceViewState(outcome)).toBe('error');
    expect(resolveAttendanceViewState(outcome)).not.toBe('empty');
  });

  it('a genuinely empty semester is still empty, not an error', async () => {
    vi.spyOn(StudentAttendanceService, 'fetchAttendanceRecords').mockResolvedValue({
      data: [],
      error: null
    });

    const outcome = await loadAttendanceOverview('learner-1', 'sem-1');

    expect(outcome.status).toBe('ok');
    expect(resolveAttendanceViewState(outcome)).toBe('empty');
  });

  it('getStudentAttendanceBySemester keeps its old shape — array in, array out', async () => {
    // The Parent Portal and both export routes call this. Its contract must not
    // move: a failed read is still answered with an empty array, not a throw.
    vi.spyOn(StudentAttendanceService, 'fetchAttendanceRecords').mockResolvedValue({
      data: [],
      error: new AttendanceFetchError('attendance', 'permission denied')
    });

    await expect(
      StudentAttendanceService.getStudentAttendanceBySemester('learner-1', 'sem-1')
    ).resolves.toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. A read that never comes back must not hold the render open.
// ---------------------------------------------------------------------------

describe('the deadline — a stalled read ends as a retry, not a skeleton', () => {
  it('withDeadline rejects with a timeout error when the promise never settles', async () => {
    const never = new Promise<never>(() => {});

    await expect(withDeadline(never, 20)).rejects.toBeInstanceOf(AttendanceLoadTimeoutError);
  });

  it('withDeadline passes a fast result straight through', async () => {
    await expect(withDeadline(Promise.resolve('done'), 1000)).resolves.toBe('done');
  });

  it('a stalled fetch becomes a failed outcome with reason "timeout"', async () => {
    vi.spyOn(StudentAttendanceService, 'fetchAttendanceRecords').mockReturnValue(
      new Promise(() => {}) as never
    );

    const outcome = await loadAttendanceOverview('learner-1', 'sem-1', 20);

    expect(outcome).toMatchObject({ status: 'failed', reason: 'timeout' });
    expect((outcome as { error: unknown }).error).toBeInstanceOf(AttendanceLoadTimeoutError);
  });

  it('the timeout path selects the retry card, the same state a thrown error selects', async () => {
    vi.spyOn(StudentAttendanceService, 'fetchAttendanceRecords').mockReturnValue(
      new Promise(() => {}) as never
    );

    const timedOut = await loadAttendanceOverview('learner-1', 'sem-1', 20);

    // 'error' is the page's retry-card branch. This is the assertion that says
    // a hang now renders something the learner can act on.
    expect(resolveAttendanceViewState(timedOut)).toBe('error');
  });

  it('the shipped deadline is ten seconds', () => {
    expect(ATTENDANCE_LOAD_TIMEOUT_MS).toBe(10_000);
  });

  it('loadAttendanceOverview never throws, whatever the service does', async () => {
    vi.spyOn(StudentAttendanceService, 'fetchAttendanceRecords').mockRejectedValue(
      new Error('socket hang up')
    );

    await expect(loadAttendanceOverview('learner-1', 'sem-1', 50)).resolves.toMatchObject({
      status: 'failed',
      reason: 'error'
    });
  });
});

// ---------------------------------------------------------------------------
// 3. The reason this PR exists: one fetch per page view, not four.
// ---------------------------------------------------------------------------

describe('one fetch per page view', () => {
  it('rendering the overview reads the attendance records exactly once', async () => {
    const fetchSpy = vi
      .spyOn(StudentAttendanceService, 'fetchAttendanceRecords')
      .mockResolvedValue({ data: [record(), record({ status: 'Absent' })], error: null });

    await loadAttendanceOverview('learner-1', 'sem-1');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('the four shapes the page renders all come from that single read', async () => {
    vi.spyOn(StudentAttendanceService, 'fetchAttendanceRecords').mockResolvedValue({
      data: [record(), record({ status: 'Absent' })],
      error: null
    });

    const overview = await StudentAttendanceService.getAttendanceOverview('learner-1', 'sem-1');

    expect(overview.records).toHaveLength(2);
    expect(overview.statistics.totalClasses).toBe(2);
    expect(overview.courseWise).toHaveLength(1);
    expect(overview.trend).toBeInstanceOf(Array);
  });

  it('the old separate methods each still cost their own read — which is the waste removed', async () => {
    // Not a recommendation, a measurement: this is what the page used to do.
    const fetchSpy = vi
      .spyOn(StudentAttendanceService, 'fetchAttendanceRecords')
      .mockResolvedValue({ data: [record()], error: null });

    await Promise.all([
      StudentAttendanceService.getAttendanceStatistics('learner-1', 'sem-1'),
      StudentAttendanceService.getCourseWiseAttendance('learner-1', 'sem-1'),
      StudentAttendanceService.getAttendanceTrend('learner-1', 'sem-1'),
      StudentAttendanceService.getStudentAttendanceBySemester('learner-1', 'sem-1')
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(4);
  });
});

// ---------------------------------------------------------------------------
// 4. The view-state decision itself.
// ---------------------------------------------------------------------------

describe('resolveAttendanceViewState', () => {
  it('a loaded overview with records renders the breakdown', () => {
    const outcome: AttendanceLoadOutcome = { status: 'ok', overview: overviewOf([record()]) };
    expect(resolveAttendanceViewState(outcome)).toBe('loaded');
  });

  it('every failure reason lands on the retry card', () => {
    for (const reason of ['timeout', 'error'] as const) {
      const outcome: AttendanceLoadOutcome = { status: 'failed', reason, error: new Error('x') };
      expect(resolveAttendanceViewState(outcome)).toBe('error');
    }
  });
});
