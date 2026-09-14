/**
 * Housekeeping Feedback Gate
 * ============================================================================
 * Answers one question: which learners are attendance-blocked right now because
 * a cleaning in their room finished and nobody rated it?
 *
 * The answer is computed live by fn_cl_housekeeping_feedback_holds — there is
 * no stored flag and no cron, so nothing can fall out of sync. A hold starts
 * the day AFTER the booking date and lifts the instant any roommate rates.
 *
 * This is the ONLY surface another module imports from housekeeping.
 *
 * Identity chain (verified 2026-09-07):
 *   auth.uid()  =  profiles.id  =  hostel_allocations.learner_id   (714/714)
 *                              =  hostel_attendance.learner_id     (15,822/15,822)
 * NOTE: do NOT copy the chain in mess-rating-gate.ts, which goes
 * profiles.learner_id -> hostel_allocations.learner_id and matches zero rows.
 * ============================================================================
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import { getErrorMessage } from '@/lib/utils';
import type { FeedbackHold } from '@/types/campus-living/housekeeping';

const LOG = 'campus-living/housekeeping-feedback-gate';

export class HousekeepingFeedbackGate {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  /**
   * All active holds, optionally narrowed. Every argument is optional and null
   * means "no filter" — never coerce undefined to '' here, that would travel as
   * a real UUID, match zero rows, and silently report "no holds", letting
   * blocked learners through.
   */
  static async listHolds(
    institutionId?: string,
    blockId?: string,
    date?: string,
  ): Promise<FeedbackHold[]> {
    try {
      const { data, error } = await (this.supabase as any).rpc(
        'fn_cl_housekeeping_feedback_holds',
        {
          p_institution_id: institutionId ?? null,
          p_block_id: blockId ?? null,
          p_date: date ?? null,
        },
      );
      if (error) {
        // Distinguish "query failed" from "no holds". Returning [] on an error
        // would silently release every hold in the institution.
        logger.error(LOG, 'Failed to read feedback holds', error);
        throw error;
      }
      return (data ?? []) as FeedbackHold[];
    } catch (error) {
      logger.error(LOG, `Unexpected error in listHolds: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  /**
   * The same data keyed by learner_id, which is the shape the attendance
   * marking screen needs. A learner appears once even if two rooms somehow hold
   * them; the first hold wins for display.
   */
  static async holdsByLearner(
    institutionId?: string,
    blockId?: string,
    date?: string,
  ): Promise<Map<string, FeedbackHold>> {
    const holds = await this.listHolds(institutionId, blockId, date);
    const map = new Map<string, FeedbackHold>();
    for (const hold of holds) {
      if (!map.has(hold.learner_id)) map.set(hold.learner_id, hold);
    }
    return map;
  }
}
