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

export interface CycleParticipation {
  /** Total attendance rows for this cycle's live session. */
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

interface AttendanceRow {
  joined_at: string | null;
  engagement_signals: EngagementSignals | null;
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
    .select('joined_at, engagement_signals')
    .eq('event_id', cycleId)
    .eq('day_type', 'live_session');

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as AttendanceRow[];

  const result: CycleParticipation = {
    total: rows.length,
    joined: 0,
    joined_on_time: 0,
    quiz_submitted: 0,
    quiz_passed: 0,
    feedback_count: 0,
  };

  for (const row of rows) {
    const signals = row.engagement_signals ?? {};

    if (row.joined_at) result.joined += 1;
    if (signals.joined_within_5min === true) result.joined_on_time += 1;
    if (typeof signals.quiz_score === 'number') result.quiz_submitted += 1;
    if (signals.quiz_passed === true) result.quiz_passed += 1;

    const feedback = signals.feedback_text;
    if (typeof feedback === 'string' && feedback.trim().length > 0) {
      result.feedback_count += 1;
    }
  }

  return result;
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
