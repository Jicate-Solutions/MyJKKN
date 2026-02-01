// ============================================================================
// Learner Competency Service
// Handles individual learner competency tracking and progress
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  LearnerCompetency,
  CompetencyListResponse,
  LearnerCompetencyFilters,
  UpsertLearnerCompetencyDTO,
  AddCompetencyEvidenceDTO,
  RecordCompetencyAssessmentDTO,
  VerifyLearnerCompetencyDTO,
  LearnerCompetencyProgress,
  LearnerCompetencyDashboard,
  CompetencyGapAnalysis,
  CompetencyEvidence,
  CompetencyAssessment,
  ProficiencyLevel
} from '@/types/competency';

export class LearnerCompetencyService {
  private static getSupabase() {
    return createClientSupabaseClient();
  }

  private static isValidUUID(id: string | undefined | null): boolean {
    if (!id || typeof id !== 'string' || id === 'undefined' || id === 'null' || id.trim() === '') {
      return false;
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  }

  private static validateId(id: string | undefined | null, fieldName: string = 'ID'): void {
    if (!this.isValidUUID(id)) {
      const actualValue = id === undefined ? 'undefined' : id === null ? 'null' : `"${id}"`;
      throw new Error(`Invalid ${fieldName}: ${actualValue}. Expected a valid UUID.`);
    }
  }

  private static formatError(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'object' && error !== null) {
      const e = error as Record<string, unknown>;
      if (e.message) return String(e.message);
      return JSON.stringify(error);
    }
    return String(error);
  }

  /**
   * Get learner competencies with filters
   */
  static async getLearnerCompetencies(
    filters: LearnerCompetencyFilters = {}
  ): Promise<CompetencyListResponse<LearnerCompetency>> {
    try {
      if (filters.learner_id) this.validateId(filters.learner_id, 'learner_id');
      if (filters.competency_id) this.validateId(filters.competency_id, 'competency_id');

      let query = (this.getSupabase() as any)
        .from('learner_competencies')
        .select(`
          *,
          competency:competency_catalog(
            id,
            competency_code,
            competency_name,
            competency_type,
            proficiency_levels,
            evidence_requirements
          ),
          learner:learners_profiles(id, full_name, roll_number),
          verifier:profiles!verified_by(id, full_name)
        `, { count: 'exact' });

      if (filters.learner_id) {
        query = query.eq('learner_id', filters.learner_id);
      }
      if (filters.competency_id) {
        query = query.eq('competency_id', filters.competency_id);
      }
      if (filters.current_level) {
        if (Array.isArray(filters.current_level)) {
          query = query.in('current_level', filters.current_level);
        } else {
          query = query.eq('current_level', filters.current_level);
        }
      }
      if (filters.verified !== undefined) {
        if (filters.verified) {
          query = query.not('verified_at', 'is', null);
        } else {
          query = query.is('verified_at', null);
        }
      }

      const page = filters.page || 1;
      const limit = filters.limit || 20;
      const from = (page - 1) * limit;
      query = query
        .range(from, from + limit - 1)
        .order('updated_at', { ascending: false });

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        data: data || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };
    } catch (error) {
      console.error('[LearnerCompetency] Error fetching:', this.formatError(error));
      throw error;
    }
  }

  /**
   * Get single learner competency record
   */
  static async getLearnerCompetencyById(id: string): Promise<LearnerCompetency> {
    try {
      this.validateId(id, 'learner competency ID');

      const { data, error } = await (this.getSupabase() as any)
        .from('learner_competencies')
        .select(`
          *,
          competency:competency_catalog(*),
          learner:learners_profiles(id, full_name, roll_number),
          verifier:profiles!verified_by(id, full_name)
        `)
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Learner competency record not found');

      return data;
    } catch (error) {
      console.error('[LearnerCompetency] Error fetching by ID:', this.formatError(error));
      throw error;
    }
  }

  /**
   * Create or update learner competency record
   */
  static async upsertLearnerCompetency(
    input: UpsertLearnerCompetencyDTO
  ): Promise<LearnerCompetency> {
    try {
      this.validateId(input.learner_id, 'learner_id');
      this.validateId(input.competency_id, 'competency_id');

      // Check if record exists
      const { data: existing } = await (this.getSupabase() as any)
        .from('learner_competencies')
        .select('id, evidence, assessments')
        .eq('learner_id', input.learner_id)
        .eq('competency_id', input.competency_id)
        .maybeSingle();

      if (existing) {
        // Update existing record
        const { data, error } = await (this.getSupabase() as any)
          .from('learner_competencies')
          .update({
            current_level: input.current_level,
            evidence: input.evidence || existing.evidence,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw error;
        toast.success('Competency updated');
        return data;
      } else {
        // Create new record
        const { data, error } = await (this.getSupabase() as any)
          .from('learner_competencies')
          .insert([{
            learner_id: input.learner_id,
            competency_id: input.competency_id,
            current_level: input.current_level,
            evidence: input.evidence || [],
            assessments: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }])
          .select()
          .single();

        if (error) throw error;
        toast.success('Competency added');
        return data;
      }
    } catch (error) {
      console.error('[LearnerCompetency] Error upserting:', this.formatError(error));
      toast.error(`Failed to save competency: ${this.formatError(error)}`);
      throw error;
    }
  }

  /**
   * Add evidence to learner competency
   */
  static async addEvidence(input: AddCompetencyEvidenceDTO): Promise<LearnerCompetency> {
    try {
      this.validateId(input.learner_competency_id, 'learner_competency_id');

      // Get current evidence
      const { data: current, error: fetchError } = await (this.getSupabase() as any)
        .from('learner_competencies')
        .select('evidence')
        .eq('id', input.learner_competency_id)
        .single();

      if (fetchError) throw fetchError;

      const existingEvidence: CompetencyEvidence[] = current.evidence || [];
      const updatedEvidence = [...existingEvidence, input.evidence];

      const { data, error } = await (this.getSupabase() as any)
        .from('learner_competencies')
        .update({
          evidence: updatedEvidence,
          updated_at: new Date().toISOString()
        })
        .eq('id', input.learner_competency_id)
        .select()
        .single();

      if (error) throw error;

      toast.success('Evidence added');
      return data;
    } catch (error) {
      console.error('[LearnerCompetency] Error adding evidence:', this.formatError(error));
      toast.error('Failed to add evidence');
      throw error;
    }
  }

  /**
   * Record assessment for learner competency
   */
  static async recordAssessment(input: RecordCompetencyAssessmentDTO): Promise<LearnerCompetency> {
    try {
      this.validateId(input.learner_competency_id, 'learner_competency_id');

      // Get current user
      const { data: { user } } = await this.getSupabase().auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Get current assessments
      const { data: current, error: fetchError } = await (this.getSupabase() as any)
        .from('learner_competencies')
        .select('assessments')
        .eq('id', input.learner_competency_id)
        .single();

      if (fetchError) throw fetchError;

      const existingAssessments: CompetencyAssessment[] = current.assessments || [];
      const newAssessment: CompetencyAssessment = {
        date: new Date().toISOString(),
        score: input.score,
        assessor_id: user.id,
        method: input.method,
        notes: input.notes
      };

      const { data, error } = await (this.getSupabase() as any)
        .from('learner_competencies')
        .update({
          assessments: [...existingAssessments, newAssessment],
          updated_at: new Date().toISOString()
        })
        .eq('id', input.learner_competency_id)
        .select()
        .single();

      if (error) throw error;

      toast.success('Assessment recorded');
      return data;
    } catch (error) {
      console.error('[LearnerCompetency] Error recording assessment:', this.formatError(error));
      toast.error('Failed to record assessment');
      throw error;
    }
  }

  /**
   * Verify learner competency
   */
  static async verifyCompetency(input: VerifyLearnerCompetencyDTO): Promise<LearnerCompetency> {
    try {
      this.validateId(input.learner_competency_id, 'learner_competency_id');

      const { data: { user } } = await this.getSupabase().auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      if (input.verified) {
        updateData.verified_by = user.id;
        updateData.verified_at = new Date().toISOString();
      } else {
        updateData.verified_by = null;
        updateData.verified_at = null;
      }

      const { data, error } = await (this.getSupabase() as any)
        .from('learner_competencies')
        .update(updateData)
        .eq('id', input.learner_competency_id)
        .select()
        .single();

      if (error) throw error;

      toast.success(input.verified ? 'Competency verified' : 'Verification removed');
      return data;
    } catch (error) {
      console.error('[LearnerCompetency] Error verifying:', this.formatError(error));
      toast.error('Failed to update verification');
      throw error;
    }
  }

  /**
   * Get learner competency progress summary
   */
  static async getLearnerProgress(learnerId: string): Promise<LearnerCompetencyProgress> {
    try {
      this.validateId(learnerId, 'learner_id');

      const { data: competencies, error } = await (this.getSupabase() as any)
        .from('learner_competencies')
        .select(`
          current_level,
          verified_at,
          competency:competency_catalog(competency_type)
        `)
        .eq('learner_id', learnerId);

      if (error) throw error;

      const progress: LearnerCompetencyProgress = {
        learner_id: learnerId,
        total_competencies: competencies?.length || 0,
        mastered_count: 0,
        in_progress_count: 0,
        not_started_count: 0,
        verified_count: 0,
        overall_progress_percentage: 0,
        by_level: {
          novice: 0,
          beginner: 0,
          intermediate: 0,
          advanced: 0,
          expert: 0
        },
        by_type: {
          technical: 0,
          behavioral: 0,
          domain: 0,
          soft_skill: 0
        }
      };

      (competencies || []).forEach((c: any) => {
        // Count by level
        if (c.current_level && progress.by_level[c.current_level as ProficiencyLevel] !== undefined) {
          progress.by_level[c.current_level as ProficiencyLevel]++;
        }

        // Count by type
        const type = c.competency?.competency_type;
        if (type && progress.by_type[type as keyof typeof progress.by_type] !== undefined) {
          progress.by_type[type as keyof typeof progress.by_type]++;
        }

        // Mastered = advanced or expert
        if (c.current_level === 'advanced' || c.current_level === 'expert') {
          progress.mastered_count++;
        } else if (c.current_level === 'intermediate' || c.current_level === 'beginner') {
          progress.in_progress_count++;
        } else {
          progress.not_started_count++;
        }

        if (c.verified_at) {
          progress.verified_count++;
        }
      });

      // Calculate overall progress (0-100%)
      // Weight: novice=10, beginner=30, intermediate=50, advanced=80, expert=100
      const weights: Record<ProficiencyLevel, number> = {
        novice: 10,
        beginner: 30,
        intermediate: 50,
        advanced: 80,
        expert: 100
      };

      if (progress.total_competencies > 0) {
        let totalProgress = 0;
        (competencies || []).forEach((c: any) => {
          totalProgress += weights[c.current_level as ProficiencyLevel] || 0;
        });
        progress.overall_progress_percentage = totalProgress / progress.total_competencies;
      }

      return progress;
    } catch (error) {
      console.error('[LearnerCompetency] Error getting progress:', this.formatError(error));
      throw error;
    }
  }

  /**
   * Get learner competency dashboard data
   */
  static async getLearnerDashboard(learnerId: string): Promise<LearnerCompetencyDashboard> {
    try {
      this.validateId(learnerId, 'learner_id');

      const progress = await this.getLearnerProgress(learnerId);

      // Get recent achievements (competencies updated in last 30 days at intermediate+ level)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: recentAchievements, error: recentError } = await (this.getSupabase() as any)
        .from('learner_competencies')
        .select(`
          competency_id,
          current_level,
          updated_at,
          competency:competency_catalog(competency_name)
        `)
        .eq('learner_id', learnerId)
        .in('current_level', ['intermediate', 'advanced', 'expert'])
        .gte('updated_at', thirtyDaysAgo.toISOString())
        .order('updated_at', { ascending: false })
        .limit(5);

      if (recentError) throw recentError;

      // Get recommended next competencies (from program requirements not yet achieved)
      const { data: learnerProfile } = await (this.getSupabase() as any)
        .from('learners_profiles')
        .select('program_id')
        .eq('id', learnerId)
        .single();

      let recommendedNext: LearnerCompetencyDashboard['recommended_next'] = [];

      if (learnerProfile?.program_id) {
        // Get program requirements
        const { data: requirements } = await (this.getSupabase() as any)
          .from('competency_program_mapping')
          .select(`
            competency_id,
            required_level,
            is_mandatory,
            competency:competency_catalog(competency_name)
          `)
          .eq('program_id', learnerProfile.program_id)
          .eq('is_mandatory', true)
          .limit(10);

        // Get learner's current competencies
        const { data: learnerComps } = await (this.getSupabase() as any)
          .from('learner_competencies')
          .select('competency_id, current_level')
          .eq('learner_id', learnerId);

        const learnerCompMap = new Map((learnerComps || []).map((c: any) => [c.competency_id, c.current_level]));

        recommendedNext = (requirements || [])
          .filter((r: any) => {
            const currentLevel = learnerCompMap.get(r.competency_id) as ProficiencyLevel | undefined;
            return !currentLevel || this.levelToNumber(currentLevel) < this.levelToNumber(r.required_level);
          })
          .slice(0, 5)
          .map((r: any) => ({
            competency_id: r.competency_id,
            competency_name: r.competency?.competency_name || '',
            current_level: learnerCompMap.get(r.competency_id) || null,
            target_level: r.required_level,
            program_required: r.is_mandatory
          }));
      }

      return {
        learner_id: learnerId,
        progress,
        recent_achievements: (recentAchievements || []).map((a: any) => ({
          competency_id: a.competency_id,
          competency_name: a.competency?.competency_name || '',
          level_achieved: a.current_level,
          achieved_at: a.updated_at
        })),
        recommended_next: recommendedNext
      };
    } catch (error) {
      console.error('[LearnerCompetency] Error getting dashboard:', this.formatError(error));
      throw error;
    }
  }

  /**
   * Get competency gap analysis for learner
   */
  static async getGapAnalysis(learnerId: string, programId: string): Promise<CompetencyGapAnalysis> {
    try {
      this.validateId(learnerId, 'learner_id');
      this.validateId(programId, 'program_id');

      // Get program requirements
      const { data: requirements, error: reqError } = await (this.getSupabase() as any)
        .from('competency_program_mapping')
        .select(`
          competency_id,
          required_level,
          is_mandatory,
          competency:competency_catalog(competency_name)
        `)
        .eq('program_id', programId);

      if (reqError) throw reqError;

      // Get learner's current competencies
      const { data: learnerComps, error: lcError } = await (this.getSupabase() as any)
        .from('learner_competencies')
        .select('competency_id, current_level')
        .eq('learner_id', learnerId);

      if (lcError) throw lcError;

      const learnerCompMap = new Map((learnerComps || []).map((c: any) => [c.competency_id, c.current_level]));

      const gaps: CompetencyGapAnalysis['gaps'] = [];
      let achievedCount = 0;
      let inProgressCount = 0;

      for (const req of (requirements || [])) {
        const currentLevel = learnerCompMap.get(req.competency_id) as ProficiencyLevel | undefined;
        const requiredNum = this.levelToNumber(req.required_level);
        const currentNum = currentLevel ? this.levelToNumber(currentLevel) : 0;

        if (currentNum >= requiredNum) {
          achievedCount++;
        } else if (currentNum > 0) {
          inProgressCount++;
          gaps.push({
            competency_id: req.competency_id,
            competency_name: req.competency?.competency_name || '',
            required_level: req.required_level,
            current_level: currentLevel || null,
            gap_levels: requiredNum - currentNum,
            is_mandatory: req.is_mandatory,
            recommended_courses: [] // Would need to join with course mappings
          });
        } else {
          gaps.push({
            competency_id: req.competency_id,
            competency_name: req.competency?.competency_name || '',
            required_level: req.required_level,
            current_level: null,
            gap_levels: requiredNum,
            is_mandatory: req.is_mandatory,
            recommended_courses: []
          });
        }
      }

      return {
        learner_id: learnerId,
        program_id: programId,
        total_required: requirements?.length || 0,
        achieved: achievedCount,
        in_progress: inProgressCount,
        gaps: gaps.sort((a, b) => b.gap_levels - a.gap_levels) // Sort by largest gaps first
      };
    } catch (error) {
      console.error('[LearnerCompetency] Error getting gap analysis:', this.formatError(error));
      throw error;
    }
  }

  /**
   * Helper to convert proficiency level to number for comparison
   */
  private static levelToNumber(level: ProficiencyLevel): number {
    const levels: Record<ProficiencyLevel, number> = {
      novice: 1,
      beginner: 2,
      intermediate: 3,
      advanced: 4,
      expert: 5
    };
    return levels[level] || 0;
  }

  /**
   * Update learner profile capabilities summary (denormalized field)
   */
  static async updateLearnerCapabilities(learnerId: string): Promise<void> {
    try {
      this.validateId(learnerId, 'learner_id');

      // Get all verified competencies for learner
      const { data: competencies, error } = await (this.getSupabase() as any)
        .from('learner_competencies')
        .select(`
          competency_id,
          current_level,
          evidence,
          verified_at,
          verified_by,
          competency:competency_catalog(competency_name)
        `)
        .eq('learner_id', learnerId);

      if (error) throw error;

      const capabilities = {
        competencies: (competencies || []).map((c: any) => ({
          competency_id: c.competency_id,
          competency_name: c.competency?.competency_name,
          current_level: c.current_level,
          evidence: (c.evidence || []).map((e: any) => e.url).filter(Boolean),
          verified_at: c.verified_at,
          verified_by: c.verified_by
        })),
        last_updated: new Date().toISOString()
      };

      // Update learner profile
      const { error: updateError } = await (this.getSupabase() as any)
        .from('learners_profiles')
        .update({
          capabilities: capabilities,
          updated_at: new Date().toISOString()
        })
        .eq('id', learnerId);

      if (updateError) throw updateError;
    } catch (error) {
      console.error('[LearnerCompetency] Error updating capabilities:', this.formatError(error));
      throw error;
    }
  }
}
