/**
 * Loading My Attendance without a way to get stuck, and without blaming the
 * learner for our own failures.
 *
 * Two learners reported this page as a loading skeleton that never resolves
 * (BUG-004853, BUG-004856). Three separate things could produce that, or
 * something just as dead:
 *
 *   1. A server component that awaits a slow read has no deadline of its own.
 *      If any read never comes back, the render never comes back, and the
 *      skeleton is all the learner ever gets. Cutting four attendance reads to
 *      one makes that less likely without making it impossible — and the
 *      attendance read was never the only read on this page. Authentication,
 *      the profile lookup, the lifecycle check, the learner row and the
 *      semester list all ran first, each one able to hang on its own.
 *
 *   2. A read that FAILS used to be indistinguishable from a read that found
 *      nothing, so a refused query became a confident "No Attendance Records".
 *
 *   3. A read that fails used to redirect. The profile query discarded its
 *      error and sent the learner to "/" on missing data; the lifecycle check
 *      returns `reason: 'database_error'` and sent them to the login page. A
 *      database failure then looks like "your account is not allowed here",
 *      which is a dead end the learner cannot diagnose and will not report
 *      accurately.
 *
 * So: every read on this page happens here, inside ONE deadline, and the result
 * is one of three answers. "You may not be here" redirects. "We could not find
 * out" renders a retry. Only a clean negative answer redirects.
 *
 * The deadline does not cancel the query — nothing here can — but it returns
 * control to the render, which is the difference between an error the learner
 * can retry and a page that hangs.
 *
 * The shape follows the pattern the repo already uses for this class of bug:
 * app/(routes)/ai-pulse/my-pulse/page.tsx (#3871) for "could not find out"
 * versus "may not", and
 * app/(routes)/organizations/institutions/_lib/institution-load-failure.ts for
 * putting a page's decision somewhere a test can reach it.
 */

import { createClient } from '@/lib/supabase/server';
import { StudentValidationService } from '@/lib/services/auth/student-validation-service';
import {
  StudentAttendanceService,
  type AttendanceOverview
} from '@/lib/services/learners/student-attendance-service';

/** How long a learner waits, across ALL of this page's reads, before a retry. */
export const ATTENDANCE_LOAD_TIMEOUT_MS = 10_000;

/** Which read we were on. Named in the log line and in the failed outcome. */
export type AttendanceLoadStage =
  | 'session'
  | 'profile'
  | 'validation'
  | 'learner'
  | 'semesters'
  | 'attendance';

/** Human wording for the retry card, so it can say what did not load. */
export const STAGE_LABEL: Record<AttendanceLoadStage, string> = {
  session: 'your sign-in',
  profile: 'your profile',
  validation: 'your access to this page',
  learner: 'your learner record',
  semesters: 'your semester list',
  attendance: 'your attendance'
};

/** Raised when the whole page load outran its deadline. */
export class AttendanceLoadTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Attendance did not load within ${timeoutMs}ms.`);
    this.name = 'AttendanceLoadTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/** A read that failed, tagged with which read it was. */
export class AttendanceStageError extends Error {
  readonly stage: AttendanceLoadStage;

  constructor(stage: AttendanceLoadStage, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'AttendanceStageError';
    this.stage = stage;
  }
}

/** One semester in the filter dropdown. */
export interface SemesterOption {
  id: string;
  semester_name: string;
}

/**
 * The three answers. `redirect` is a decision, not an action: this module never
 * calls Next's redirect() itself, because a redirect throws and a throw inside
 * a bounded load would be caught and reported as a failure. The page calls it.
 */
export type AttendancePageLoad =
  | { status: 'redirect'; to: string }
  | {
      status: 'failed';
      reason: 'timeout' | 'error';
      stage: AttendanceLoadStage;
      error: unknown;
    }
  | {
      status: 'ok';
      learnerId: string;
      currentSemesterId: string;
      selectedSemester: string;
      semesters: SemesterOption[];
      overview: AttendanceOverview;
    };

/**
 * A Next.js control-flow signal (redirect, notFound) travels as a thrown object
 * carrying a NEXT_* digest. Swallowing one turns a working redirect into a
 * mystery, so it is always re-thrown.
 */
function isNextControlFlowSignal(error: unknown): boolean {
  const digest = (error as { digest?: unknown })?.digest;
  return typeof digest === 'string' && digest.startsWith('NEXT_');
}

/**
 * "Nobody is signed in" and "we could not tell who is signed in" arrive from
 * Supabase auth in the same shape. Only the first belongs at the login page.
 */
export function isMissingSession(error: { message?: string } | null | undefined): boolean {
  if (!error) return true; // no user and no reason given — treat as no session
  return /auth session missing|no authenticated user|not authenticated|jwt|refresh token/i.test(
    error.message ?? ''
  );
}

/**
 * Resolve `promise`, or reject with AttendanceLoadTimeoutError once `timeoutMs`
 * has passed. The timer is always cleared, so a fast resolution does not hold
 * the render open waiting for it.
 */
export async function withDeadline<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new AttendanceLoadTimeoutError(timeoutMs)), timeoutMs);
  });

  try {
    return await Promise.race([promise, deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Extract semester number from semester_code (e.g. "BPHARM-SEM-5" → 5). */
function extractSemesterNumber(code: string | null): number {
  if (!code) return 0;
  const match = code.match(/(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Every read this page needs, in order, throwing AttendanceStageError when one
 * fails. `progress` is updated as it goes so a timeout can name the read it was
 * waiting on.
 */
async function readAttendancePage(
  requestedSemester: string | undefined,
  progress: { stage: AttendanceLoadStage }
): Promise<Extract<AttendancePageLoad, { status: 'redirect' | 'ok' }>> {
  progress.stage = 'session';
  const supabase = await createClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData?.user;

  if (!user) {
    // Genuinely signed out — send them to sign in. A transport failure dressed
    // as this would strand them on a login page that also cannot work, so it
    // is surfaced as a failure instead.
    if (isMissingSession(userError)) {
      return { status: 'redirect', to: '/auth/login' };
    }
    throw new AttendanceStageError('session', 'Could not confirm who is signed in.', userError);
  }

  progress.stage = 'profile';
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('learner_id, role')
    .eq('id', user.id)
    .single();

  // The read failing is not the same as the answer being "you are not a
  // learner". Only the answer may redirect.
  if (profileError) {
    throw new AttendanceStageError('profile', 'Could not read your profile.', profileError);
  }

  if (!profile || profile.role !== 'student' || !profile.learner_id) {
    return { status: 'redirect', to: '/' };
  }

  const learnerId = profile.learner_id as string;

  progress.stage = 'validation';
  const validation = await StudentValidationService.validateStudentAccess(user.id);

  // validateStudentAccess answers a failed query with
  // `{ allowed: false, reason: 'database_error' }`. Redirecting on that tells
  // the learner their account is the problem.
  if (validation.reason === 'database_error') {
    throw new AttendanceStageError('validation', 'Could not check your access to this page.');
  }

  if (!validation.allowed) {
    return { status: 'redirect', to: `/auth/login?reason=${validation.reason}` };
  }

  progress.stage = 'learner';
  const { data: learner, error: learnerError } = await supabase
    .from('learners_profiles')
    .select('semester_id, program_id, institution_id')
    .eq('id', learnerId)
    .single();

  if (learnerError || !learner) {
    // The profile points at this row, so its absence is a broken link rather
    // than an empty semester. Either way we cannot say what to show.
    throw new AttendanceStageError(
      'learner',
      'Could not read your learner record.',
      learnerError ?? undefined
    );
  }

  const currentSemesterId = learner.semester_id || '';
  const selectedSemester = requestedSemester || currentSemesterId;

  progress.stage = 'semesters';
  // Deliberately NOT fatal. The semester list only drives the filter dropdown,
  // and losing the dropdown is a smaller harm than refusing to show attendance
  // we can read. It sits inside the deadline, so it can degrade but not hang.
  const { data: allSemesters, error: semestersError } = await supabase
    .from('semesters')
    .select('id, semester_name, semester_code')
    .eq('program_id', learner.program_id)
    .eq('institution_id', learner.institution_id)
    .eq('is_active', true)
    .order('semester_name');

  if (semestersError) {
    console.error('[learners/my-attendance] Semester list unavailable:', semestersError);
  }

  const semesterRows = allSemesters ?? [];
  const currentSem = semesterRows.find(s => s.id === currentSemesterId);
  const currentSemNumber = extractSemesterNumber(currentSem?.semester_code ?? null);

  // Only show current and past semesters (not future ones)
  const semesters: SemesterOption[] = semesterRows
    .filter(s => extractSemesterNumber(s.semester_code) <= currentSemNumber)
    .map(({ id, semester_name }) => ({ id, semester_name }));

  progress.stage = 'attendance';
  // ONE read. getAttendanceOverview derives statistics, course-wise and trend
  // from it, and throws when the read failed rather than returning empty.
  const overview = await StudentAttendanceService.getAttendanceOverview(
    learnerId,
    selectedSemester
  );

  return {
    status: 'ok',
    learnerId,
    currentSemesterId,
    selectedSemester,
    semesters,
    overview
  };
}

/**
 * The page's single load step. Never throws, except for a Next.js control-flow
 * signal: every real failure, the deadline included, comes back as a `failed`
 * outcome naming the read it was on.
 */
export async function loadAttendancePage(
  requestedSemester: string | undefined,
  timeoutMs: number = ATTENDANCE_LOAD_TIMEOUT_MS
): Promise<AttendancePageLoad> {
  const progress: { stage: AttendanceLoadStage } = { stage: 'session' };

  try {
    return await withDeadline(readAttendancePage(requestedSemester, progress), timeoutMs);
  } catch (error) {
    if (isNextControlFlowSignal(error)) throw error;

    const timedOut = error instanceof AttendanceLoadTimeoutError;
    const stage = error instanceof AttendanceStageError ? error.stage : progress.stage;

    console.error(
      `[learners/my-attendance] Load failed at "${stage}" (${timedOut ? 'timeout' : 'error'}):`,
      error
    );

    return { status: 'failed', reason: timedOut ? 'timeout' : 'error', stage, error };
  }
}

/** Which of the page's three states to render. */
export type AttendanceViewState = 'error' | 'empty' | 'loaded';

/**
 * The page has exactly three states, and this is the only place that chooses
 * between them. A failed load — any read, any reason, deadline included — is
 * 'error', never 'empty'.
 */
export function resolveAttendanceViewState(load: AttendancePageLoad): AttendanceViewState {
  if (load.status !== 'ok') return 'error';
  return load.overview.records.length === 0 ? 'empty' : 'loaded';
}
