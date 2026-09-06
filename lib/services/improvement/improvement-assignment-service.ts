/**
 * MBA Improvement Board — per-idea assignment (browser client).
 * ============================================================================
 *
 * WHAT THIS IS FOR
 *   34 of the board's 55 ideas sit in 'logged', the oldest since 4 August, while
 *   27 different people are entitled to move them. Nothing routed any one idea to
 *   any one person, so triage was initiative rather than duty. This service names
 *   the accountable human for a single idea.
 *
 * ONE WRITE PATH, AND IT IS AN RPC
 *   `improvement_ideas.assignee_id` / `assigned_by` / `assigned_at` are written
 *   ONLY by the SECURITY DEFINER RPC `fn_improvement_assign_idea`
 *   (supabase/migrations/20261110000000_improvement_idea_assignee.sql). Do not
 *   add a direct `.update({ assignee_id })` here as a shortcut: the base
 *   improvement_ideas_update policy would actually let a board manager through,
 *   which is exactly what makes the shortcut dangerous. A raw PATCH skips the
 *   stamps, skips the `improvement_idea_activity` timeline row (that table has no
 *   INSERT policy at all, so a client cannot write it), and skips the assignee's
 *   notification — leaving an assignment nobody can see and nobody was told about.
 *
 * NOT AN hr_additional_roles ROW, DELIBERATELY
 *   Department-level ownership rides `hr_additional_roles.role_type =
 *   'department_owner'` (see department-owner-service.ts:37-43), and the
 *   organogram approve path `fn_mba_dept_role_assignments_sync` end-dates every
 *   current role whose type is not an organogram title — silently un-assigning
 *   those owners. Per-idea assignment is a column on the idea instead, which that
 *   sync cannot reach. The two concepts stay separate on purpose.
 *
 * MANUAL, NOT AUTO-ROUTED
 *   A manager picks the person. Auto-routing area -> current department owner is
 *   the obvious follow-up and is deliberately unbuilt: it would route only 4 of
 *   the 10 areas in use today, because only 4 department_owner rows exist.
 *
 * The `improvement_*` tables are live in prod but absent from the generated
 * `types/supabase.ts`, so calls cast through `(supabase as any)` — the same
 * pattern every sibling improvement service uses.
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

const MODULE = 'improvement/assignment';

/** The RPC that owns the three assignment columns. Exported so the test can pin it. */
export const ASSIGN_IDEA_RPC = 'fn_improvement_assign_idea';

/** The assignment fields carried by an idea row. */
export interface ImprovementIdeaAssignment {
  /** The one named person accountable, or null when the idea is on the shared board. */
  assignee_id: string | null;
  /** The board manager who assigned it. Null whenever assignee_id is null. */
  assigned_by: string | null;
  /** When the current assignment was made. Null whenever assignee_id is null. */
  assigned_at: string | null;
}

export class ImprovementAssignmentService {
  private static getSupabase() {
    return createClientSupabaseClient();
  }

  /**
   * Name the person accountable for one idea, or pass `null` to lift the
   * assignment and put the idea back on the shared board.
   *
   * Manager-only — enforced inside the RPC, not here, so a caller cannot skip it.
   * Re-assigning to the person who already holds it is a no-op server-side: no
   * duplicate timeline row and no duplicate notification.
   *
   * The assignee is notified in BOTH `notifications` and `user_notifications`.
   * That second write is the one the board's existing untriaged sweep omits,
   * which is why its 10 notices reached 0 bells (measured 2026-09-06).
   */
  static async assign(ideaId: string, assigneeId: string | null): Promise<void> {
    const supabase = this.getSupabase();
    const { error } = await (supabase as any).rpc(ASSIGN_IDEA_RPC, {
      p_idea_id: ideaId,
      p_assignee_id: assigneeId,
    });
    if (error) {
      logger.error(MODULE, 'Error assigning improvement idea', error);
      throw new Error(error.message || 'Failed to assign the idea.');
    }
  }

  /**
   * Lift the assignment — the idea goes back to the shared board and its
   * assigned_by / assigned_at stamps are cleared with it. A named alias for
   * `assign(ideaId, null)`, because `null` at a call site reads as an accident.
   */
  static async unassign(ideaId: string): Promise<void> {
    return this.assign(ideaId, null);
  }
}
