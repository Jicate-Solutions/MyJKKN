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
    const [year, q] = currentQuarter.split('-Q').map(Number);
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

    // Get active solution counts per department
    const { data: solutions } = await this.supabase
      .from('sh_solutions')
      .select('lead_department_id')
      .eq('status', 'active');

    const solutionCounts: Record<string, number> = {};
    (solutions || []).forEach((s: { lead_department_id: string }) => {
      solutionCounts[s.lead_department_id] = (solutionCounts[s.lead_department_id] || 0) + 1;
    });

    // Build result
    return departments.map((dept) => {
      const revenue = currentRevenues[dept.department_id] || 0;
      const prevRevenue = prevRevenues[dept.department_id] || 0;
      const target = targetMap[dept.id] || 0;

      let growthRate: number | null = null;
      if (prevRevenue > 0) {
        growthRate = ((revenue - prevRevenue) / prevRevenue) * 100;
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
}
