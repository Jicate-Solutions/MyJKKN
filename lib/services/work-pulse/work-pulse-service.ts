// lib/services/work-pulse/work-pulse-service.ts
// Work Pulse service — 13 methods for pulse entries, patterns, interviews, impact

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  WpPulseEntry,
  WpPattern,
  WpMicroInterview,
  WpAgentImpact,
  SubmitWeeklyPulseDto,
  RespondInterviewDto,
  PulseEntryFilters,
  PatternFilters,
  AdminPulseFilters,
  AdminPulseEntry,
  PulseStats,
  AgentBoardStats,
  ImpactSummary,
  InstantHelpResult,
  ComplianceDepartment,
} from '@/types/work-pulse';

/** Get the Monday of the current ISO week */
function getCurrentWeekMonday(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  return monday.toISOString().split('T')[0];
}

export class WorkPulseService {
  // ─── Pulse Entries ──────────────────────────────────────────────

  /** Upsert weekly pulse entry (one per user per week) */
  static async submitWeeklyPulse(
    dto: SubmitWeeklyPulseDto,
    userId: string,
    institutionId: string,
    departmentId: string | null,
    role: string
  ): Promise<WpPulseEntry> {
    const supabase = await createClient();
    const weekOf = getCurrentWeekMonday();

    const { data, error } = await supabase
      .from('wp_pulse_entries')
      .upsert(
        {
          user_id: userId,
          institution_id: institutionId,
          department_id: departmentId,
          role,
          week_of: weekOf,
          talent_waste_category: dto.talent_waste_category,
          talent_waste_description: dto.talent_waste_description,
          repetition_category: dto.repetition_category,
          repetition_description: dto.repetition_description,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,week_of' }
      )
      .select()
      .single();

    if (error) throw error;
    return data as WpPulseEntry;
  }

  /** Check if user has submitted this week */
  static async hasSubmittedThisWeek(userId: string): Promise<boolean> {
    const supabase = await createClient();
    const weekOf = getCurrentWeekMonday();

    const { data } = await supabase
      .from('wp_pulse_entries')
      .select('id')
      .eq('user_id', userId)
      .eq('week_of', weekOf)
      .maybeSingle();

    return !!data;
  }

  /** Get paginated entry history for a user */
  static async getMyPulseEntries(
    userId: string,
    filters: PulseEntryFilters = {}
  ): Promise<{ data: WpPulseEntry[]; total: number }> {
    const supabase = await createClient();
    const page = filters.page || 1;
    const limit = filters.limit || 5;
    const from = (page - 1) * limit;

    const { data, error, count } = await supabase
      .from('wp_pulse_entries')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('week_of', { ascending: false })
      .range(from, from + limit - 1);

    if (error) throw error;
    return { data: (data || []) as WpPulseEntry[], total: count || 0 };
  }

  /** Get personal dashboard stats */
  static async getMyPulseStats(userId: string): Promise<PulseStats> {
    const supabase = await createClient();

    // Total pulses
    const { count: totalPulses } = await supabase
      .from('wp_pulse_entries')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    // This month's pulses
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const { count: thisMonth } = await supabase
      .from('wp_pulse_entries')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', startOfMonth.toISOString());

    // Patterns spotted (patterns matching user's reported categories)
    const { count: patternsSpotted } = await supabase
      .from('wp_patterns')
      .select('id', { count: 'exact', head: true });

    // Agents originated (deployed patterns)
    const { count: agentsOriginated } = await supabase
      .from('wp_agent_impact')
      .select('id', { count: 'exact', head: true });

    return {
      total_pulses: totalPulses || 0,
      patterns_spotted: patternsSpotted || 0,
      agents_originated: agentsOriginated || 0,
      this_month: thisMonth || 0,
    };
  }

  // ─── Patterns ───────────────────────────────────────────────────

  /** Get paginated patterns with filters */
  static async getPatterns(
    filters: PatternFilters = {}
  ): Promise<{ data: WpPattern[]; total: number }> {
    const supabase = await createClient();
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const from = (page - 1) * limit;

    let query = supabase
      .from('wp_patterns')
      .select('*', { count: 'exact' });

    if (filters.tier) query = query.eq('tier', filters.tier);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.solution_type) query = query.eq('solution_type', filters.solution_type);
    if (filters.search) {
      query = query.or(`name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
    }

    const { data, error, count } = await query
      .order('impact_score', { ascending: false })
      .range(from, from + limit - 1);

    if (error) throw error;
    return { data: (data || []) as WpPattern[], total: count || 0 };
  }

  /** Get single pattern by ID */
  static async getPattern(id: string): Promise<WpPattern | null> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('wp_patterns')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data as WpPattern | null;
  }

  /** Agent Board stats */
  static async getAgentBoardStats(): Promise<AgentBoardStats> {
    const supabase = await createClient();

    const { count: totalOpportunities } = await supabase
      .from('wp_patterns')
      .select('id', { count: 'exact', head: true });

    const { count: sTier } = await supabase
      .from('wp_patterns')
      .select('id', { count: 'exact', head: true })
      .eq('tier', 'S');

    const { count: inPipeline } = await supabase
      .from('wp_patterns')
      .select('id', { count: 'exact', head: true })
      .in('status', ['queued', 'building']);

    const { count: trainingWins } = await supabase
      .from('wp_patterns')
      .select('id', { count: 'exact', head: true })
      .eq('solution_type', 'training')
      .eq('status', 'deployed');

    return {
      total_opportunities: totalOpportunities || 0,
      s_tier_count: sTier || 0,
      in_pipeline: inPipeline || 0,
      training_wins: trainingWins || 0,
    };
  }

  // ─── Micro-Interviews ──────────────────────────────────────────

  /** Get unanswered micro-interviews for user */
  static async getPendingInterviews(userId: string): Promise<WpMicroInterview[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('wp_micro_interviews')
      .select('*, pattern:wp_patterns(id, name, category)')
      .eq('user_id', userId)
      .is('responded_at', null)
      .order('sent_at', { ascending: false });

    if (error) throw error;
    return (data || []) as WpMicroInterview[];
  }

  /** Submit micro-interview response */
  static async respondToInterview(
    interviewId: string,
    userId: string,
    dto: RespondInterviewDto
  ): Promise<void> {
    const supabase = await createClient();

    const { error } = await supabase
      .from('wp_micro_interviews')
      .update({
        selected_option: dto.selected_option,
        free_text: dto.free_text || null,
        responded_at: new Date().toISOString(),
      })
      .eq('id', interviewId)
      .eq('user_id', userId);

    if (error) throw error;
  }

  // ─── Impact ─────────────────────────────────────────────────────

  /** Aggregated impact summary */
  static async getImpactSummary(): Promise<ImpactSummary> {
    const supabase = await createClient();

    const { data: impacts, error } = await supabase
      .from('wp_agent_impact')
      .select('hours_saved_weekly, people_using, solution_type');

    if (error) throw error;

    const items = impacts || [];
    const agentsDeployed = items.length;
    const hoursSaved = items.reduce((sum, i) => sum + (Number(i.hours_saved_weekly) || 0), 0);
    const peopleHelped = items.reduce((sum, i) => sum + (i.people_using || 0), 0);
    const trainingWins = items.filter((i) => i.solution_type === 'training').length;
    const workflows = items.filter((i) =>
      ['new_module', 'standalone_agent'].includes(i.solution_type)
    ).length;

    return {
      agents_deployed: agentsDeployed,
      hours_saved_weekly: Math.round(hoursSaved * 100) / 100,
      training_wins: trainingWins,
      people_helped: peopleHelped,
      workflows_absorbed: workflows,
    };
  }

  /** List of deployed agents with pattern details */
  static async getImpactList(): Promise<WpAgentImpact[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('wp_agent_impact')
      .select('*, pattern:wp_patterns(id, name, category, tier)')
      .order('deployed_at', { ascending: false });

    if (error) throw error;
    return (data || []) as WpAgentImpact[];
  }

  // ─── Instant Help ───────────────────────────────────────────────

  /** Match submitted category against existing patterns */
  static async instantHelpMatch(category: string): Promise<InstantHelpResult> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('wp_patterns')
      .select('*')
      .eq('category', category)
      .order('impact_score', { ascending: false })
      .limit(1);

    if (error) throw error;

    const matchCount = data?.length || 0;
    const topPattern = matchCount > 0 ? (data![0] as WpPattern) : null;

    return {
      matching_patterns: matchCount,
      top_pattern: topPattern,
      message: topPattern
        ? `Others reported this too! "${topPattern.name}" is being tracked (${topPattern.status}).`
        : 'Your feedback has been recorded. We\'ll analyze patterns this week.',
    };
  }

  // ─── Compliance ─────────────────────────────────────────────────

  /** Department-level submission rates (requires service role for cross-user aggregation) */
  static async getComplianceData(institutionId: string): Promise<ComplianceDepartment[]> {
    const supabase = createServiceRoleClient();
    const weekOf = getCurrentWeekMonday();

    // Get all departments for the institution
    const { data: departments, error: deptError } = await supabase
      .from('departments')
      .select('id, department_name')
      .eq('institution_id', institutionId);

    if (deptError) throw deptError;
    if (!departments || departments.length === 0) return [];

    // Get staff counts per department
    const { data: staffCounts, error: staffError } = await supabase
      .from('profiles')
      .select('department_id')
      .eq('institution_id', institutionId)
      .not('role', 'eq', 'student')
      .not('department_id', 'is', null);

    if (staffError) throw staffError;

    // Get submissions for this week per department
    const { data: submissions, error: subError } = await supabase
      .from('wp_pulse_entries')
      .select('department_id')
      .eq('institution_id', institutionId)
      .eq('week_of', weekOf)
      .not('department_id', 'is', null);

    if (subError) throw subError;

    // Aggregate
    const staffByDept = new Map<string, number>();
    (staffCounts || []).forEach((p) => {
      if (p.department_id) {
        staffByDept.set(p.department_id, (staffByDept.get(p.department_id) || 0) + 1);
      }
    });

    const subByDept = new Map<string, number>();
    (submissions || []).forEach((s) => {
      if (s.department_id) {
        subByDept.set(s.department_id, (subByDept.get(s.department_id) || 0) + 1);
      }
    });

    return departments.map((dept) => {
      const totalStaff = staffByDept.get(dept.id) || 0;
      const submitted = subByDept.get(dept.id) || 0;
      return {
        department_id: dept.id,
        department_name: dept.department_name,
        total_staff: totalStaff,
        submitted_count: submitted,
        submission_rate: totalStaff > 0 ? Math.round((submitted / totalStaff) * 100) : 0,
      };
    });
  }

  // ─── Admin ──────────────────────────────────────────────────────

  /** Get all pulse entries with advanced filters (super_admin only, uses service role) */
  static async getAllPulseEntries(
    filters: AdminPulseFilters = {}
  ): Promise<{ data: AdminPulseEntry[]; total: number }> {
    const supabase = createServiceRoleClient();
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const from = (page - 1) * limit;

    let query = supabase
      .from('wp_pulse_entries')
      .select(
        `*,
        profiles(id, full_name, email, avatar_url, role),
        institutions(id, name),
        departments(id, department_name)`,
        { count: 'exact' }
      );

    // Apply filters
    if (filters.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }
    if (filters.department_id) {
      query = query.eq('department_id', filters.department_id);
    }
    if (filters.role) {
      query = query.eq('role', filters.role);
    }
    if (filters.talent_waste_category) {
      query = query.eq('talent_waste_category', filters.talent_waste_category);
    }
    if (filters.repetition_category) {
      query = query.eq('repetition_category', filters.repetition_category);
    }
    if (filters.week_of) {
      query = query.eq('week_of', filters.week_of);
    }
    if (filters.date_from) {
      query = query.gte('week_of', filters.date_from);
    }
    if (filters.date_to) {
      query = query.lte('week_of', filters.date_to);
    }
    if (filters.search) {
      query = query.or(
        `talent_waste_description.ilike.%${filters.search}%,repetition_description.ilike.%${filters.search}%`
      );
    }

    const { data, error, count } = await query
      .order('week_of', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1);

    if (error) throw error;
    return { data: (data || []) as AdminPulseEntry[], total: count || 0 };
  }
}
