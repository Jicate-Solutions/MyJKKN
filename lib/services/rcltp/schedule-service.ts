/**
 * MyJKKN RCLTP — Schedule domain service (Phase B)
 * ----------------------------------------------------------------------------
 * Tables: rcltp_assessment_schedule (§3.13), rcltp_practice_assignments (§3.9).
 *
 * Follows the canonical rcltp pattern (see passages-service.ts):
 *   - class with `static` methods + a singleton `createClientSupabaseClient()`
 *   - `(this.supabase as any).from('rcltp_*')` (generated Database type lacks
 *     rcltp_ tables; the cast is the MyJKKN convention)
 *   - tenant scoping by institution_id (both tables are institution-owned,
 *     institution_id NOT NULL — NOT library tables, so no global-row .or trick)
 *   - schedule READS + STAFF writes go through the client (RLS §6.13 allows them)
 *   - practice assignment READS go through the client (RLS §6.10 allows staff +
 *     own-student read)
 *   - STUDENT-affecting writes (practice completion) are stubs → server-side
 *     route (migration §6.10)
 *   - content/formula-dependent logic (adaptive 5/3/1 assignment) is stubbed →
 *     awaiting MyJKKN
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  RcltpAssessmentSchedule,
  RcltpPracticeAssignment,
  RcltpScheduleFilters,
  RcltpPracticeAssignmentFilters,
  RcltpListResponse,
  CreateRcltpScheduleDto,
  UpdateRcltpScheduleDto,
} from '@/types/rcltp';
import {
  rcltpRange,
  rcltpMetadata,
  rcltpPostJson,
  rcltpAwaitingValidationContent,
} from './rcltp-helpers';

export class RcltpScheduleService {
  private static supabase = createClientSupabaseClient();

  // -------------------------------------------------------------------------
  // SCHEDULE — reads (RLS §6.13: staff/institution; students don't read it)
  // -------------------------------------------------------------------------

  static async getSchedule(
    filters: RcltpScheduleFilters = {}
  ): Promise<RcltpListResponse<RcltpAssessmentSchedule>> {
    try {
      const { from, to, page, limit } = rcltpRange(filters.page, filters.limit);
      let query = (this.supabase as any)
        .from('rcltp_assessment_schedule')
        .select('*', { count: 'exact' });

      if (filters.institution_id)
        query = query.eq('institution_id', filters.institution_id);
      if (filters.academic_year_id)
        query = query.eq('academic_year_id', filters.academic_year_id);
      if (filters.cycle_no !== undefined)
        query = query.eq('cycle_no', filters.cycle_no);
      if (filters.status) query = query.eq('status', filters.status);

      query = query.range(from, to).order('cycle_no', { ascending: true });

      const { data, error, count } = await query;
      if (error) throw error;
      return {
        data: (data ?? []) as RcltpAssessmentSchedule[],
        metadata: rcltpMetadata(count, page, limit),
      };
    } catch (error) {
      console.error('RcltpScheduleService.getSchedule error:', error);
      throw error;
    }
  }

  static async getScheduleById(id: string): Promise<RcltpAssessmentSchedule> {
    const { data, error } = await (this.supabase as any)
      .from('rcltp_assessment_schedule')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    if (!data) throw new Error('Schedule window not found');
    return data as RcltpAssessmentSchedule;
  }

  // -------------------------------------------------------------------------
  // PRACTICE ASSIGNMENTS — reads (RLS §6.10: staff/institution + own student)
  // -------------------------------------------------------------------------

  static async getPracticeAssignments(
    filters: RcltpPracticeAssignmentFilters = {}
  ): Promise<RcltpListResponse<RcltpPracticeAssignment>> {
    try {
      const { from, to, page, limit } = rcltpRange(filters.page, filters.limit);
      let query = (this.supabase as any)
        .from('rcltp_practice_assignments')
        .select('*', { count: 'exact' });

      if (filters.institution_id)
        query = query.eq('institution_id', filters.institution_id);
      if (filters.learner_id) query = query.eq('learner_id', filters.learner_id);
      if (filters.week_of) query = query.eq('week_of', filters.week_of);
      if (filters.status) query = query.eq('status', filters.status);

      query = query.range(from, to).order('week_of', { ascending: false });

      const { data, error, count } = await query;
      if (error) throw error;
      return {
        data: (data ?? []) as RcltpPracticeAssignment[],
        metadata: rcltpMetadata(count, page, limit),
      };
    } catch (error) {
      console.error('RcltpScheduleService.getPracticeAssignments error:', error);
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // SCHEDULE — staff writes (RLS §6.13: rcltp.assessment.manage)
  // -------------------------------------------------------------------------

  static async createScheduleWindow(
    input: CreateRcltpScheduleDto
  ): Promise<RcltpAssessmentSchedule> {
    const { data, error } = await (this.supabase as any)
      .from('rcltp_assessment_schedule')
      .insert([input])
      .select()
      .single();
    if (error) throw error;
    toast.success('Schedule window created');
    return data as RcltpAssessmentSchedule;
  }

  static async updateScheduleWindow(
    id: string,
    input: UpdateRcltpScheduleDto
  ): Promise<RcltpAssessmentSchedule> {
    const { data, error } = await (this.supabase as any)
      .from('rcltp_assessment_schedule')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    toast.success('Schedule window updated');
    return data as RcltpAssessmentSchedule;
  }

  static async confirmScheduleWindow(
    id: string,
    confirmedBy: string
  ): Promise<RcltpAssessmentSchedule> {
    const { data, error } = await (this.supabase as any)
      .from('rcltp_assessment_schedule')
      .update({
        status: 'confirmed',
        confirmed_by: confirmedBy,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    toast.success('Schedule window confirmed');
    return data as RcltpAssessmentSchedule;
  }

  static async deleteScheduleWindow(id: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('rcltp_assessment_schedule')
      .delete()
      .eq('id', id);
    if (error) throw error;
    toast.success('Schedule window deleted');
  }

  // -------------------------------------------------------------------------
  // DEFERRED — content/formula pipeline → awaiting MyJKKN
  // -------------------------------------------------------------------------

  /**
   * Generate this learner's weekly adaptive practice set (5/3/1 exercises by
   * band). The 5/3/1-by-band allocation depends on MyJKKN's band model, so this
   * is deferred until that content/spec lands.
   */
  static async assignWeeklyPractice(
    _learnerId: string
  ): Promise<RcltpPracticeAssignment> {
    return rcltpAwaitingValidationContent(
      'adaptive practice assignment (5/3/1 by band)'
    );
  }

  // -------------------------------------------------------------------------
  // DEFERRED — student-affecting write (practice completion) → server route
  // -------------------------------------------------------------------------

  /**
   * Record a learner's completion of an assigned practice set. exercises_completed
   * drives band progression, so a student cannot self-mark it — this runs
   * server-side only (service-role), never from the client (migration §6.10).
   */
  static async recordPracticeCompletion(
    assignmentId: string,
    exercisesCompleted?: number
  ): Promise<RcltpPracticeAssignment> {
    // Server route derives the learner from the session, verifies ownership, then writes.
    return rcltpPostJson<RcltpPracticeAssignment>(
      `/api/rcltp/practice/${assignmentId}/complete`,
      { exercises_completed: exercisesCompleted }
    );
  }
}
