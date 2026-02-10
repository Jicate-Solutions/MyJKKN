// lib/services/solutions/compliance-service.ts
// ============================================================================
// AI-Solution Compliance Service
// Queries Solutions Hub data to determine which learners have/haven't
// completed their AI-collaboration solution requirement.
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  ComplianceOverview,
  DepartmentCompliance,
  LearnerCompliance,
  SolutionTeam,
  ComplianceDashboardData,
  ComplianceFilters,
  ClearanceStatus
} from '@/types/compliance';

export class ComplianceService {
  // ---- Main Dashboard Loader ----

  static async getDashboardData(
    filters?: ComplianceFilters
  ): Promise<ComplianceDashboardData> {
    const [overview, departments, learners, solutions] = await Promise.all([
      this.getOverview(filters),
      this.getDepartmentBreakdown(filters),
      this.getLearnerCompliance(filters),
      this.getSolutionTeams(filters)
    ]);

    return { overview, departments, learners, solutions };
  }

  // ---- Overview Stats ----

  static async getOverview(
    filters?: ComplianceFilters
  ): Promise<ComplianceOverview> {
    const supabase = createClientSupabaseClient();

    // Get all active learners (cast to any — ai_solution_cleared not in generated types yet)
    let learnersQuery = (supabase as any)
      .from('learners_profiles')
      .select('id, ai_solution_cleared')
      .eq('lifecycle_status', 'active');

    if (filters?.institutionId) {
      learnersQuery = learnersQuery.eq('institution_id', filters.institutionId);
    }
    if (filters?.departmentId) {
      learnersQuery = learnersQuery.eq('department_id', filters.departmentId);
    }

    const { data: learners } = await learnersQuery as { data: any[] | null };

    if (!learners || learners.length === 0) {
      return {
        totalLearners: 0,
        cleared: 0,
        inProgress: 0,
        notStarted: 0,
        registered: 0,
        clearanceRate: 0
      };
    }

    const learnerIds = learners.map((l) => l.id);
    const cleared = learners.filter((l) => l.ai_solution_cleared).length;

    // Get builders linked to these learners
    const { data: builders } = await (supabase as any)
      .from('sh_builders')
      .select('id, learner_id')
      .in('learner_id', learnerIds) as { data: any[] | null };

    const builderLearnerIds = new Set(
      builders?.map((b: any) => b.learner_id) ?? []
    );
    const builderIds = builders?.map((b: any) => b.id) ?? [];

    // Get assignments for these builders
    let assignedBuilderIds = new Set<string>();
    if (builderIds.length > 0) {
      const { data: assignments } = await (supabase as any)
        .from('sh_builder_assignments')
        .select('builder_id')
        .in('builder_id', builderIds) as { data: any[] | null };

      assignedBuilderIds = new Set(
        assignments?.map((a: any) => a.builder_id) ?? []
      );
    }

    // Count builders with assignments (in progress) vs without (registered only)
    let inProgress = 0;
    let registered = 0;
    for (const b of builders ?? []) {
      if (assignedBuilderIds.has(b.id)) {
        inProgress++;
      } else {
        registered++;
      }
    }

    // Subtract cleared from in_progress (they're already counted as cleared)
    inProgress = Math.max(0, inProgress - cleared);

    const notStarted = learners.length - cleared - inProgress - registered;

    return {
      totalLearners: learners.length,
      cleared,
      inProgress,
      notStarted: Math.max(0, notStarted),
      registered,
      clearanceRate:
        learners.length > 0
          ? Math.round((cleared / learners.length) * 100 * 10) / 10
          : 0
    };
  }

  // ---- Department Breakdown ----

  static async getDepartmentBreakdown(
    filters?: ComplianceFilters
  ): Promise<DepartmentCompliance[]> {
    const supabase = createClientSupabaseClient();

    // Get active learners with department info
    let query = (supabase as any)
      .from('learners_profiles')
      .select(`
        id,
        department_id,
        institution_id,
        ai_solution_cleared,
        department:departments!learners_profiles_department_id_fkey(id, department_name),
        institution:institutions!learners_profiles_institution_id_fkey(id, name)
      `)
      .eq('lifecycle_status', 'active')
      .not('department_id', 'is', null);

    if (filters?.institutionId) {
      query = query.eq('institution_id', filters.institutionId);
    }
    if (filters?.departmentId) {
      query = query.eq('department_id', filters.departmentId);
    }

    const { data: learners } = await query as { data: any[] | null };

    if (!learners || learners.length === 0) return [];

    // Get all builders for these learners
    const learnerIds = learners.map((l: any) => l.id);
    const { data: builders } = await (supabase as any)
      .from('sh_builders')
      .select('id, learner_id')
      .in('learner_id', learnerIds) as { data: any[] | null };

    const builderMap = new Map<string, string>();
    for (const b of builders ?? []) {
      builderMap.set(b.learner_id, b.id);
    }

    // Get assignments
    const builderIds = builders?.map((b: any) => b.id) ?? [];
    const assignedBuilderIds = new Set<string>();
    if (builderIds.length > 0) {
      const { data: assignments } = await (supabase as any)
        .from('sh_builder_assignments')
        .select('builder_id')
        .in('builder_id', builderIds) as { data: any[] | null };

      for (const a of assignments ?? []) {
        assignedBuilderIds.add(a.builder_id);
      }
    }

    // Group by department
    const deptMap = new Map<string, DepartmentCompliance>();

    for (const learner of learners) {
      const deptId = learner.department_id;
      if (!deptId) continue;

      const dept = learner.department as any;
      const inst = learner.institution as any;

      const existing = deptMap.get(deptId) ?? {
        departmentId: deptId,
        departmentName: dept?.department_name ?? 'Unknown',
        institutionId: learner.institution_id,
        institutionName: inst?.name ?? 'Unknown',
        totalLearners: 0,
        cleared: 0,
        inProgress: 0,
        notStarted: 0,
        clearanceRate: 0
      };

      existing.totalLearners++;

      if (learner.ai_solution_cleared) {
        existing.cleared++;
      } else {
        const builderId = builderMap.get(learner.id);
        if (builderId && assignedBuilderIds.has(builderId)) {
          existing.inProgress++;
        } else if (builderId) {
          // registered but not assigned — count as not started for simplicity
          existing.notStarted++;
        } else {
          existing.notStarted++;
        }
      }

      deptMap.set(deptId, existing);
    }

    // Calculate rates
    return Array.from(deptMap.values())
      .map((dept) => ({
        ...dept,
        clearanceRate:
          dept.totalLearners > 0
            ? Math.round((dept.cleared / dept.totalLearners) * 100 * 10) / 10
            : 0
      }))
      .sort((a, b) => b.totalLearners - a.totalLearners);
  }

  // ---- Individual Learner Compliance ----

  static async getLearnerCompliance(
    filters?: ComplianceFilters
  ): Promise<LearnerCompliance[]> {
    const supabase = createClientSupabaseClient();

    let query = (supabase as any)
      .from('learners_profiles')
      .select(`
        id,
        first_name,
        last_name,
        roll_number,
        register_number,
        institution_id,
        department_id,
        ai_solution_cleared,
        ai_solution_cleared_at,
        department:departments!learners_profiles_department_id_fkey(department_name),
        institution:institutions!learners_profiles_institution_id_fkey(name)
      `)
      .eq('lifecycle_status', 'active')
      .order('first_name', { ascending: true });

    if (filters?.institutionId) {
      query = query.eq('institution_id', filters.institutionId);
    }
    if (filters?.departmentId) {
      query = query.eq('department_id', filters.departmentId);
    }

    const { data: learners, error } = await query as { data: any[] | null; error: any };

    if (error || !learners) {
      console.error('[compliance] Error fetching learners:', error);
      return [];
    }

    if (learners.length === 0) return [];

    // Get builders for these learners
    const learnerIds = learners.map((l: any) => l.id);
    const { data: builders } = await (supabase as any)
      .from('sh_builders')
      .select('id, learner_id, builder_code')
      .in('learner_id', learnerIds) as { data: any[] | null };

    const builderByLearner = new Map<string, any>();
    for (const b of builders ?? []) {
      builderByLearner.set(b.learner_id, b);
    }

    // Get assignments for all builders
    const builderIds = builders?.map((b: any) => b.id) ?? [];
    const assignmentByBuilder = new Map<string, any>();

    if (builderIds.length > 0) {
      const { data: assignments } = await (supabase as any)
        .from('sh_builder_assignments')
        .select(`
          id,
          builder_id,
          status,
          role,
          rating,
          phase:sh_solution_phases!sh_builder_assignments_phase_id_fkey(
            title,
            solution:sh_solutions!sh_solution_phases_solution_id_fkey(
              title,
              solution_code,
              status
            )
          )
        `)
        .in('builder_id', builderIds)
        .order('created_at', { ascending: false }) as { data: any[] | null };

      // Keep only the latest assignment per builder
      for (const a of assignments ?? []) {
        if (!assignmentByBuilder.has(a.builder_id)) {
          assignmentByBuilder.set(a.builder_id, a);
        }
      }
    }

    // Build result
    return learners.map((learner: any) => {
      const builder = builderByLearner.get(learner.id);
      const assignment = builder
        ? assignmentByBuilder.get(builder.id)
        : null;
      const phase = assignment?.phase as any;
      const solution = phase?.solution as any;
      const dept = learner.department as any;
      const inst = learner.institution as any;

      let clearanceStatus: ClearanceStatus = 'not_started';
      if (learner.ai_solution_cleared) {
        clearanceStatus = 'cleared';
      } else if (assignment?.status === 'completed') {
        clearanceStatus = 'completed';
      } else if (assignment) {
        clearanceStatus = 'in_progress';
      } else if (builder) {
        clearanceStatus = 'registered';
      }

      // Apply status filter
      if (
        filters?.clearanceStatus &&
        filters.clearanceStatus !== 'all' &&
        clearanceStatus !== filters.clearanceStatus
      ) {
        return null;
      }

      // Apply search filter
      if (filters?.searchQuery) {
        const q = filters.searchQuery.toLowerCase();
        const name = `${learner.first_name} ${learner.last_name}`.toLowerCase();
        const roll = (learner.roll_number ?? '').toLowerCase();
        if (!name.includes(q) && !roll.includes(q)) {
          return null;
        }
      }

      return {
        learnerId: learner.id,
        firstName: learner.first_name,
        lastName: learner.last_name,
        rollNumber: learner.roll_number,
        registerNumber: learner.register_number,
        institutionId: learner.institution_id,
        departmentId: learner.department_id,
        departmentName: dept?.department_name ?? null,
        institutionName: inst?.name ?? null,
        aiSolutionCleared: learner.ai_solution_cleared ?? false,
        aiSolutionClearedAt: learner.ai_solution_cleared_at,
        builderId: builder?.id ?? null,
        builderCode: builder?.builder_code ?? null,
        assignmentId: assignment?.id ?? null,
        assignmentStatus: assignment?.status ?? null,
        assignmentRole: assignment?.role ?? null,
        assignmentRating: assignment?.rating ?? null,
        solutionTitle: solution?.title ?? null,
        solutionCode: solution?.solution_code ?? null,
        solutionStatus: solution?.status ?? null,
        clearanceStatus
      };
    }).filter(Boolean) as LearnerCompliance[];
  }

  // ---- Solution Teams ----

  static async getSolutionTeams(
    filters?: ComplianceFilters
  ): Promise<SolutionTeam[]> {
    const supabase = createClientSupabaseClient();

    // Get solutions with their phase assignments
    let solutionsQuery = (supabase as any)
      .from('sh_solutions')
      .select(`
        id,
        title,
        solution_code,
        solution_type,
        status
      `)
      .order('created_at', { ascending: false });

    if (filters?.institutionId) {
      solutionsQuery = solutionsQuery.eq('institution_id', filters.institutionId);
    }

    const { data: solutions } = await solutionsQuery as { data: any[] | null };

    if (!solutions || solutions.length === 0) return [];

    const solutionIds = solutions.map((s: any) => s.id);

    // Get phases for these solutions
    const { data: phases } = await (supabase as any)
      .from('sh_solution_phases')
      .select('id, solution_id')
      .in('solution_id', solutionIds) as { data: any[] | null };

    if (!phases || phases.length === 0) {
      return solutions.map((s: any) => ({
        solutionId: s.id,
        solutionTitle: s.title,
        solutionCode: s.solution_code,
        solutionType: s.solution_type,
        solutionStatus: s.status,
        deploymentUrl: null,
        teamSize: 0,
        graduatingBuilders: 0,
        teamMembers: []
      }));
    }

    const phaseIds = phases.map((p: any) => p.id);
    const phaseSolutionMap = new Map<string, string>();
    for (const p of phases) {
      phaseSolutionMap.set(p.id, p.solution_id);
    }

    // Get assignments with builder info
    const { data: assignments } = await (supabase as any)
      .from('sh_builder_assignments')
      .select(`
        id,
        phase_id,
        builder_id,
        role,
        status,
        builder:sh_builders!sh_builder_assignments_builder_id_fkey(
          id,
          name,
          learner_id
        )
      `)
      .in('phase_id', phaseIds) as { data: any[] | null };

    // Get deployments
    const { data: deployments } = await (supabase as any)
      .from('sh_phase_deployments')
      .select('phase_id, deployment_url')
      .in('phase_id', phaseIds)
      .eq('status', 'active')
      .order('created_at', { ascending: false }) as { data: any[] | null };

    const deploymentMap = new Map<string, string>();
    for (const d of deployments ?? []) {
      const solId = phaseSolutionMap.get(d.phase_id);
      if (solId && !deploymentMap.has(solId)) {
        deploymentMap.set(solId, d.deployment_url);
      }
    }

    // Group assignments by solution
    const solutionTeamMap = new Map<string, any[]>();

    for (const a of assignments ?? []) {
      const solId = phaseSolutionMap.get(a.phase_id);
      if (!solId) continue;

      const existing = solutionTeamMap.get(solId) ?? [];
      const builder = a.builder as any;

      existing.push({
        builderId: builder?.id ?? a.builder_id,
        builderName: builder?.name ?? 'Unknown',
        role: a.role ?? 'contributor',
        learnerId: builder?.learner_id ?? null,
        clearanceStatus: (a.status === 'completed' ? 'completed' : 'in_progress') as ClearanceStatus
      });

      solutionTeamMap.set(solId, existing);
    }

    return solutions.map((s: any) => {
      const members = solutionTeamMap.get(s.id) ?? [];
      const graduatingBuilders = members.filter(
        (m: any) => m.learnerId !== null
      ).length;

      return {
        solutionId: s.id,
        solutionTitle: s.title,
        solutionCode: s.solution_code,
        solutionType: s.solution_type,
        solutionStatus: s.status,
        deploymentUrl: deploymentMap.get(s.id) ?? null,
        teamSize: members.length,
        graduatingBuilders,
        teamMembers: members
      };
    });
  }

  // ---- Manual Clearance Toggle ----

  static async toggleClearance(
    learnerId: string,
    cleared: boolean,
    clearedBy: string
  ): Promise<void> {
    const supabase = createClientSupabaseClient();

    const { error } = await supabase
      .from('learners_profiles')
      .update({
        ai_solution_cleared: cleared,
        ai_solution_cleared_at: cleared ? new Date().toISOString() : null,
        ai_solution_cleared_by: cleared ? clearedBy : null
      })
      .eq('id', learnerId);

    if (error) {
      console.error('[compliance] Error toggling clearance:', error);
      throw error;
    }
  }
}
