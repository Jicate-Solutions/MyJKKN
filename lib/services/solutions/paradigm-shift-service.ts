// lib/services/solutions/paradigm-shift-service.ts
// Paradigm Shift Dashboard - Self-validating department metrics from existing sh_* tables
// Announced at Cluster Council meeting on 2026-03-19
// All departments become Solutions Departments from April 1, 2026

import { BaseService } from '../base-service';

// ============================================
// TYPES
// ============================================

export type ReadinessTier = 'traditional' | 'emerging' | 'solution_ready' | 'pioneer';

export interface DepartmentMetrics {
  problems_identified: number;   // sh_discovery_visits COUNT
  solutions_built: number;       // sh_solutions COUNT (active/completed)
  clients_engaged: number;       // sh_clients DISTINCT via solutions
  revenue_generated: number;     // sh_payments SUM (completed)
  publications: number;          // sh_publications COUNT
  prototypes_built: number;      // sh_prototype_iterations COUNT via phases
  ip_retained: number;           // sh_solutions WHERE retained_ip = true
  trl4_products: number;         // sh_products WHERE current_trl >= 4
  training_completed: number;    // sh_training_programs participant count
}

export interface DepartmentParadigmShift {
  department_id: string;
  department_name: string;
  department_code: string;
  institution_id: string;
  institution_name: string;
  metrics: DepartmentMetrics;
  active_metrics_count: number;
  tier: ReadinessTier;
  composite_score: number;
}

export interface ParadigmShiftOverview {
  departments: DepartmentParadigmShift[];
  summary: {
    total_departments: number;
    by_tier: Record<ReadinessTier, number>;
    total_revenue: number;
    total_solutions: number;
    total_publications: number;
  };
}

export interface DepartmentDetail extends DepartmentParadigmShift {
  monthly_timeline: MonthlyProgress[];
  institutional_average: DepartmentMetrics;
  recommendations: string[];
  recent_solutions: Array<{
    id: string;
    title: string;
    solution_code: string | null;
    status: string;
    solution_type: string | null;
    client_name: string | null;
  }>;
  recent_publications: Array<{
    id: string;
    title: string;
    paper_type: string;
    publication_code: string | null;
  }>;
}

export interface MonthlyProgress {
  month: string; // YYYY-MM
  solutions: number;
  revenue: number;
  discovery_visits: number;
}

export interface LeaderboardEntry extends DepartmentParadigmShift {
  rank: number;
  tier_changed: boolean; // improved tier this month
}

// ============================================
// HELPER: Fiscal year boundaries (April 1 - March 31)
// ============================================

function getCurrentFiscalYear(): { start: string; end: string; label: string } {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return {
    start: `${year}-04-01`,
    end: `${year + 1}-03-31`,
    label: `FY ${year}-${year + 1}`,
  };
}

function calculateTier(activeCount: number): ReadinessTier {
  if (activeCount >= 9) return 'pioneer';
  if (activeCount >= 7) return 'solution_ready';
  if (activeCount >= 4) return 'emerging';
  return 'traditional';
}

function countActiveMetrics(m: DepartmentMetrics): number {
  let count = 0;
  if (m.problems_identified > 0) count++;
  if (m.solutions_built > 0) count++;
  if (m.clients_engaged > 0) count++;
  if (m.revenue_generated > 0) count++;
  if (m.publications > 0) count++;
  if (m.prototypes_built > 0) count++;
  if (m.ip_retained > 0) count++;
  if (m.trl4_products > 0) count++;
  if (m.training_completed > 0) count++;
  return count;
}

// Composite score = weighted sum for ranking
function computeCompositeScore(m: DepartmentMetrics): number {
  return (
    m.problems_identified * 1 +
    m.solutions_built * 10 +
    m.clients_engaged * 5 +
    (m.revenue_generated / 10000) * 3 + // normalize revenue
    m.publications * 15 +
    m.prototypes_built * 5 +
    m.ip_retained * 20 +
    m.trl4_products * 25 +
    m.training_completed * 2
  );
}

function emptyMetrics(): DepartmentMetrics {
  return {
    problems_identified: 0,
    solutions_built: 0,
    clients_engaged: 0,
    revenue_generated: 0,
    publications: 0,
    prototypes_built: 0,
    ip_retained: 0,
    trl4_products: 0,
    training_completed: 0,
  };
}

// ============================================
// SERVICE CLASS
// ============================================

export const TOTAL_METRICS_COUNT = 9;

export class ParadigmShiftService extends BaseService {

  /**
   * Get all departments across all institutions with their paradigm shift metrics
   */
  static async getOverview(filters?: {
    institution_id?: string;
    tier?: ReadinessTier;
  }): Promise<ParadigmShiftOverview> {
    const fy = getCurrentFiscalYear();

    // 1. Get all departments with institution info
    let deptQuery = this.supabase
      .from('departments')
      .select(`
        id, department_name, department_code, institution_id,
        institution:institutions!institution_id(id, name)
      `)
      .eq('is_active', true)
      .order('department_name');

    // Scope to institution at the DB query level
    if (filters?.institution_id) {
      deptQuery = deptQuery.eq('institution_id', filters.institution_id);
    }

    const { data: departments, error: deptErr } = await deptQuery;

    if (deptErr) throw deptErr;
    if (!departments?.length) {
      return {
        departments: [],
        summary: {
          total_departments: 0,
          by_tier: { traditional: 0, emerging: 0, solution_ready: 0, pioneer: 0 },
          total_revenue: 0,
          total_solutions: 0,
          total_publications: 0,
        },
      };
    }

    const filteredDepts = departments;

    // 2. Run all metric queries in parallel using allSettled for graceful degradation
    const results = await Promise.allSettled([
      // Discovery visits by department
      this.supabase
        .from('sh_discovery_visits')
        .select('department_id')
        .gte('visit_date', fy.start)
        .lte('visit_date', fy.end),

      // Solutions by lead_department_id
      this.supabase
        .from('sh_solutions')
        .select('lead_department_id, client_id, status')
        .in('status', ['active', 'completed'])
        .gte('created_at', fy.start + 'T00:00:00')
        .lte('created_at', fy.end + 'T23:59:59'),

      // Payments via solutions
      this.supabase
        .from('sh_payments')
        .select('amount, solution:sh_solutions!solution_id(lead_department_id)')
        .eq('status', 'completed')
        .gte('payment_date', fy.start)
        .lte('payment_date', fy.end),

      // Publications by department
      this.supabase
        .from('sh_publications')
        .select('department_id')
        .gte('created_at', fy.start + 'T00:00:00')
        .lte('created_at', fy.end + 'T23:59:59'),

      // Prototype iterations via phases → solutions
      this.supabase
        .from('sh_prototype_iterations')
        .select('phase:sh_solution_phases!phase_id(solution:sh_solutions!solution_id(lead_department_id))')
        .gte('created_at', fy.start + 'T00:00:00')
        .lte('created_at', fy.end + 'T23:59:59'),

      // Products with TRL data (cumulative — no FY filter, products are assets)
      this.supabase
        .from('sh_products')
        .select('lead_department_id, current_trl'),

      // IP retained: solutions where JKKN retained IP/learnings (spec: sh_solutions.retained_ip = true)
      this.supabase
        .from('sh_solutions')
        .select('lead_department_id')
        .eq('retained_ip', true),

      // Training programs with participant counts
      this.supabase
        .from('sh_training_programs')
        .select('solution:sh_solutions!solution_id(lead_department_id), participant_count')
        .gte('created_at', fy.start + 'T00:00:00')
        .lte('created_at', fy.end + 'T23:59:59'),
    ]);

    // Extract data with graceful fallback for failed queries
    const extractData = (result: PromiseSettledResult<{ data: unknown[] | null; error: unknown }>) => {
      if (result.status === 'fulfilled' && result.value.data) return result.value.data;
      return [];
    };

    const discoveryData = { data: extractData(results[0]) };
    const solutionsData = { data: extractData(results[1]) };
    const paymentsData = { data: extractData(results[2]) };
    const publicationsData = { data: extractData(results[3]) };
    const iterationsData = { data: extractData(results[4]) };
    const productsData = { data: extractData(results[5]) };
    const ipRetainedData = { data: extractData(results[6]) };
    const trainingData = { data: extractData(results[7]) };

    // 3. Build per-department metric maps
    const metricsMap: Record<string, DepartmentMetrics> = {};
    const initMetrics = (deptId: string) => {
      if (!metricsMap[deptId]) metricsMap[deptId] = emptyMetrics();
    };

    // Discovery visits
    (discoveryData.data || []).forEach((row: { department_id: string | null }) => {
      if (row.department_id) {
        initMetrics(row.department_id);
        metricsMap[row.department_id].problems_identified++;
      }
    });

    // Solutions + clients
    const clientsByDept: Record<string, Set<string>> = {};
    (solutionsData.data || []).forEach((row: { lead_department_id: string; client_id: string | null; status: string }) => {
      if (row.lead_department_id) {
        initMetrics(row.lead_department_id);
        metricsMap[row.lead_department_id].solutions_built++;
        if (row.client_id) {
          if (!clientsByDept[row.lead_department_id]) clientsByDept[row.lead_department_id] = new Set();
          clientsByDept[row.lead_department_id].add(row.client_id);
        }
      }
    });
    Object.entries(clientsByDept).forEach(([deptId, clients]) => {
      initMetrics(deptId);
      metricsMap[deptId].clients_engaged = clients.size;
    });

    // Revenue
    (paymentsData.data || []).forEach((row: { amount: number; solution: { lead_department_id: string } | null }) => {
      const deptId = row.solution?.lead_department_id;
      if (deptId) {
        initMetrics(deptId);
        metricsMap[deptId].revenue_generated += Number(row.amount) || 0;
      }
    });

    // Publications
    (publicationsData.data || []).forEach((row: { department_id: string | null }) => {
      if (row.department_id) {
        initMetrics(row.department_id);
        metricsMap[row.department_id].publications++;
      }
    });

    // Prototype iterations
    (iterationsData.data || []).forEach((row: { phase: { solution: { lead_department_id: string } | null } | null }) => {
      const deptId = row.phase?.solution?.lead_department_id;
      if (deptId) {
        initMetrics(deptId);
        metricsMap[deptId].prototypes_built++;
      }
    });

    // Products: TRL 4+
    (productsData.data || []).forEach((row: { lead_department_id: string | null; current_trl: number | null }) => {
      if (row.lead_department_id) {
        initMetrics(row.lead_department_id);
        if (row.current_trl && row.current_trl >= 4) {
          metricsMap[row.lead_department_id].trl4_products++;
        }
      }
    });

    // IP Retained: solutions where JKKN retained IP/learnings from client work
    (ipRetainedData.data || []).forEach((row: { lead_department_id: string | null }) => {
      if (row.lead_department_id) {
        initMetrics(row.lead_department_id);
        metricsMap[row.lead_department_id].ip_retained++;
      }
    });

    // Training completed
    (trainingData.data || []).forEach((row: { solution: { lead_department_id: string } | null; participant_count: number | null }) => {
      const deptId = row.solution?.lead_department_id;
      if (deptId) {
        initMetrics(deptId);
        metricsMap[deptId].training_completed += (row.participant_count || 0);
      }
    });

    // 4. Build department list with tiers
    const result: DepartmentParadigmShift[] = filteredDepts.map((dept) => {
      const metrics = metricsMap[dept.id] || emptyMetrics();
      const activeCount = countActiveMetrics(metrics);
      const rawInst = dept.institution;
      const inst = Array.isArray(rawInst) ? rawInst[0] : rawInst as { id: string; name: string } | null;

      return {
        department_id: dept.id,
        department_name: dept.department_name,
        department_code: dept.department_code,
        institution_id: dept.institution_id,
        institution_name: inst?.name || '',
        metrics,
        active_metrics_count: activeCount,
        tier: calculateTier(activeCount),
        composite_score: computeCompositeScore(metrics),
      };
    });

    // Filter by tier if requested
    const finalResult = filters?.tier
      ? result.filter(d => d.tier === filters.tier)
      : result;

    // 5. Build summary
    const summary = {
      total_departments: finalResult.length,
      by_tier: {
        traditional: finalResult.filter(d => d.tier === 'traditional').length,
        emerging: finalResult.filter(d => d.tier === 'emerging').length,
        solution_ready: finalResult.filter(d => d.tier === 'solution_ready').length,
        pioneer: finalResult.filter(d => d.tier === 'pioneer').length,
      },
      total_revenue: finalResult.reduce((sum, d) => sum + d.metrics.revenue_generated, 0),
      total_solutions: finalResult.reduce((sum, d) => sum + d.metrics.solutions_built, 0),
      total_publications: finalResult.reduce((sum, d) => sum + d.metrics.publications, 0),
    };

    return { departments: finalResult, summary };
  }

  /**
   * Get detailed view for a single department.
   * Fetches metrics scoped to the department's institution for comparison.
   */
  static async getDepartmentDetail(departmentId: string): Promise<DepartmentDetail | null> {
    const fy = getCurrentFiscalYear();

    // First, look up the department to get its institution_id
    const { data: deptRow, error: deptErr } = await this.supabase
      .from('departments')
      .select(`
        id, department_name, department_code, institution_id,
        institution:institutions!institution_id(id, name)
      `)
      .eq('id', departmentId)
      .eq('is_active', true)
      .single();

    if (deptErr || !deptRow) return null;

    // Get overview scoped to this department's institution (much fewer queries)
    const overview = await this.getOverview({ institution_id: deptRow.institution_id });
    const dept = overview.departments.find(d => d.department_id === departmentId);
    if (!dept) return null;

    // Get monthly timeline and recent data in parallel
    const [timeline, recentSolutionsRes, recentPubsRes] = await Promise.all([
      this.getMonthlyTimeline(departmentId),

      // Recent solutions
      this.supabase
        .from('sh_solutions')
        .select(`
          id, title, solution_code, status, solution_type,
          client:sh_clients!client_id(name)
        `)
        .eq('lead_department_id', departmentId)
        .in('status', ['active', 'completed'])
        .order('created_at', { ascending: false })
        .limit(5),

      // Recent publications
      this.supabase
        .from('sh_publications')
        .select('id, title, paper_type, publication_code')
        .eq('department_id', departmentId)
        .gte('created_at', fy.start + 'T00:00:00')
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

    // Compute institutional average from the institution-scoped overview
    const sameInst = overview.departments;
    const avg = emptyMetrics();
    if (sameInst.length > 0) {
      const keys = Object.keys(avg) as (keyof DepartmentMetrics)[];
      keys.forEach(key => {
        (avg[key] as number) = Math.round(
          sameInst.reduce((sum, d) => sum + (d.metrics[key] as number), 0) / sameInst.length
        );
      });
    }

    // Generate recommendations based on missing metrics
    const recs = this.generateRecommendations(dept.metrics);
    const recentSolutions = recentSolutionsRes.data || [];
    const recentPubs = recentPubsRes.data || [];

    return {
      ...dept,
      monthly_timeline: timeline,
      institutional_average: avg,
      recommendations: recs,
      recent_solutions: recentSolutions.map((s: Record<string, unknown>) => ({
        id: s.id as string,
        title: s.title as string,
        solution_code: s.solution_code as string | null,
        status: s.status as string,
        solution_type: s.solution_type as string | null,
        client_name: (s.client as { name: string } | null)?.name || null,
      })),
      recent_publications: recentPubs.map((p: Record<string, unknown>) => ({
        id: p.id as string,
        title: p.title as string,
        paper_type: p.paper_type as string,
        publication_code: p.publication_code as string | null,
      })),
    };
  }

  /**
   * Get leaderboard ranked by composite score
   */
  static async getLeaderboard(filters?: {
    institution_id?: string;
    limit?: number;
  }): Promise<LeaderboardEntry[]> {
    const overview = await this.getOverview({
      institution_id: filters?.institution_id,
    });

    const sorted = overview.departments
      .sort((a, b) => b.composite_score - a.composite_score)
      .slice(0, filters?.limit || 50);

    return sorted.map((dept, idx) => ({
      ...dept,
      rank: idx + 1,
      tier_changed: false, // TODO: compare with previous month snapshot
    }));
  }

  // ----------------------------------------
  // PRIVATE HELPERS
  // ----------------------------------------

  private static async getMonthlyTimeline(departmentId: string): Promise<MonthlyProgress[]> {
    const now = new Date();
    // Calculate 12-month range
    const startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const rangeStart = startDate.toISOString().slice(0, 10);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const rangeEnd = endDate.toISOString().slice(0, 10);

    // 3 bulk queries instead of 36 sequential ones
    const [solRes, revRes, discRes] = await Promise.all([
      this.supabase
        .from('sh_solutions')
        .select('created_at')
        .eq('lead_department_id', departmentId)
        .gte('created_at', rangeStart + 'T00:00:00')
        .lte('created_at', rangeEnd + 'T23:59:59'),
      this.supabase
        .from('sh_payments')
        .select('amount, payment_date, solution:sh_solutions!solution_id(lead_department_id)')
        .eq('status', 'completed')
        .gte('payment_date', rangeStart)
        .lte('payment_date', rangeEnd),
      this.supabase
        .from('sh_discovery_visits')
        .select('visit_date')
        .eq('department_id', departmentId)
        .gte('visit_date', rangeStart)
        .lte('visit_date', rangeEnd),
    ]);

    // Bucket results by month
    const bucketByMonth = (dateStr: string): string => dateStr.slice(0, 7); // "YYYY-MM"

    const solutionsByMonth: Record<string, number> = {};
    (solRes.data || []).forEach((row: { created_at: string }) => {
      const m = bucketByMonth(row.created_at);
      solutionsByMonth[m] = (solutionsByMonth[m] || 0) + 1;
    });

    const revenueByMonth: Record<string, number> = {};
    (revRes.data || []).forEach((row: { amount: number; payment_date: string; solution: { lead_department_id: string } | null }) => {
      if (row.solution?.lead_department_id === departmentId) {
        const m = bucketByMonth(row.payment_date);
        revenueByMonth[m] = (revenueByMonth[m] || 0) + (Number(row.amount) || 0);
      }
    });

    const visitsByMonth: Record<string, number> = {};
    (discRes.data || []).forEach((row: { visit_date: string }) => {
      const m = bucketByMonth(row.visit_date);
      visitsByMonth[m] = (visitsByMonth[m] || 0) + 1;
    });

    // Build 12-month array
    const months: MonthlyProgress[] = [];
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      months.push({
        month: label,
        solutions: solutionsByMonth[label] || 0,
        revenue: revenueByMonth[label] || 0,
        discovery_visits: visitsByMonth[label] || 0,
      });
    }

    return months;
  }

  private static generateRecommendations(metrics: DepartmentMetrics): string[] {
    const recs: string[] = [];

    if (metrics.problems_identified === 0) {
      recs.push('Start with discovery visits to identify industry problems your department can solve');
    }
    if (metrics.solutions_built === 0) {
      recs.push('Register your first solution in the Solutions Hub — even a small consulting project counts');
    }
    if (metrics.clients_engaged === 0) {
      recs.push('Engage with at least one external client through placements, alumni, or direct outreach');
    }
    if (metrics.revenue_generated === 0 && metrics.solutions_built > 0) {
      recs.push('Convert your active solutions into revenue — ensure payments are recorded in the system');
    }
    if (metrics.publications === 0) {
      recs.push('Publish research outcomes from your solutions work — journals, conferences, or case studies');
    }
    if (metrics.prototypes_built === 0 && metrics.solutions_built > 0) {
      recs.push('Build prototypes for your software solutions to move through the TRL pipeline');
    }
    if (metrics.ip_retained === 0) {
      recs.push('Mark solutions with retained IP to track learnings your department keeps from client work');
    }
    if (metrics.trl4_products === 0) {
      recs.push('Advance at least one product to TRL 4+ (lab-validated) for RDIF eligibility');
    }
    if (metrics.training_completed === 0) {
      recs.push('Deliver training programs to external participants — workshops, bootcamps, or certifications');
    }

    return recs;
  }
}
