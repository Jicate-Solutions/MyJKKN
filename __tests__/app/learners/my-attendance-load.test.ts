// __tests__/app/learners/my-attendance-load.test.ts
// ============================================================================
// /learners/my-attendance — every read on the page, and what happens when one
// of them stalls or fails.
//
// BUG-004853 / BUG-004856: two learners, two minutes apart, one page that was
// nothing but a loading skeleton. The attendance read was the obvious suspect
// and it was doing four times the work it needed to — but it was never the only
// read. Sign-in, the profile lookup, the lifecycle check, the learner row and
// the semester list all ran first, unbounded, each able to hang on its own; and
// two of them answered a DATABASE FAILURE with a redirect, which tells the
// learner their account is the problem.
//
// Three rules are pinned here:
//
//   1. one deadline covers every read, and a stall at ANY of them ends on the
//      retry card — not on a skeleton;
//   2. "we could not find out" never redirects. Only a clean negative answer
//      redirects;
//   3. the attendance records are read exactly ONCE per page view.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// A Supabase stand-in. Each table answers from `state.tables`; a table whose
// entry is HANGS never settles, which is how a stalled read is simulated.
// ---------------------------------------------------------------------------

const HANGS = Symbol('hangs');

const state = vi.hoisted(() => ({
  auth: null as
    | { data: { user: { id: string } | null }; error: { message?: string } | null }
    | 'hangs'
    | null,
  tables: {} as Record<string, unknown>,
  validation: null as unknown,
  validationHangs: false
}));

function never(): Promise<never> {
  return new Promise(() => {});
}

function answerFor(table: string): Promise<{ data: unknown; error: unknown }> {
  const answer = state.tables[table];
  if (answer === HANGS) return never();
  return Promise.resolve(
    (answer as { data: unknown; error: unknown }) ?? { data: null, error: null }
  );
}

function builderFor(table: string) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'is', 'in', 'not', 'gte', 'lte', 'limit']) {
    builder[method] = () => builder;
  }
  builder.single = () => answerFor(table);
  builder.maybeSingle = () => answerFor(table);
  builder.order = () => answerFor(table);
  return builder;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: () => (state.auth === 'hangs' ? never() : Promise.resolve(state.auth))
    },
    from: (table: string) => builderFor(table)
  }),
  createServiceRoleClient: () => ({ from: (table: string) => builderFor(table) })
}));

vi.mock('@/lib/services/auth/student-validation-service', () => ({
  StudentValidationService: {
    validateStudentAccess: () =>
      state.validationHangs ? never() : Promise.resolve(state.validation)
  }
}));

import {
  loadAttendancePage,
  resolveAttendanceViewState,
  withDeadline,
  isMissingSession,
  AttendanceLoadTimeoutError,
  AttendanceStageError,
  ATTENDANCE_LOAD_TIMEOUT_MS,
  STAGE_LABEL,
  type AttendancePageLoad
} from '@/app/(routes)/learners/my-attendance/_lib/load-attendance-page';
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

/** The happy path every test starts from, so each one changes exactly one thing. */
function healthy() {
  state.auth = { data: { user: { id: 'user-1' } }, error: null };
  state.validation = { allowed: true, reason: 'access_granted', isGraduated: false };
  state.validationHangs = false;
  state.tables = {
    profiles: { data: { learner_id: 'learner-1', role: 'student' }, error: null },
    learners_profiles: {
      data: { semester_id: 'sem-5', program_id: 'prog-1', institution_id: 'inst-1' },
      error: null
    },
    semesters: {
      data: [
        { id: 'sem-4', semester_name: 'Semester 4', semester_code: 'BSC-SEM-4' },
        { id: 'sem-5', semester_name: 'Semester 5', semester_code: 'BSC-SEM-5' },
        { id: 'sem-6', semester_name: 'Semester 6', semester_code: 'BSC-SEM-6' }
      ],
      error: null
    }
  };
}

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  healthy();
  fetchSpy = vi
    .spyOn(StudentAttendanceService, 'fetchAttendanceRecords')
    .mockResolvedValue({ data: [record(), record({ status: 'Absent' })], error: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. The happy path, so the fixtures are known good before anything is broken.
// ---------------------------------------------------------------------------

describe('the page loads', () => {
  it('returns ok with the learner, the semester and the overview', async () => {
    const load = await loadAttendancePage(undefined, 500);

    expect(load).toMatchObject({
      status: 'ok',
      learnerId: 'learner-1',
      currentSemesterId: 'sem-5',
      selectedSemester: 'sem-5'
    });
    expect(resolveAttendanceViewState(load)).toBe('loaded');
  });

  it('drops future semesters from the filter and keeps current and past', async () => {
    const load = await loadAttendancePage(undefined, 500);

    expect(load.status).toBe('ok');
    if (load.status !== 'ok') return;
    expect(load.semesters.map(s => s.id)).toEqual(['sem-4', 'sem-5']);
  });

  it("honours the semester in the query string over the learner's current one", async () => {
    const load = await loadAttendancePage('sem-4', 500);

    expect(load).toMatchObject({ selectedSemester: 'sem-4', currentSemesterId: 'sem-5' });
  });

  it('a genuinely empty semester is empty, not an error', async () => {
    fetchSpy.mockResolvedValue({ data: [], error: null });

    const load = await loadAttendancePage(undefined, 500);

    expect(load.status).toBe('ok');
    expect(resolveAttendanceViewState(load)).toBe('empty');
  });
});

// ---------------------------------------------------------------------------
// 2. One deadline over every read. A stall anywhere ends on the retry card.
// ---------------------------------------------------------------------------

describe('the deadline covers every read on the page, not just attendance', () => {
  it('a hanging sign-in check times out and names that stage', async () => {
    state.auth = 'hangs';

    const load = await loadAttendancePage(undefined, 25);

    expect(load).toMatchObject({ status: 'failed', reason: 'timeout', stage: 'session' });
    expect(resolveAttendanceViewState(load)).toBe('error');
  });

  it('a hanging PROFILE read times out and names that stage', async () => {
    // The read the critic pointed at: before the bounded loader it was awaited
    // ahead of everything, so a stall here was an endless skeleton.
    state.tables.profiles = HANGS;

    const load = await loadAttendancePage(undefined, 25);

    expect(load).toMatchObject({ status: 'failed', reason: 'timeout', stage: 'profile' });
    expect(resolveAttendanceViewState(load)).toBe('error');
  });

  it('a hanging lifecycle check times out and names that stage', async () => {
    state.validationHangs = true;

    const load = await loadAttendancePage(undefined, 25);

    expect(load).toMatchObject({ status: 'failed', reason: 'timeout', stage: 'validation' });
  });

  it('a hanging learner lookup times out and names that stage', async () => {
    state.tables.learners_profiles = HANGS;

    const load = await loadAttendancePage(undefined, 25);

    expect(load).toMatchObject({ status: 'failed', reason: 'timeout', stage: 'learner' });
  });

  it('a hanging semester list times out and names that stage', async () => {
    state.tables.semesters = HANGS;

    const load = await loadAttendancePage(undefined, 25);

    expect(load).toMatchObject({ status: 'failed', reason: 'timeout', stage: 'semesters' });
  });

  it('a hanging attendance read times out and names that stage', async () => {
    fetchSpy.mockReturnValue(never() as never);

    const load = await loadAttendancePage(undefined, 25);

    expect(load).toMatchObject({ status: 'failed', reason: 'timeout', stage: 'attendance' });
  });

  it('every stage has retry-card wording, so no failure renders a blank reason', () => {
    for (const label of Object.values(STAGE_LABEL)) {
      expect(label).toBeTruthy();
    }
  });

  it('the shipped deadline is ten seconds', () => {
    expect(ATTENDANCE_LOAD_TIMEOUT_MS).toBe(10_000);
  });

  it('withDeadline passes a fast result straight through', async () => {
    await expect(withDeadline(Promise.resolve('done'), 1000)).resolves.toBe('done');
  });

  it('withDeadline rejects with a timeout error when nothing settles', async () => {
    await expect(withDeadline(never(), 20)).rejects.toBeInstanceOf(AttendanceLoadTimeoutError);
  });
});

// ---------------------------------------------------------------------------
// 3. "Could not find out" never redirects. Only a clean answer redirects.
// ---------------------------------------------------------------------------

describe('a failed read renders a retry; only a real answer redirects', () => {
  it('no session redirects to login', async () => {
    state.auth = { data: { user: null }, error: { message: 'Auth session missing!' } };

    const load = await loadAttendancePage(undefined, 500);

    expect(load).toEqual({ status: 'redirect', to: '/auth/login' });
  });

  it('no session and no reason given also redirects to login', async () => {
    state.auth = { data: { user: null }, error: null };

    const load = await loadAttendancePage(undefined, 500);

    expect(load).toEqual({ status: 'redirect', to: '/auth/login' });
  });

  it('an auth read that FAILED for another reason does not redirect to login', async () => {
    // Stranding a signed-in learner on a login page that also cannot work is
    // the same dead end by a different route.
    state.auth = { data: { user: null }, error: { message: 'fetch failed: ECONNRESET' } };

    const load = await loadAttendancePage(undefined, 500);

    expect(load).toMatchObject({ status: 'failed', reason: 'error', stage: 'session' });
    expect(resolveAttendanceViewState(load)).toBe('error');
  });

  it('a FAILED profile read renders the retry card instead of redirecting away', async () => {
    state.tables.profiles = {
      data: null,
      error: { message: 'permission denied for table profiles' }
    };

    const load = await loadAttendancePage(undefined, 500);

    expect(load).toMatchObject({ status: 'failed', reason: 'error', stage: 'profile' });
    expect(load.status).not.toBe('redirect');
    expect(resolveAttendanceViewState(load)).toBe('error');
  });

  it('a profile that answers "not a learner" still redirects', async () => {
    state.tables.profiles = { data: { learner_id: null, role: 'staff' }, error: null };

    const load = await loadAttendancePage(undefined, 500);

    expect(load).toEqual({ status: 'redirect', to: '/' });
  });

  it('a lifecycle check that could not run renders the retry card', async () => {
    // validateStudentAccess answers a failed query with reason 'database_error'.
    state.validation = { allowed: false, reason: 'database_error', isGraduated: false };

    const load = await loadAttendancePage(undefined, 500);

    expect(load).toMatchObject({ status: 'failed', stage: 'validation' });
    expect(load.status).not.toBe('redirect');
  });

  it('a lifecycle check that says "not allowed" still redirects, carrying the reason', async () => {
    state.validation = { allowed: false, reason: 'student_induction_only', isGraduated: false };

    const load = await loadAttendancePage(undefined, 500);

    expect(load).toEqual({
      status: 'redirect',
      to: '/auth/login?reason=student_induction_only'
    });
  });

  it('a FAILED learner lookup is a failure with its stage, not an empty semester', async () => {
    state.tables.learners_profiles = { data: null, error: { message: 'could not connect' } };

    const load = await loadAttendancePage(undefined, 500);

    expect(load).toMatchObject({ status: 'failed', reason: 'error', stage: 'learner' });
    expect(resolveAttendanceViewState(load)).toBe('error');
    expect(resolveAttendanceViewState(load)).not.toBe('empty');
  });

  it('a missing learner row is a failure too — the profile points at it', async () => {
    state.tables.learners_profiles = { data: null, error: null };

    const load = await loadAttendancePage(undefined, 500);

    expect(load).toMatchObject({ status: 'failed', stage: 'learner' });
  });

  it('a FAILED attendance read is a failure, never a confident empty state', async () => {
    fetchSpy.mockResolvedValue({
      data: [],
      error: new AttendanceFetchError(
        'attendance',
        'permission denied for table student_attendance'
      )
    });

    const load = await loadAttendancePage(undefined, 500);

    expect(load).toMatchObject({ status: 'failed', reason: 'error', stage: 'attendance' });
    expect(resolveAttendanceViewState(load)).toBe('error');
  });

  it('a FAILED semester list is NOT fatal — attendance still renders', async () => {
    // Losing the filter dropdown is a smaller harm than refusing to show
    // attendance we can actually read.
    state.tables.semesters = { data: null, error: { message: 'statement timeout' } };

    const load = await loadAttendancePage(undefined, 500);

    expect(load.status).toBe('ok');
    if (load.status !== 'ok') return;
    expect(load.semesters).toEqual([]);
    expect(load.overview.records).toHaveLength(2);
  });

  it('a Next.js redirect signal thrown from inside is re-thrown, not swallowed', async () => {
    const signal = Object.assign(new Error('NEXT_REDIRECT'), {
      digest: 'NEXT_REDIRECT;/somewhere'
    });
    fetchSpy.mockRejectedValue(signal);

    await expect(loadAttendancePage(undefined, 500)).rejects.toBe(signal);
  });

  it('isMissingSession tells the two apart', () => {
    expect(isMissingSession({ message: 'Auth session missing!' })).toBe(true);
    expect(isMissingSession({ message: 'JWT expired' })).toBe(true);
    expect(isMissingSession(null)).toBe(true);
    expect(isMissingSession({ message: 'fetch failed' })).toBe(false);
    expect(isMissingSession({ message: 'upstream connect error' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. The reason this PR exists: one read per page view, not four.
// ---------------------------------------------------------------------------

describe('one attendance read per page view', () => {
  it('a full page load reads the attendance records exactly once', async () => {
    await loadAttendancePage(undefined, 500);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('all four shapes the page renders come from that single read', async () => {
    const load = await loadAttendancePage(undefined, 500);

    expect(load.status).toBe('ok');
    if (load.status !== 'ok') return;
    expect(load.overview.records).toHaveLength(2);
    expect(load.overview.statistics.totalClasses).toBe(2);
    expect(load.overview.courseWise).toHaveLength(1);
    expect(load.overview.trend).toBeInstanceOf(Array);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('the old separate methods each still cost their own read — the waste removed', async () => {
    // Not a recommendation, a measurement: this is what the page used to do.
    fetchSpy.mockResolvedValue({ data: [record()], error: null });

    await Promise.all([
      StudentAttendanceService.getAttendanceStatistics('learner-1', 'sem-5'),
      StudentAttendanceService.getCourseWiseAttendance('learner-1', 'sem-5'),
      StudentAttendanceService.getAttendanceTrend('learner-1', 'sem-5'),
      StudentAttendanceService.getStudentAttendanceBySemester('learner-1', 'sem-5')
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(4);
  });

  it('getStudentAttendanceBySemester keeps its old shape — array in, array out', async () => {
    // The Parent Portal and both export routes call this. Its contract must not
    // move: a failed read is still answered with an empty array, not a throw.
    fetchSpy.mockResolvedValue({
      data: [],
      error: new AttendanceFetchError('attendance', 'permission denied')
    });

    await expect(
      StudentAttendanceService.getStudentAttendanceBySemester('learner-1', 'sem-5')
    ).resolves.toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 5. The view-state decision itself.
// ---------------------------------------------------------------------------

describe('resolveAttendanceViewState', () => {
  const overview = (records: StudentAttendanceRecord[]): AttendanceOverview => ({
    records,
    statistics: {} as never,
    courseWise: [],
    trend: []
  });

  it('records present renders the breakdown', () => {
    const load: AttendancePageLoad = {
      status: 'ok',
      learnerId: 'l',
      currentSemesterId: 's',
      selectedSemester: 's',
      semesters: [],
      overview: overview([record()])
    };
    expect(resolveAttendanceViewState(load)).toBe('loaded');
  });

  it('every failure reason, at every stage, lands on the retry card', () => {
    for (const reason of ['timeout', 'error'] as const) {
      for (const stage of Object.keys(STAGE_LABEL) as Array<keyof typeof STAGE_LABEL>) {
        const load: AttendancePageLoad = {
          status: 'failed',
          reason,
          stage,
          error: new AttendanceStageError(stage, 'x')
        };
        expect(resolveAttendanceViewState(load)).toBe('error');
      }
    }
  });

  it('a redirect decision is not a renderable state, so it reads as error', () => {
    expect(resolveAttendanceViewState({ status: 'redirect', to: '/' })).toBe('error');
  });
});
