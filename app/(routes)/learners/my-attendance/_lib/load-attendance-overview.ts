/**
 * Loading My Attendance without a way to get stuck.
 *
 * Two learners reported this page as a loading skeleton that never resolves
 * (BUG-004853, BUG-004856). A server component that awaits a slow read has no
 * deadline of its own: if the read never comes back, the render never comes
 * back, and the skeleton is all the learner ever gets.
 *
 * So the await gets a deadline, and every way the load can fail collapses into
 * one outcome the page knows how to render. The deadline does not cancel the
 * query — nothing here can — but it does return control to the render, which is
 * the difference between an error the learner can retry and a page that hangs.
 */

import {
  StudentAttendanceService,
  type AttendanceOverview
} from '@/lib/services/learners/student-attendance-service';

/** How long a learner waits before being offered a retry instead. */
export const ATTENDANCE_LOAD_TIMEOUT_MS = 10_000;

/** Raised when the load outran its deadline. */
export class AttendanceLoadTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Attendance did not load within ${timeoutMs}ms.`);
    this.name = 'AttendanceLoadTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/**
 * What the page got. `failed` carries why, so the log line can say which.
 */
export type AttendanceLoadOutcome =
  | { status: 'ok'; overview: AttendanceOverview }
  | { status: 'failed'; reason: 'timeout' | 'error'; error: unknown };

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

/**
 * The page's single load step. Never throws: every failure, including the
 * deadline, comes back as a `failed` outcome.
 */
export async function loadAttendanceOverview(
  learnerId: string,
  semesterId: string,
  timeoutMs: number = ATTENDANCE_LOAD_TIMEOUT_MS
): Promise<AttendanceLoadOutcome> {
  try {
    const overview = await withDeadline(
      StudentAttendanceService.getAttendanceOverview(learnerId, semesterId),
      timeoutMs
    );
    return { status: 'ok', overview };
  } catch (error) {
    const reason = error instanceof AttendanceLoadTimeoutError ? 'timeout' : 'error';
    console.error(`[learners/my-attendance] Attendance load failed (${reason}):`, error);
    return { status: 'failed', reason, error };
  }
}

/** Which of the page's three states to render. */
export type AttendanceViewState = 'error' | 'empty' | 'loaded';

/**
 * The page has exactly three states, and this is the only place that decides
 * between them. A failed load — for any reason, deadline included — is 'error',
 * never 'empty'.
 */
export function resolveAttendanceViewState(outcome: AttendanceLoadOutcome): AttendanceViewState {
  if (outcome.status === 'failed') return 'error';
  return outcome.overview.records.length === 0 ? 'empty' : 'loaded';
}
