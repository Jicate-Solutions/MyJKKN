// lib/services/parent-portal/parent-skill-service.ts
// Fetches skill progression data for a learner (used by parent-facing dashboard)
// Uses service role client because parent portal uses custom session auth (not Supabase auth)

import { createServiceRoleClient } from '@/lib/supabase/server';
import type { LearnerSkillData, ParentCompetencyView, ParentBuilderView, ParentSolutionView } from '@/types/parent-portal';

export class ParentSkillService {
  /**
   * Get complete skill progression data for a learner.
   * Combines competency, builder/solutions, and AI graduation data.
   */
  static async getSkillDataForLearner(learnerId: string): Promise<LearnerSkillData> {
    try {
      const supabase = createServiceRoleClient();

      // Run all queries in parallel
      const [competencyResult, builderResult, profileResult] = await Promise.all([
        // 1. Competencies with catalog details
        supabase
          .from('learner_competencies')
          .select(`
            id,
            current_level,
            progress_percentage,
            verified_by,
            competency:competency_catalog(
              id,
              competency_name,
              competency_type
            )
          `)
          .eq('learner_id', learnerId),

        // 2. Builder profile
        supabase
          .from('sh_builders')
          .select('id, builder_code, is_active, projects_completed, average_rating')
          .eq('learner_id', learnerId)
          .maybeSingle(),

        // 3. Learner profile for AI graduation + readiness
        supabase
          .from('learners_profiles')
          .select('ai_solution_cleared, ai_solution_cleared_at, industry_readiness_score, capabilities')
          .eq('id', learnerId)
          .single(),
      ]);

      // Log query errors (non-fatal — we return partial data)
      if (competencyResult.error) {
        console.warn('[parent-skill] Competency query error:', competencyResult.error.message);
      }
      if (builderResult.error) {
        console.warn('[parent-skill] Builder query error:', builderResult.error.message);
      }
      if (profileResult.error) {
        console.warn('[parent-skill] Profile query error:', profileResult.error.message);
      }

      // Process competencies
      const competencies: ParentCompetencyView[] = [];
      let mastered = 0;
      let inProgress = 0;
      let notStarted = 0;

      if (competencyResult.data) {
        for (const lc of competencyResult.data) {
          const comp = lc.competency as any;
          if (!comp) continue;

          const level = lc.current_level || 'novice';
          const progress = lc.progress_percentage ?? 0;

          competencies.push({
            id: comp.id,
            name: comp.competency_name,
            type: comp.competency_type,
            currentLevel: level,
            progressPercent: Number(progress),
            verified: !!lc.verified_by,
          });

          if (level === 'advanced' || level === 'expert') {
            mastered++;
          } else if (progress > 0) {
            inProgress++;
          } else {
            notStarted++;
          }
        }
      }

      // Process builder + assignments
      let builder: ParentBuilderView | null = null;
      const solutions: ParentSolutionView[] = [];

      if (builderResult.data) {
        const b = builderResult.data;
        builder = {
          code: b.builder_code || '',
          isActive: b.is_active ?? false,
          projectsCompleted: b.projects_completed ?? 0,
          averageRating: b.average_rating ? Number(b.average_rating) : null,
        };

        // Get assignments for this builder (sequential — depends on builder ID)
        const { data: assignments } = await supabase
          .from('sh_builder_assignments')
          .select(`
            role,
            status,
            rating,
            phase:sh_solution_phases(
              title,
              solution:sh_solutions(
                title,
                solution_code,
                status
              )
            )
          `)
          .eq('builder_id', b.id)
          .order('created_at', { ascending: false })
          .limit(5);

        if (assignments) {
          for (const a of assignments) {
            const phase = a.phase as any;
            const solution = phase?.solution as any;
            if (!solution) continue;

            solutions.push({
              title: solution.title || phase?.title || 'Untitled Solution',
              code: solution.solution_code || '',
              role: a.role || 'contributor',
              status: a.status || 'unknown',
              rating: a.rating ? Number(a.rating) : null,
            });
          }
        }
      }

      // Process profile data
      const profile = profileResult.data;
      const capabilities: string[] = [];
      if (profile?.capabilities && Array.isArray(profile.capabilities)) {
        for (const cap of profile.capabilities) {
          if (typeof cap === 'string') {
            capabilities.push(cap);
          } else if (typeof cap === 'object' && cap !== null && 'name' in cap) {
            capabilities.push((cap as any).name);
          }
        }
      }

      return {
        competencies,
        competencyStats: {
          total: competencies.length,
          mastered,
          inProgress,
          notStarted,
        },
        builder,
        solutions,
        aiGraduation: {
          cleared: profile?.ai_solution_cleared ?? false,
          clearedAt: profile?.ai_solution_cleared_at ?? null,
        },
        industryReadiness: profile?.industry_readiness_score
          ? Number(profile.industry_readiness_score)
          : null,
        capabilities,
      };
    } catch (error) {
      console.error('[parent-skill] Failed to fetch skill data for learner:', learnerId, error);
      throw error;
    }
  }
}
