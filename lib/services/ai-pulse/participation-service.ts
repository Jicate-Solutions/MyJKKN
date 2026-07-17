/**
 * AI Pulse — Participation Service
 *
 * Surfaces OBSERVABLE raw turnout for a single AI Pulse cycle, straight from
 * the per-learner attendance table — independent of the 4-AND engagement gate.
 *
 * Why this exists:
 *   The only existing admin read of a cycle's attendance is the derived
 *   `engaged_attendance_rate` (live-session-service), which counts a learner
 *   only when ALL FOUR signals fire (joined_within_5min AND polls≥3 AND
 *   stayed_until_end AND quiz_passed). That composite can read 0% even when
 *   turnout was strong — e.g. a session where 192 learners joined, 22 took the
 *   quiz, and 19 passed shows nothing in the composite. This service counts
 *   each signal SEPARATELY so admins can see what actually happened.
 *
 * Storage (same row source as live-session-service):
 *   `ai_pulse_live_attendance` — one row per (event_id, profile_id, day_type).
 *   We read where event_id = cycleId AND day_type = 'live_session', pulling
 *   joined_at + engagement_signals (the JSONB whose shape is `EngagementSignals`
 *   in live-session-service).
 *
 * Type note:
 *   `ai_pulse_live_attendance` is NOT in the generated Supabase types, so the
 *   typed client would throw a program-shape TS2589. We follow the established
 *   convention used by live-session-service and learner-feedback-card and cast
 *   the client to `any`.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { EngagementSignals } from './live-session-service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Independent participation counts for one population (or the combined total). */
export interface ParticipationCounts {
  /** Total attendance rows. */
  total: number;
  /** Rows with a `joined_at` timestamp set. */
  joined: number;
  /** Of the joined, how many hit the on-time gate (joined_within_5min). */
  joined_on_time: number;
  /** Rows that submitted a quiz (engagement_signals.quiz_score is a number). */
  quiz_submitted: number;
  /** Rows whose quiz passed (engagement_signals.quiz_passed === true). */
  quiz_passed: number;
  /** Rows that left non-empty "what should change?" feedback text. */
  feedback_count: number;
}

/**
 * Per-cycle participation, split into the two populations that can now attend
 * AI Pulse (2026-07-16): the enrolled LEARNER cohort and the SENIOR LEARNERS
 * (facilitators / admin staff granted full participation). The flat top-level
 * fields remain the COMBINED totals (all attendees) for backward compatibility;
 * `student` and `senior` break them out so the student cohort's week-over-week
 * signal stays legible and isn't blurred by senior-learner turnout.
 */
export interface CycleParticipation extends ParticipationCounts {
  /** Enrolled learner cohort (student / cohort_member / production_learner). */
  student: ParticipationCounts;
  /** Senior learners — facilitators / admin staff (every other attending role). */
  senior: ParticipationCounts;
}

/** Roles that make up the enrolled learner cohort (everyone else = senior learner). */
export const STUDENT_COHORT_ROLES = [
  'student',
  'cohort_member',
  'production_learner',
] as const;

interface AttendanceRow {
  joined_at: string | null;
  engagement_signals: EngagementSignals | null;
  /** profiles.role via ai_pulse_live_attendance.profile_id (left-joined; may be null). */
  profiles: { role: string | null } | null;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Read raw participation counts for a single cycle's live session.
 *
 * Each metric is counted independently — a learner who joined but never took
 * the quiz still contributes to `joined`, unlike the 4-AND engaged-rate view.
 */
export async function getCycleParticipation(
  cycleId: string,
): Promise<CycleParticipation> {
  // Cast to any: ai_pulse_live_attendance is not in the generated types
  // (matches live-session-service + learner-feedback-card convention).
  const supabase = createClientSupabaseClient() as any;

  const { data, error } = await supabase
    .from('ai_pulse_live_attendance')
    .select('joined_at, engagement_signals, profiles(role)')
    .eq('event_id', cycleId)
    .eq('day_type', 'live_session');

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as AttendanceRow[];

  const empty = (): ParticipationCounts => ({
    total: 0,
    joined: 0,
    joined_on_time: 0,
    quiz_submitted: 0,
    quiz_passed: 0,
    feedback_count: 0,
  });

  const student = empty();
  const senior = empty();

  for (const row of rows) {
    const signals = row.engagement_signals ?? {};
    const role = row.profiles?.role ?? null;
    // Enrolled learner cohort vs senior learners (facilitators / admin staff).
    // A null/unknown role is counted as a senior learner so it never inflates
    // the student cohort's week-over-week baseline.
    const bucket =
      role && (STUDENT_COHORT_ROLES as readonly string[]).includes(role)
        ? student
        : senior;

    bucket.total += 1;
    if (row.joined_at) bucket.joined += 1;
    if (signals.joined_within_5min === true) bucket.joined_on_time += 1;
    if (typeof signals.quiz_score === 'number') bucket.quiz_submitted += 1;
    if (signals.quiz_passed === true) bucket.quiz_passed += 1;

    const feedback = signals.feedback_text;
    if (typeof feedback === 'string' && feedback.trim().length > 0) {
      bucket.feedback_count += 1;
    }
  }

  // Flat top-level fields = the COMBINED totals (all attendees), preserved for
  // backward compatibility; `student` / `senior` carry the "own line" split.
  return {
    total: student.total + senior.total,
    joined: student.joined + senior.joined,
    joined_on_time: student.joined_on_time + senior.joined_on_time,
    quiz_submitted: student.quiz_submitted + senior.quiz_submitted,
    quiz_passed: student.quiz_passed + senior.quiz_passed,
    feedback_count: student.feedback_count + senior.feedback_count,
    student,
    senior,
  };
}

// ---------------------------------------------------------------------------
// React Query hook
// ---------------------------------------------------------------------------

/**
 * Hook wrapping getCycleParticipation. Enabled only when cycleId is truthy.
 */
export function useCycleParticipation(
  cycleId: string | undefined,
): UseQueryResult<CycleParticipation, Error> {
  return useQuery<CycleParticipation, Error>({
    queryKey: ['ai-pulse', 'cycle-participation', cycleId],
    queryFn: () => getCycleParticipation(cycleId as string),
    enabled: !!cycleId,
  });
}

// ---------------------------------------------------------------------------
// Named roster — "who joined" (Champion Console, per-cycle)
// ---------------------------------------------------------------------------

/**
 * One learner who has an attendance row for the cycle's live session, WITH
 * identity resolved. Unlike the anonymous learner-feedback read, the Champion
 * needs names to know who did (and did not) show up.
 */
export interface JoinedLearner {
  profile_id: string;
  full_name: string;
  /** College (institutions.name via profiles.institution_id). */
  college: string | null;
  /** Department (departments.department_name via learners_profiles). */
  department: string | null;
  /** When they joined the live room; null = async make-up (quiz only, no live join). */
  joined_at: string | null;
  /** Hit the on-time gate (joined_within_5min). */
  on_time: boolean;
  /** Submitted a quiz (engagement_signals.quiz_score is a number). */
  quiz_submitted: boolean;
  /** Quiz passed (engagement_signals.quiz_passed === true). */
  quiz_passed: boolean;
  /** Which population this attendee belongs to (enrolled learner vs senior learner). */
  population: 'student' | 'senior_learner';
}

/** Embedded-row shape returned by the identity join. */
interface JoinedLearnerRow {
  profile_id: string;
  joined_at: string | null;
  engagement_signals: EngagementSignals | null;
  profiles: {
    full_name: string | null;
    role: string | null;
    institutions: { name: string | null } | null;
    learners_profiles: {
      departments: { department_name: string | null } | null;
    } | null;
  } | null;
}

/**
 * Read the named roster of learners who attended a cycle's live session.
 *
 * Same canonical source as getCycleParticipation (`ai_pulse_live_attendance`
 * filtered by event_id + day_type), extended with the identity graph. Two
 * `profiles` foreign keys are ambiguous to PostgREST and MUST be named
 * explicitly, or the embed 400s (PGRST201):
 *   - institutions   → `profiles_institution_id_fkey` (not the accreditation FK)
 *   - learners_profiles → `profiles_learner_id_fkey` (the 1:1 learner anchor,
 *     not the created_by / updated_by / verified_by back-references)
 *
 * `profiles!inner` keeps only attendees whose profile row is present. Since the
 * 2026-07-16 senior-learner rollout the roster is NO LONGER filtered to students
 * — every attendee is returned and tagged with `population` (enrolled learner vs
 * senior learner) so both show up on their own line. RLS still applies — the
 * Champion role can read these rows and profiles (verified).
 */
export async function getCycleJoinedLearners(
  cycleId: string,
): Promise<JoinedLearner[]> {
  // Cast to any: ai_pulse_live_attendance is not in the generated types
  // (matches getCycleParticipation + learner-feedback-card convention).
  const supabase = createClientSupabaseClient() as any;

  const { data, error } = await supabase
    .from('ai_pulse_live_attendance')
    .select(
      'profile_id, joined_at, engagement_signals, ' +
        'profiles!inner(full_name, role, ' +
        'institutions!profiles_institution_id_fkey(name), ' +
        'learners_profiles!profiles_learner_id_fkey(departments(department_name)))',
    )
    .eq('event_id', cycleId)
    .eq('day_type', 'live_session');

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as JoinedLearnerRow[];

  return rows
    .map((row): JoinedLearner => {
      const signals = row.engagement_signals ?? ({} as EngagementSignals);
      const role = row.profiles?.role ?? null;
      return {
        profile_id: row.profile_id,
        full_name: row.profiles?.full_name ?? '(unknown)',
        college: row.profiles?.institutions?.name ?? null,
        department:
          row.profiles?.learners_profiles?.departments?.department_name ?? null,
        joined_at: row.joined_at,
        on_time: signals.joined_within_5min === true,
        quiz_submitted: typeof signals.quiz_score === 'number',
        quiz_passed: signals.quiz_passed === true,
        population:
          role && (STUDENT_COHORT_ROLES as readonly string[]).includes(role)
            ? 'student'
            : 'senior_learner',
      };
    })
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}

/**
 * Hook wrapping getCycleJoinedLearners. Enabled only when cycleId is truthy.
 */
export function useCycleJoinedLearners(
  cycleId: string | undefined,
): UseQueryResult<JoinedLearner[], Error> {
  return useQuery<JoinedLearner[], Error>({
    queryKey: ['ai-pulse', 'cycle-joined-learners', cycleId],
    queryFn: () => getCycleJoinedLearners(cycleId as string),
    enabled: !!cycleId,
  });
}
