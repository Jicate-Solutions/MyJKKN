// ============================================================================
// OKR Learner Service
// Handles learner-specific OKRs (Core + Elective)
// ============================================================================
//
// DEPRECATED as of 2026-02-01 per Workshop Transformation Plan
// ============================================================================
// This service is deprecated. New learner goal tracking should use:
// - Competency module: lib/services/competency/learner-competency-service.ts
// - Learning Path module: (to be implemented)
//
// The database tables (learner_core_okrs, learner_okr_assignments, learner_elective_okrs)
// have been soft-deprecated with INSERT blocked via RLS policies.
// Existing data is preserved for historical reference.
//
// For new implementations, use:
// - LearnerCompetencyService for tracking learner skills/capabilities
// - CompetencyMappingService for program/course competency requirements
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  LearnerCoreOKR,
  LearnerOKRAssignment,
  LearnerElectiveOKR,
  CreateLearnerElectiveOKRDTO,
  KRStatus
} from '@/types/okr';

/**
 * @deprecated Use LearnerCompetencyService instead. This service is kept for historical data access.
 */
export class OKRLearnerService {
  private static supabase = createClientSupabaseClient();

  // ============================================================================
  // CORE OKRs (Institution-defined, required for all learners)
  // ============================================================================

  /**
   * Get core OKRs for an institution
   */
  static async getCoreOKRs(
    institutionId: string,
    filters: {
      departmentId?: string;
      programId?: string;
      semester?: string;
      isActive?: boolean;
    } = {}
  ): Promise<LearnerCoreOKR[]> {
    try {
      let query = (this.supabase as any)
        .from('learner_core_okrs')
        .select('*')
        .eq('institution_id', institutionId);

      if (filters.departmentId) {
        query = query.eq('department_id', filters.departmentId);
      }
      if (filters.programId) {
        query = query.eq('program_id', filters.programId);
      }
      if (filters.semester) {
        query = query.eq('semester', filters.semester);
      }
      if (filters.isActive !== undefined) {
        query = query.eq('is_active', filters.isActive);
      }

      query = query.order('order_index', { ascending: true });

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('[OKR] Error fetching core OKRs:', (error as any)?.message || (error as any)?.code || 'Unknown error');
      throw error;
    }
  }

  /**
   * Get learner's assigned core OKRs
   */
  static async getMyAssignedOKRs(
    academicYear?: string,
    semester?: string
  ): Promise<LearnerOKRAssignment[]> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      let query = (this.supabase as any)
        .from('learner_okr_assignments')
        .select(`
          *,
          core_okr:learner_core_okrs(*)
        `)
        .eq('learner_id', user.id)
        .eq('is_active', true);

      if (academicYear) {
        query = query.eq('academic_year', academicYear);
      }
      if (semester) {
        query = query.eq('semester', semester);
      }

      const { data, error } = await query.order('created_at', {
        ascending: false
      });

      if (error) throw error;
      return data || [];
    } catch (error: any) {
      console.error('[OKR] Error fetching assigned OKRs:', error?.message || error?.code || 'Unknown error');
      throw error;
    }
  }

  /**
   * Update progress on an assigned OKR
   */
  static async updateAssignedOKRProgress(
    assignmentId: string,
    newValue: number
  ): Promise<LearnerOKRAssignment> {
    try {
      // Get the assignment with core OKR to calculate progress
      const { data: assignment, error: fetchError } = await (
        this.supabase as any
      )
        .from('learner_okr_assignments')
        .select('*, core_okr:learner_core_okrs(*)')
        .eq('id', assignmentId)
        .single();

      if (fetchError) throw fetchError;

      // Calculate progress percentage
      const coreOKR = assignment.core_okr;
      const progress = this.calculateProgress(
        newValue,
        coreOKR.baseline_value,
        coreOKR.target_value
      );

      // Determine status based on progress
      const status = this.determineStatus(progress);

      const { data, error } = await (this.supabase as any)
        .from('learner_okr_assignments')
        .update({
          current_value: newValue,
          progress,
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', assignmentId)
        .select()
        .single();

      if (error) throw error;

      toast.success('Progress updated');
      return data;
    } catch (error) {
      console.error('[OKR] Error updating assignment progress:', (error as any)?.message || (error as any)?.code || 'Unknown error');
      toast.error('Failed to update progress');
      throw error;
    }
  }

  // ============================================================================
  // ELECTIVE OKRs (Self-set by learners)
  // ============================================================================

  /**
   * Get a single elective OKR by ID
   */
  static async getElectiveOKRById(id: string): Promise<LearnerElectiveOKR> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await (this.supabase as any)
        .from('learner_elective_okrs')
        .select('*')
        .eq('id', id)
        .eq('learner_id', user.id)
        .eq('is_active', true)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Elective OKR not found');

      return data;
    } catch (error) {
      console.error('[OKR] Error fetching elective OKR:', (error as any)?.message || (error as any)?.code || 'Unknown error');
      throw error;
    }
  }

  /**
   * Get learner's elective OKRs
   */
  static async getMyElectiveOKRs(): Promise<LearnerElectiveOKR[]> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await (this.supabase as any)
        .from('learner_elective_okrs')
        .select('*')
        .eq('learner_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('[OKR] Error fetching elective OKRs:', (error as any)?.message || (error as any)?.code || 'Unknown error');
      throw error;
    }
  }

  /**
   * Create a new elective OKR
   */
  static async createElectiveOKR(
    input: CreateLearnerElectiveOKRDTO
  ): Promise<LearnerElectiveOKR> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await (this.supabase as any)
        .from('learner_elective_okrs')
        .insert([
          {
            learner_id: user.id,
            title: input.title,
            description: input.description,
            why_matters: input.why_matters,
            baseline_value: input.baseline_value || 0,
            target_value: input.target_value || 100,
            current_value: input.baseline_value || 0,
            unit: input.unit || 'percent',
            deadline: input.deadline,
            progress: 0,
            status: 'not_started',
            is_active: true
          }
        ])
        .select()
        .single();

      if (error) throw error;

      toast.success('Elective OKR created');
      return data;
    } catch (error) {
      console.error('[OKR] Error creating elective OKR:', (error as any)?.message || (error as any)?.code || 'Unknown error');
      toast.error('Failed to create elective OKR');
      throw error;
    }
  }

  /**
   * Update elective OKR
   */
  static async updateElectiveOKR(
    id: string,
    input: Partial<CreateLearnerElectiveOKRDTO>
  ): Promise<LearnerElectiveOKR> {
    try {
      const { data, error } = await (this.supabase as any)
        .from('learner_elective_okrs')
        .update({
          ...input,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      toast.success('Elective OKR updated');
      return data;
    } catch (error) {
      console.error('[OKR] Error updating elective OKR:', (error as any)?.message || (error as any)?.code || 'Unknown error');
      toast.error('Failed to update elective OKR');
      throw error;
    }
  }

  /**
   * Update progress on elective OKR
   */
  static async updateElectiveOKRProgress(
    id: string,
    newValue: number
  ): Promise<LearnerElectiveOKR> {
    try {
      // Get current OKR to calculate progress
      const { data: okr, error: fetchError } = await (this.supabase as any)
        .from('learner_elective_okrs')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      const progress = this.calculateProgress(
        newValue,
        okr.baseline_value || 0,
        okr.target_value || 100
      );

      const status = this.determineStatus(progress);

      const { data, error } = await (this.supabase as any)
        .from('learner_elective_okrs')
        .update({
          current_value: newValue,
          progress,
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      toast.success('Progress updated');
      return data;
    } catch (error) {
      console.error('[OKR] Error updating elective progress:', (error as any)?.message || (error as any)?.code || 'Unknown error');
      toast.error('Failed to update progress');
      throw error;
    }
  }

  /**
   * Delete (deactivate) elective OKR
   */
  static async deleteElectiveOKR(id: string): Promise<void> {
    try {
      const { error } = await (this.supabase as any)
        .from('learner_elective_okrs')
        .update({
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      toast.success('Elective OKR removed');
    } catch (error) {
      console.error('[OKR] Error deleting elective OKR:', (error as any)?.message || (error as any)?.code || 'Unknown error');
      toast.error('Failed to remove elective OKR');
      throw error;
    }
  }

  // ============================================================================
  // COMBINED VIEW
  // ============================================================================

  /**
   * Get all OKRs for current learner (core + elective)
   */
  static async getAllMyOKRs(): Promise<{
    core: LearnerOKRAssignment[];
    elective: LearnerElectiveOKR[];
    summary: {
      total: number;
      onTrack: number;
      atRisk: number;
      behind: number;
      completed: number;
    };
  }> {
    try {
      const [core, elective] = await Promise.all([
        this.getMyAssignedOKRs(),
        this.getMyElectiveOKRs()
      ]);

      // Calculate summary
      const allStatuses = [
        ...core.map((c) => c.status),
        ...elective.map((e) => e.status)
      ];

      const summary = {
        total: allStatuses.length,
        onTrack: allStatuses.filter((s) => s === 'on_track').length,
        atRisk: allStatuses.filter((s) => s === 'at_risk').length,
        behind: allStatuses.filter((s) => s === 'behind' || s === 'blocked')
          .length,
        completed: allStatuses.filter((s) => s === 'completed').length
      };

      return { core, elective, summary };
    } catch (error) {
      console.error('[OKR] Error fetching all OKRs:', (error as any)?.message || (error as any)?.code || 'Unknown error');
      throw error;
    }
  }

  /**
   * Get learner OKR dashboard data
   */
  static async getLearnerDashboard(): Promise<{
    coreProgress: number;
    electiveProgress: number;
    overallProgress: number;
    nextDeadline: string | null;
    streak: number;
  }> {
    try {
      const { core, elective } = await this.getAllMyOKRs();

      // Calculate core progress (average)
      const coreProgress =
        core.length > 0
          ? Math.round(
              core.reduce((sum, c) => sum + (c.progress || 0), 0) / core.length
            )
          : 0;

      // Calculate elective progress
      const electiveProgress =
        elective.length > 0
          ? Math.round(
              elective.reduce((sum, e) => sum + (e.progress || 0), 0) /
                elective.length
            )
          : 0;

      // Overall is weighted 60% core, 40% elective
      const overallProgress =
        core.length > 0 && elective.length > 0
          ? Math.round(coreProgress * 0.6 + electiveProgress * 0.4)
          : core.length > 0
            ? coreProgress
            : electiveProgress;

      // Find next deadline (only elective OKRs have explicit deadlines)
      // Core OKRs follow semester timeline
      const allDeadlines = elective
        .map((e) => e.deadline)
        .filter(Boolean)
        .filter((d) => new Date(d) > new Date())
        .sort();

      const nextDeadline = allDeadlines[0] || null;

      // Get check-in streak from compliance
      const { data: { user } } = await this.supabase.auth.getUser();
      let streak = 0;
      if (user) {
        const { data: userStatus } = await (this.supabase as any)
          .from('okr_user_status')
          .select('consecutive_on_track_weeks')
          .eq('user_id', user.id)
          .single();
        streak = userStatus?.consecutive_on_track_weeks || 0;
      }

      return {
        coreProgress,
        electiveProgress,
        overallProgress,
        nextDeadline,
        streak
      };
    } catch (error) {
      console.error('[OKR] Error fetching learner dashboard:', (error as any)?.message || (error as any)?.code || 'Unknown error');
      throw error;
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Calculate progress percentage
   */
  private static calculateProgress(
    current: number,
    baseline: number,
    target: number
  ): number {
    if (target === baseline) return current >= target ? 100 : 0;
    const progress = ((current - baseline) / (target - baseline)) * 100;
    return Math.min(Math.max(Math.round(progress), 0), 100);
  }

  /**
   * Determine status based on progress and deadline
   */
  private static determineStatus(progress: number): KRStatus {
    if (progress >= 100) return 'completed';
    if (progress >= 70) return 'on_track';
    if (progress >= 40) return 'at_risk';
    return 'behind';
  }
}
