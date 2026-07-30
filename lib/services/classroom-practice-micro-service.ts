// lib/services/classroom-practice-micro-service.ts
// Classroom Practice L2 — the single sealed micro-item that rides one session
// feedback submission. Substrate: 20260729184500_classroom_practice_l2_micro.sql
//
// RATIFIED INVARIANT 3 — NEVER BLOCKING. Nothing in this file throws. Every
// path resolves to "no item" / "not recorded" so a micro-item can never break
// or delay the base feedback submit it rides on. The RPCs are defensive on the
// server side too (they return {item:null} instead of raising); this layer is
// the second belt, for transport-level failures the database never sees.

import { createClientSupabaseClient } from '@/lib/supabase/client';

// Typed as any: these RPCs post-date the generated types/supabase.ts, the same
// escape hatch SessionFeedbackService uses.
const getSupabase = (): any => createClientSupabaseClient();

/** Matches the sealed_comment length cap in the migration. */
export const COMMENT_MAX_LENGTH = 2000;

/** Outcome of recording an answer. `commentInvite` is decided by the server. */
export interface AnswerResult {
  success: boolean;
  commentInvite: boolean;
}

/** One micro-item offered to the caller, already recorded server-side. */
export interface MicroItem {
  impression_id: string;
  code: string;
  name: string;
  /** The learner-worded question — catalog `description`, falling back to `name`. */
  question: string;
}

export class ClassroomPracticeMicroService {
  /** The one item riding this submission, or null when there is nothing to ask
   *  (feature off, deck cooling, backoff, no relevant item, already offered,
   *  or anything at all went wrong). Null means: render nothing. */
  static async nextItem(
    attendanceDate: string,
    timetableId: string,
    periodId: string,
  ): Promise<MicroItem | null> {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('fn_scf_micro_next_item', {
        p_attendance_date: attendanceDate,
        p_timetable_id: timetableId,
        p_period_id: periodId,
      });
      if (error) {
        console.warn('[cp-micro] next item unavailable:', error.message);
        return null;
      }
      const item = (data as { item?: MicroItem | null } | null)?.item ?? null;
      return item && item.impression_id ? item : null;
    } catch (err) {
      console.warn('[cp-micro] next item threw:', err);
      return null;
    }
  }

  /** Record the caller's own answer (0-4) or a skip. Never rejects — the caller
   *  shows the same quiet thanks state either way, because an unrecorded
   *  micro-answer is not worth alarming a learner about.
   *
   *  `commentInvite` is the server's decision (every Nth ANSWERED item about the
   *  same person, config-driven, never after a skip). The client does not count. */
  static async answer(
    impressionId: string,
    score: number | null,
    skip: boolean,
  ): Promise<AnswerResult> {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('fn_scf_micro_answer', {
        p_impression_id: impressionId,
        p_score: skip ? null : score,
        p_skip: skip,
        p_comment: null,
      });
      if (error) {
        console.warn('[cp-micro] answer not recorded:', error.message);
        return { success: false, commentInvite: false };
      }
      const row = data as { success?: boolean; comment_invite?: boolean } | null;
      return {
        success: Boolean(row?.success),
        commentInvite: Boolean(row?.success && row?.comment_invite),
      };
    } catch (err) {
      console.warn('[cp-micro] answer threw:', err);
      return { success: false, commentInvite: false };
    }
  }

  /** Attach the one optional sealed line for the Principal, as a follow-up to an
   *  already-answered item. Server-side this is the comment-only shape (no score,
   *  no skip) and it refuses to overwrite an existing comment. Silent on failure
   *  like everything else in this lane. */
  static async comment(impressionId: string, comment: string): Promise<boolean> {
    const trimmed = comment.trim();
    if (!trimmed) return false;
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('fn_scf_micro_answer', {
        p_impression_id: impressionId,
        p_score: null,
        p_skip: false,
        p_comment: trimmed.slice(0, COMMENT_MAX_LENGTH),
      });
      if (error) {
        console.warn('[cp-micro] comment not recorded:', error.message);
        return false;
      }
      return Boolean((data as { success?: boolean } | null)?.success);
    } catch (err) {
      console.warn('[cp-micro] comment threw:', err);
      return false;
    }
  }
}
