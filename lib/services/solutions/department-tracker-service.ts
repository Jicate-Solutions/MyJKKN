// lib/services/solutions/department-tracker-service.ts
// Service for Solution Department Tracker - status management, revenue tracking, targets

import { BaseService, type BaseFilters } from '../base-service';

// ============================================
// TYPES
// ============================================

export type DepartmentStatus = 'pending_approval' | 'active' | 'at_risk' | 'dormant';

export interface SolutionDepartment {
  id: string;
  department_id: string;
  institution_id: string;
  status: DepartmentStatus;
  activated_at: string;
  dormant_at: string | null;
  last_revenue_at: string | null;
  nominated_by: string | null;
  approved_by: string | null;
  capabilities: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SolutionDepartmentWithDetails extends SolutionDepartment {
  department?: {
    id: string;
    department_name: string;
    department_code: string;
  };
  institution?: {
    id: string;
    name: string;
  };
}

export interface DepartmentStatusHistory {
  id: string;
  solution_department_id: string;
  previous_status: string | null;
  new_status: string;
  reason: string | null;
  changed_by: string | null;
  changed_at: string;
}

export interface DepartmentTarget {
  id: string;
  solution_department_id: string;
  quarter: string;
  target_revenue: number;
  notes: string | null;
  set_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SolutionTypeRecord {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string;
  color: string;
  is_default: boolean;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DepartmentRevenue {
  solution_department_id: string;
  department_id: string;
  department_name: string;
  department_code: string;
  institution_name: string;
  institution_id: string;
  status: DepartmentStatus;
  revenue: number;
  target: number;
  target_type: 'explicit' | 'estimated' | 'none';
  achievement_pct: number;
  active_solutions: number;
  last_revenue_at: string | null;
  growth_rate: number | null;
}

export interface DepartmentSummary {
  active: number;
  at_risk: number;
  dormant: number;
  pending_approval: number;
  total: number;
  total_revenue: number;
}

export interface DepartmentListFilters extends BaseFilters {
  status?: DepartmentStatus;
  institution_id?: string;
}

// Query result interfaces
interface PaymentWithSolution {
  amount: number;
  solution: { lead_department_id: string } | null;
}

export interface DepartmentSolution {
  id: string;
  title: string;
  solution_code: string | null;
  status: string;
  solution_type: string | null;
  final_price: number | null;
  start_date: string | null;
  target_date: string | null;
  client: { id: string; name: string } | null;
}

export interface DepartmentBuilder {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  builder_code: string | null;
  specialization: string | null;
  learner_id: string | null;
  staff_id: string | null;
  availability_status: string | null;
  projects_completed: number | null;
  average_rating: number | null;
  tags: string[] | null;
  role: 'learner' | 'facilitator' | 'builder';
}

// Nomination types
export type NominationStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

export interface DepartmentNomination {
  id: string;
  department_id: string;
  institution_id: string;
  nominated_by: string | null;
  nomination_reason: string;
  suggested_capabilities: string[];
  status: NominationStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DepartmentNominationWithDetails extends DepartmentNomination {
  department?: {
    id: string;
    department_name: string;
    department_code: string;
  };
  institution?: {
    id: string;
    name: string;
  };
}

// Eligibility types
export interface EligibleDepartment {
  department_id: string;
  department_name: string;
  department_code: string;
  institution_id: string;
  institution_name: string;
  is_eligible: boolean;
  exclusion_reasons: string[];
}

export interface EligibilityCriteria {
  id: string;
  criteria_name: string;
  criteria_type: 'inclusion' | 'exclusion';
  description: string;
  rule_config: Record<string, unknown>;
  is_active: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

// ============================================
// SERVICE CLASS
// ============================================

export class DepartmentTrackerService extends BaseService {
  // ----------------------------------------
  // SOLUTION DEPARTMENTS
  // ----------------------------------------

  /**
   * List all solution departments with department and institution details
   */
  static async listDepartments(
    filters: DepartmentListFilters = {}
  ): Promise<SolutionDepartmentWithDetails[]> {
    let query = this.supabase
      .from('sh_solution_departments')
      .select(`
        *,
        department:departments!department_id(id, department_name, department_code),
        institution:institutions!institution_id(id, name)
      `)
      .order('created_at', { ascending: true });

    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  /**
   * Get a single solution department by ID with full details
   */
  static async getDepartment(id: string): Promise<SolutionDepartmentWithDetails | null> {
    const { data, error } = await this.supabase
      .from('sh_solution_departments')
      .select(`
        *,
        department:departments!department_id(id, department_name, department_code),
        institution:institutions!institution_id(id, name)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Get department by department_id (the FK to departments table)
   */
  static async getDepartmentByDeptId(departmentId: string): Promise<SolutionDepartmentWithDetails | null> {
    const { data, error } = await this.supabase
      .from('sh_solution_departments')
      .select(`
        *,
        department:departments!department_id(id, department_name, department_code),
        institution:institutions!institution_id(id, name)
      `)
      .eq('department_id', departmentId)
      .single();

    if (error) return null;
    return data;
  }

  /**
   * Get summary counts by status
   */
  static async getSummary(): Promise<DepartmentSummary> {
    const { data, error } = await this.supabase
      .from('sh_solution_departments')
      .select('status');

    if (error) throw error;

    const counts = {
      active: 0,
      at_risk: 0,
      dormant: 0,
      pending_approval: 0,
      total: 0,
      total_revenue: 0,
    };

    (data || []).forEach((d: { status: string }) => {
      counts.total++;
      if (d.status === 'active') counts.active++;
      else if (d.status === 'at_risk') counts.at_risk++;
      else if (d.status === 'dormant') counts.dormant++;
      else if (d.status === 'pending_approval') counts.pending_approval++;
    });

    return counts;
  }

  /**
   * Update department status manually
   */
  static async updateStatus(
    id: string,
    newStatus: DepartmentStatus,
    reason: string,
    changedBy?: string
  ): Promise<void> {
    // Get current status
    const { data: current, error: fetchErr } = await this.supabase
      .from('sh_solution_departments')
      .select('status')
      .eq('id', id)
      .single();

    if (fetchErr) throw fetchErr;

    // Update status
    const updateData: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };
    if (newStatus === 'dormant') updateData.dormant_at = new Date().toISOString();
    if (newStatus === 'active') updateData.activated_at = new Date().toISOString();

    const { error: updateErr } = await this.supabase
      .from('sh_solution_departments')
      .update(updateData)
      .eq('id', id);

    if (updateErr) throw updateErr;

    // Record history
    await this.supabase.from('sh_department_status_history').insert({
      solution_department_id: id,
      previous_status: current.status,
      new_status: newStatus,
      reason,
      changed_by: changedBy || null,
    });
  }

  // ----------------------------------------
  // REVENUE
  // ----------------------------------------

  /**
   * Get revenue for a specific department in a time period
   */
  static async getDepartmentRevenue(
    departmentId: string,
    startDate?: string,
    endDate?: string
  ): Promise<number> {
    let query = this.supabase
      .from('sh_payments')
      .select('amount, solution:sh_solutions!solution_id(lead_department_id)')
      .eq('status', 'completed');

    if (startDate) query = query.gte('payment_date', startDate);
    if (endDate) query = query.lte('payment_date', endDate);

    const { data, error } = await query;
    if (error) throw error;

    // Filter by department and sum
    return (data || [])
      .filter((p: PaymentWithSolution) => p.solution?.lead_department_id === departmentId)
      .reduce((sum: number, p: PaymentWithSolution) => sum + (Number(p.amount) || 0), 0);
  }

  /**
   * Get revenue for ALL departments in a time period (optimized single query)
   */
  static async getAllDepartmentRevenues(
    startDate?: string,
    endDate?: string
  ): Promise<Record<string, number>> {
    let query = this.supabase
      .from('sh_payments')
      .select('amount, solution:sh_solutions!solution_id(lead_department_id)')
      .eq('status', 'completed');

    if (startDate) query = query.gte('payment_date', startDate);
    if (endDate) query = query.lte('payment_date', endDate);

    const { data, error } = await query;
    if (error) throw error;

    const revenues: Record<string, number> = {};
    (data || []).forEach((p: PaymentWithSolution) => {
      const deptId = p.solution?.lead_department_id;
      if (deptId) {
        revenues[deptId] = (revenues[deptId] || 0) + (Number(p.amount) || 0);
      }
    });

    return revenues;
  }

  /**
   * Get full department revenue list with targets and calculations
   */
  static async getDepartmentRevenueList(
    quarter?: string,
    previousQuarterStart?: string,
    previousQuarterEnd?: string
  ): Promise<DepartmentRevenue[]> {
    // Get all departments
    const departments = await this.listDepartments();

    // Get current quarter dates
    const now = new Date();
    const currentQuarter = quarter || `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;
    const parts = currentQuarter.split('-Q');
    const year = Number(parts[0]);
    const q = Number(parts[1]);
    if (!Number.isInteger(year) || !Number.isInteger(q) || q < 1 || q > 4) {
      throw new Error(`Invalid quarter format: "${currentQuarter}". Expected format: "YYYY-QN" (e.g., "2026-Q1")`);
    }
    const qStart = new Date(year, (q - 1) * 3, 1).toISOString();
    const qEnd = new Date(year, q * 3, 0, 23, 59, 59).toISOString();

    // Get revenues for current period
    const currentRevenues = await this.getAllDepartmentRevenues(qStart, qEnd);

    // Get revenues for previous period (for growth rate)
    let prevRevenues: Record<string, number> = {};
    if (previousQuarterStart && previousQuarterEnd) {
      prevRevenues = await this.getAllDepartmentRevenues(previousQuarterStart, previousQuarterEnd);
    } else {
      const prevQ = q === 1 ? 4 : q - 1;
      const prevYear = q === 1 ? year - 1 : year;
      const prevStart = new Date(prevYear, (prevQ - 1) * 3, 1).toISOString();
      const prevEnd = new Date(prevYear, prevQ * 3, 0, 23, 59, 59).toISOString();
      prevRevenues = await this.getAllDepartmentRevenues(prevStart, prevEnd);
    }

    // Get targets for current quarter
    const { data: targets } = await this.supabase
      .from('sh_department_targets')
      .select('solution_department_id, target_revenue')
      .eq('quarter', currentQuarter);

    const targetMap: Record<string, number> = {};
    (targets || []).forEach((t: { solution_department_id: string; target_revenue: number }) => {
      targetMap[t.solution_department_id] = Number(t.target_revenue) || 0;
    });

    // Get active solution counts and price sums per department
    const { data: solutions } = await this.supabase
      .from('sh_solutions')
      .select('lead_department_id, final_price, status')
      .neq('status', 'cancelled');

    const solutionCounts: Record<string, number> = {};
    const solutionPriceSums: Record<string, number> = {};
    (solutions || []).forEach((s: { lead_department_id: string; final_price: number | null; status: string }) => {
      if (s.status === 'active') {
        solutionCounts[s.lead_department_id] = (solutionCounts[s.lead_department_id] || 0) + 1;
      }
      if (s.final_price) {
        solutionPriceSums[s.lead_department_id] = (solutionPriceSums[s.lead_department_id] || 0) + Number(s.final_price);
      }
    });

    // Build result
    return departments.map((dept) => {
      const revenue = currentRevenues[dept.department_id] || 0;
      const prevRevenue = prevRevenues[dept.department_id] || 0;
      const explicitTarget = targetMap[dept.id] || 0;
      const estimatedTarget = solutionPriceSums[dept.department_id] || 0;
      const target = explicitTarget || estimatedTarget;
      const targetType: 'explicit' | 'estimated' | 'none' = explicitTarget > 0
        ? 'explicit'
        : estimatedTarget > 0
          ? 'estimated'
          : 'none';

      let growthRate: number | null = null;
      if (prevRevenue > 0) {
        growthRate = ((revenue - prevRevenue) / prevRevenue) * 100;
      } else if (revenue > 0) {
        // New revenue this quarter with no previous baseline
        growthRate = 100;
      }

      return {
        solution_department_id: dept.id,
        department_id: dept.department_id,
        department_name: dept.department?.department_name || '',
        department_code: dept.department?.department_code || '',
        institution_name: dept.institution?.name || '',
        institution_id: dept.institution_id,
        status: dept.status,
        revenue,
        target,
        target_type: targetType,
        achievement_pct: target > 0 ? (revenue / target) * 100 : 0,
        active_solutions: solutionCounts[dept.department_id] || 0,
        last_revenue_at: dept.last_revenue_at,
        growth_rate: growthRate,
      };
    });
  }

  /**
   * Get top N departments by revenue (leaderboard)
   */
  static async getLeaderboard(
    limit: number = 5,
    quarter?: string
  ): Promise<DepartmentRevenue[]> {
    const list = await this.getDepartmentRevenueList(quarter);
    return list
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit);
  }

  /**
   * Get quarterly revenue trend (last N quarters)
   */
  static async getQuarterlyTrend(
    quarters: number = 4
  ): Promise<{ quarter: string; revenue: number; active_count: number }[]> {
    const now = new Date();
    const currentQ = Math.ceil((now.getMonth() + 1) / 3);
    const currentYear = now.getFullYear();

    const results: { quarter: string; revenue: number; active_count: number }[] = [];

    for (let i = quarters - 1; i >= 0; i--) {
      let q = currentQ - i;
      let y = currentYear;
      while (q <= 0) { q += 4; y--; }

      const label = `${y}-Q${q}`;
      const start = new Date(y, (q - 1) * 3, 1).toISOString();
      const end = new Date(y, q * 3, 0, 23, 59, 59).toISOString();

      const revenues = await this.getAllDepartmentRevenues(start, end);
      const totalRevenue = Object.values(revenues).reduce((a, b) => a + b, 0);
      const activeCount = Object.values(revenues).filter((r) => r > 0).length;

      results.push({ quarter: label, revenue: totalRevenue, active_count: activeCount });
    }

    return results;
  }

  // ----------------------------------------
  // STATUS HISTORY
  // ----------------------------------------

  /**
   * Get status history for a department
   */
  static async getStatusHistory(
    solutionDepartmentId: string
  ): Promise<DepartmentStatusHistory[]> {
    const { data, error } = await this.supabase
      .from('sh_department_status_history')
      .select('*')
      .eq('solution_department_id', solutionDepartmentId)
      .order('changed_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  // ----------------------------------------
  // TARGETS
  // ----------------------------------------

  /**
   * Get targets for a department
   */
  static async getDepartmentTargets(
    solutionDepartmentId: string
  ): Promise<DepartmentTarget[]> {
    const { data, error } = await this.supabase
      .from('sh_department_targets')
      .select('*')
      .eq('solution_department_id', solutionDepartmentId)
      .order('quarter', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Set or update a quarterly target
   */
  static async setTarget(
    solutionDepartmentId: string,
    quarter: string,
    targetRevenue: number,
    notes?: string,
    setBy?: string
  ): Promise<DepartmentTarget> {
    const { data, error } = await this.supabase
      .from('sh_department_targets')
      .upsert(
        {
          solution_department_id: solutionDepartmentId,
          quarter,
          target_revenue: targetRevenue,
          notes: notes || null,
          set_by: setBy || null,
        },
        { onConflict: 'solution_department_id,quarter' }
      )
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // ----------------------------------------
  // SOLUTION TYPES
  // ----------------------------------------

  /**
   * List all solution types
   */
  static async listSolutionTypes(activeOnly = true): Promise<SolutionTypeRecord[]> {
    let query = this.supabase
      .from('sh_solution_types')
      .select('*')
      .order('is_default', { ascending: false })
      .order('name', { ascending: true });

    if (activeOnly) query = query.eq('is_active', true);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  /**
   * Create a new solution type
   */
  static async createSolutionType(input: {
    name: string;
    slug: string;
    description?: string;
    icon?: string;
    color?: string;
    created_by?: string;
  }): Promise<SolutionTypeRecord> {
    const { data, error } = await this.supabase
      .from('sh_solution_types')
      .insert({
        ...input,
        is_default: false,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Update a solution type
   */
  static async updateSolutionType(
    id: string,
    updates: Partial<Pick<SolutionTypeRecord, 'name' | 'description' | 'icon' | 'color' | 'is_active'>>
  ): Promise<SolutionTypeRecord> {
    const { data, error } = await this.supabase
      .from('sh_solution_types')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Check if a solution type has active solutions (prevent delete)
   */
  static async solutionTypeHasActiveSolutions(typeId: string): Promise<boolean> {
    const { count, error } = await this.supabase
      .from('sh_solutions')
      .select('id', { count: 'exact', head: true })
      .eq('solution_type_id', typeId)
      .neq('status', 'cancelled');

    if (error) return false;
    return (count || 0) > 0;
  }

  // ----------------------------------------
  // DEPARTMENT SOLUTIONS (pipeline)
  // ----------------------------------------

  /**
   * Get active solutions for a specific department
   */
  static async getDepartmentSolutions(departmentId: string): Promise<DepartmentSolution[]> {
    const { data, error } = await this.supabase
      .from('sh_solutions')
      .select(`
        id, title, solution_code, status, solution_type, final_price, start_date, target_date,
        client:sh_clients!client_id(id, name)
      `)
      .eq('lead_department_id', departmentId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  // ----------------------------------------
  // DEPARTMENT BUILDERS (Team)
  // ----------------------------------------

  /**
   * Get all builders belonging to a department (auto-populated from learners + staff)
   */
  static async getDepartmentBuilders(departmentId: string): Promise<DepartmentBuilder[]> {
    const { data, error } = await this.supabase
      .from('sh_builders')
      .select('id, name, email, phone, builder_code, specialization, learner_id, staff_id, availability_status, projects_completed, average_rating, tags')
      .eq('department_id', departmentId)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return (data || []).map((b: Record<string, unknown>) => ({
      ...b,
      role: b.staff_id ? 'facilitator' as const : b.learner_id ? 'learner' as const : 'builder' as const,
    })) as DepartmentBuilder[];
  }

  // ----------------------------------------
  // REFRESH STATUSES
  // ----------------------------------------

  /**
   * Trigger status recalculation for all departments
   * Calls the database function that checks revenue timestamps
   */
  static async refreshStatuses(): Promise<void> {
    const { error } = await this.supabase.rpc('update_department_statuses');
    if (error) throw error;
  }

  // ----------------------------------------
  // NOMINATIONS
  // ----------------------------------------

  /**
   * Submit a nomination for an academic department to become a solution department
   */
  static async nominateDepartment(input: {
    department_id: string;
    institution_id: string;
    nomination_reason: string;
    suggested_capabilities?: string[];
    nominated_by?: string;
  }): Promise<DepartmentNomination> {
    const { data, error } = await this.supabase
      .from('sh_department_nominations')
      .insert({
        department_id: input.department_id,
        institution_id: input.institution_id,
        nomination_reason: input.nomination_reason,
        suggested_capabilities: input.suggested_capabilities || [],
        nominated_by: input.nominated_by || null,
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * List nominations with optional status filter
   */
  static async getNominations(
    status?: NominationStatus
  ): Promise<DepartmentNominationWithDetails[]> {
    let query = this.supabase
      .from('sh_department_nominations')
      .select(`
        *,
        department:departments!department_id(id, department_name, department_code),
        institution:institutions!institution_id(id, name)
      `)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  /**
   * Approve a pending nomination (uses DB function for atomic operation)
   */
  static async approveNomination(
    nominationId: string,
    reviewerId: string,
    reviewNotes?: string
  ): Promise<string> {
    const { data, error } = await this.supabase.rpc('approve_department_nomination', {
      p_nomination_id: nominationId,
      p_reviewer_id: reviewerId,
      p_review_notes: reviewNotes || null,
    });

    if (error) throw error;
    return data; // Returns the new solution department ID
  }

  /**
   * Reject a pending nomination
   */
  static async rejectNomination(
    nominationId: string,
    reviewerId: string,
    reviewNotes: string
  ): Promise<void> {
    const { error } = await this.supabase
      .from('sh_department_nominations')
      .update({
        status: 'rejected',
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
        review_notes: reviewNotes,
      })
      .eq('id', nominationId)
      .eq('status', 'pending');

    if (error) throw error;
  }

  // ----------------------------------------
  // CAPABILITIES MANAGEMENT
  // ----------------------------------------

  /**
   * Update capabilities for a solution department
   */
  static async updateCapabilities(
    solutionDepartmentId: string,
    capabilities: string[]
  ): Promise<void> {
    const { error } = await this.supabase
      .from('sh_solution_departments')
      .update({ capabilities })
      .eq('id', solutionDepartmentId);

    if (error) throw error;
  }

  // ----------------------------------------
  // DEPARTMENT REMOVAL (soft deactivate)
  // ----------------------------------------

  /**
   * Remove a solution department (sets status to dormant with reason)
   */
  static async removeDepartment(
    solutionDepartmentId: string,
    reason: string,
    removedBy?: string
  ): Promise<void> {
    await this.updateStatus(solutionDepartmentId, 'dormant', reason, removedBy);
  }

  // ----------------------------------------
  // ELIGIBILITY / CRITERIA ENGINE
  // ----------------------------------------

  /**
   * Get all departments not yet in Solutions Hub with eligibility status
   */
  static async getEligibleDepartments(): Promise<EligibleDepartment[]> {
    const { data, error } = await this.supabase.rpc('get_eligible_departments');
    if (error) throw error;
    return data || [];
  }

  /**
   * Get all eligibility criteria rules
   */
  static async getEligibilityCriteria(activeOnly = true): Promise<EligibilityCriteria[]> {
    let query = this.supabase
      .from('sh_department_eligibility_criteria')
      .select('*')
      .order('criteria_type', { ascending: true })
      .order('priority', { ascending: true });

    if (activeOnly) query = query.eq('is_active', true);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }
}
