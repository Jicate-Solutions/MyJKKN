// lib/services/solutions/paradigm-shift-service.ts
// Paradigm Shift Dashboard - Self-validating department metrics from existing sh_* tables
// Announced at Cluster Council meeting on 2026-03-19
// All departments become Solutions Departments from April 1, 2026

import { BaseService } from '../base-service';
import { SolutionsCluster, getClusterForInstitution } from './clusters';

// ============================================
// TYPES
// ============================================

export type ReadinessTier = 'traditional' | 'emerging' | 'solution_ready' | 'pioneer';

// --- Commercial Value Metrics ---
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

// --- Societal Value Metrics ---
//
// THIS AXIS IS NOW MEASURABLE. The comment that used to sit here said there was no
// `sh_community_engagements` table (42P01) and no `is_pro_bono` / `beneficiaries_count`
// / `sdg_goals` columns on `sh_solutions` (42703). That was true when it was written on
// 2026-08-17 and it is false now: `20261013000000_societal_capture_and_activity_clock.sql`
// created the table and those columns, `20261019000000_societal_approval_and_status_review.sql`
// gave engagements an approval workflow, and the register has a capture surface on the
// department detail page. Four permission keys (`solutions.societal.view` / `.record` /
// `.submit` / `.approve`) are registered in lib/constants/permissions.ts.
//
// WHAT IS COUNTED, AND WHAT IS NOT.
//   * Only APPROVED engagements count. A pending entry has been claimed, not verified,
//     and the same rule governs the department activity clock: the trigger
//     `trg_community_engagement_touches_dept` fires on approval, never on insert.
//   * `null` still means "not measured" and is never replaced by `0`. Zero now has a
//     real meaning here — the register exists and holds no approved work for that
//     department — so it is reported as a number. `null` is reserved for the case where
//     the SOURCE itself is unreadable: the table or column is absent in this
//     environment because the migration has not been applied there.
//   * `pro_bono_solutions` is reported independently of the other four, because it
//     reads a different source (`sh_solutions.is_pro_bono`) that can be missing on its
//     own. If that column answers 42703, that ONE field stays `null` and the rest are
//     still reported.
//
// A CAVEAT WORTH STATING. These reads run under the caller's session (withAuth injects
// a session-scoped client), so RLS applies. A SELECT policy filters rather than raising,
// which means a reader without `solutions.societal.view` sees zero approved engagements
// and cannot be distinguished from a department that has none. The register panel on the
// department page says so in words; this service cannot.
export interface SocietalMetrics {
  /** `null` when `sh_solutions.is_pro_bono` is absent in this environment. */
  pro_bono_solutions: number | null;
  beneficiaries_reached: number;
  community_engagements: number;
  community_hours: number;
  sdg_goals_addressed: number;
}

/**
 * Why a societal figure is absent. There are three different absences and they
 * mean opposite things to whoever is reading the dashboard.
 *
 * THE DEFECT THIS EXISTS TO CLOSE. An RLS SELECT policy does not raise — it
 * FILTERS. A reader without `solutions.societal.view` gets HTTP 200, an empty
 * array and no error, which the previous `extractOrNull` treated as a
 * successful read of nothing and rendered as a measured `0`. That is the exact
 * fake-zero this axis was rebuilt to stop reporting, arriving through the
 * permission layer instead of the schema layer.
 */
export type SocietalAvailability =
  /** The caller may read the register and these numbers came out of it. */
  | 'measured'
  /** The table or its columns are absent here — the migration has not been applied. */
  | 'source_unavailable'
  /** The caller definitively lacks the key; the register is hidden, not empty. */
  | 'not_visible'
  /** Whether the caller may read it could not be established. Claim nothing. */
  | 'unconfirmed';

/**
 * Shown to the reader wherever a societal figure would otherwise appear — now only
 * when the register itself cannot be read, not as a standing statement about the
 * platform.
 */
export const SOCIETAL_METRICS_UNAVAILABLE_REASON =
  'Societal value could not be read — the community engagement register is not available in this environment yet.';

/** Shown when the register exists and the reader's role is not allowed to see it. */
export const SOCIETAL_METRICS_NOT_VISIBLE_REASON =
  'Societal value is hidden from your role, not measured as nil — reading the community ' +
  'engagement register needs solutions.societal.view. Ask your Solutions Hub administrator.';

/** Shown when the permission check itself did not answer. */
export const SOCIETAL_METRICS_UNCONFIRMED_REASON =
  'Societal value is not shown — whether your role may read the community engagement ' +
  'register could not be checked just now, and a zero here would be a guess. Reload to retry.';

/** The one sentence that goes with each non-measured outcome. */
export const SOCIETAL_AVAILABILITY_REASONS: Record<
  Exclude<SocietalAvailability, 'measured'>,
  string
> = {
  source_unavailable: SOCIETAL_METRICS_UNAVAILABLE_REASON,
  not_visible: SOCIETAL_METRICS_NOT_VISIBLE_REASON,
  unconfirmed: SOCIETAL_METRICS_UNCONFIRMED_REASON,
};

/** Shown against the pro-bono figure alone when only that column is missing. */
export const PRO_BONO_UNAVAILABLE_REASON =
  'Pro-bono solutions are not counted — sh_solutions has no is_pro_bono column in this environment.';

export interface DepartmentParadigmShift {
  department_id: string;
  department_name: string;
  department_code: string;
  institution_id: string;
  institution_name: string;
  cluster: SolutionsCluster;
  metrics: DepartmentMetrics;
  /** `null` = not measured. See SOCIETAL_METRICS_UNAVAILABLE_REASON. */
  societal: SocietalMetrics | null;
  active_metrics_count: number;
  /** `null` = not measured. */
  societal_metrics_count: number | null;
  tier: ReadinessTier;
  composite_score: number;
  /** `null` = not measured. */
  societal_score: number | null;
}

export interface ClusterSummary {
  count: number;
  revenue: number;
  solutions: number;
}

export interface ParadigmShiftOverview {
  departments: DepartmentParadigmShift[];
  summary: {
    total_departments: number;
    by_tier: Record<ReadinessTier, number>;
    by_cluster: Record<SolutionsCluster, ClusterSummary>;
    total_revenue: number;
    total_solutions: number;
    total_publications: number;
    /** `null` = not measured. See SOCIETAL_METRICS_UNAVAILABLE_REASON. */
    total_beneficiaries: number | null;
    /** `null` = not measured. */
    total_community_engagements: number | null;
    /** `null` = not measured. */
    total_pro_bono: number | null;
    /**
     * WHY the three societal totals above are `null`, when they are. Without
     * this the caller cannot tell "the register is not installed" from "you are
     * not allowed to see it" — and rendering either as `0` is the fake zero.
     */
    societal_availability: SocietalAvailability;
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
// SOCIETAL AXIS HELPERS
// ============================================

/**
 * Accumulator for one department's approved community engagements. Separate from
 * DepartmentMetrics because it is built from a different source with a different
 * failure mode: if the register is unreadable the whole axis is `null`, whereas a
 * commercial metric that returns nothing is a genuine zero.
 */
interface SocietalAccumulator {
  beneficiaries_reached: number;
  community_engagements: number;
  community_hours: number;
  /** Distinct SDG codes across every approved engagement for the department. */
  sdg_codes: Set<string>;
  pro_bono_solutions: number;
}

function emptySocietalAccumulator(): SocietalAccumulator {
  return {
    beneficiaries_reached: 0,
    community_engagements: 0,
    community_hours: 0,
    sdg_codes: new Set<string>(),
    pro_bono_solutions: 0,
  };
}

/** `hours_spent` is numeric(8,2); PostgREST hands numerics back as strings. */
function readNumeric(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/** text[] with a DEFAULT '{}' can still hold NULL on a hand-written row. */
function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
}

/**
 * How many of the five societal metrics carry a real, non-zero measurement.
 * A `null` field is not counted — it was never measured, so it cannot be active.
 */
function countActiveSocietalMetrics(s: SocietalMetrics): number {
  let count = 0;
  if ((s.pro_bono_solutions ?? 0) > 0) count++;
  if (s.beneficiaries_reached > 0) count++;
  if (s.community_engagements > 0) count++;
  if (s.community_hours > 0) count++;
  if (s.sdg_goals_addressed > 0) count++;
  return count;
}

// ============================================
// SERVICE CLASS
// ============================================

export const TOTAL_METRICS_COUNT = 9;
export const TOTAL_SOCIETAL_METRICS_COUNT = 5;

export class ParadigmShiftService extends BaseService {

  /**
   * Get all departments across all institutions with their paradigm shift metrics
   */
  static async getOverview(filters?: {
    institution_id?: string;
    tier?: ReadinessTier;
    cluster?: SolutionsCluster;
  }): Promise<ParadigmShiftOverview> {
    const fy = getCurrentFiscalYear();

    // 1. Get all departments with institution info
    let deptQuery = this.supabase
      .from('departments')
      .select(`
        id, department_name, department_code, institution_id,
        institution:institutions!departments_institution_id_fkey(id, name)
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
          by_cluster: {
            health: { count: 0, revenue: 0, solutions: 0 },
            tech: { count: 0, revenue: 0, solutions: 0 },
            arts_professional: { count: 0, revenue: 0, solutions: 0 },
          },
          total_revenue: 0,
          total_solutions: 0,
          total_publications: 0,
          total_beneficiaries: null,
          total_community_engagements: null,
          total_pro_bono: null,
        },
      };
    }

    const filteredDepts = departments;

    // Started BEFORE the metric queries so its round trip overlaps theirs and
    // costs no wall-clock time. Awaited after them.
    const societalVisibility = this.probeSocietalVisibility();

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

      // ── The societal axis ──────────────────────────────────────────────────
      // Restored, against sources that now exist. These two results are read
      // WITHOUT extractData below, because collapsing a failure into [] is
      // exactly what produced the fake zeros this axis was reporting before.

      // Approved community engagements, fiscal-year scoped like every other
      // dated metric on this dashboard. `approval_status = 'approved'` is the
      // whole point: a pending entry has been claimed, not verified, and the
      // department activity clock counts approvals only.
      this.supabase
        .from('sh_community_engagements')
        .select('department_id, hours_spent, beneficiaries_count, sdg_goals')
        .eq('approval_status', 'approved')
        .gte('engagement_date', fy.start)
        .lte('engagement_date', fy.end),

      // Pro-bono solutions: cumulative, no FY filter, mirroring the retained_ip
      // query above — a pro-bono solution is a standing fact about the solution,
      // not an event in a year.
      this.supabase
        .from('sh_solutions')
        .select('lead_department_id')
        .eq('is_pro_bono', true),
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

    /**
     * The societal reads keep their failure. `extractData` above turns a rejected
     * or errored query into `[]`, which for a societal figure is indistinguishable
     * from "measured, and it is nothing" — the exact confusion that had this
     * dashboard printing zeros as if they were measurements. `null` here means the
     * source could not be read at all.
     */
    const extractOrNull = (
      result: PromiseSettledResult<{ data: unknown[] | null; error: unknown }>
    ): unknown[] | null => {
      if (result.status !== 'fulfilled') return null;
      if (result.value.error) return null;
      return result.value.data ?? [];
    };

    const engagementRows = extractOrNull(results[8]);
    const proBonoRows = extractOrNull(results[9]);

    /**
     * An empty engagement result set is only a MEASUREMENT if the caller was
     * allowed to read the table. Under RLS it is otherwise a denial wearing a
     * successful response, and reporting it as `0` tells a head of department
     * their college did no community work when the truth is that the register
     * was never shown to them.
     */
    const canSeeRegister = await societalVisibility;
    const societalAvailability: SocietalAvailability =
      engagementRows === null
        ? 'source_unavailable'
        : canSeeRegister === true
          ? 'measured'
          : canSeeRegister === false
            ? 'not_visible'
            : 'unconfirmed';

    const societalReadable = societalAvailability === 'measured';
    // Pro-bono is still independently nullable — its column can be missing while
    // the register is present — but it can never outlive the visibility check
    // above, because `sh_solutions` is filtered by the same kind of policy.
    const proBonoReadable = societalReadable && proBonoRows !== null;

    // Per-department societal accumulation, from approved engagements only.
    const societalMap: Record<string, SocietalAccumulator> = {};
    const initSocietal = (deptId: string) => {
      if (!societalMap[deptId]) societalMap[deptId] = emptySocietalAccumulator();
    };

    (engagementRows ?? []).forEach((raw) => {
      const row = raw as {
        department_id: string | null;
        hours_spent: unknown;
        beneficiaries_count: number | null;
        sdg_goals: unknown;
      };
      if (!row.department_id) return;
      initSocietal(row.department_id);
      const acc = societalMap[row.department_id];
      acc.community_engagements++;
      acc.community_hours += readNumeric(row.hours_spent);
      acc.beneficiaries_reached += row.beneficiaries_count ?? 0;
      readStringArray(row.sdg_goals).forEach((code) => acc.sdg_codes.add(code));
    });

    (proBonoRows ?? []).forEach((raw) => {
      const row = raw as { lead_department_id: string | null };
      if (!row.lead_department_id) return;
      initSocietal(row.lead_department_id);
      societalMap[row.lead_department_id].pro_bono_solutions++;
    });

    /**
     * Build one department's societal block, or `null` when the register itself
     * could not be read. Pro-bono is independently nullable: its column can be
     * missing while the engagement table is present.
     */
    const buildSocietal = (deptId: string): SocietalMetrics | null => {
      if (!societalReadable) return null;
      const acc = societalMap[deptId] ?? emptySocietalAccumulator();
      return {
        pro_bono_solutions: proBonoReadable ? acc.pro_bono_solutions : null,
        beneficiaries_reached: acc.beneficiaries_reached,
        community_engagements: acc.community_engagements,
        community_hours: acc.community_hours,
        sdg_goals_addressed: acc.sdg_codes.size,
      };
    };

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

    // 4. Build department list with tiers and clusters.
    // The societal axis now reads the community engagement register; it is `null`
    // only when that register could not be read at all.
    const result: DepartmentParadigmShift[] = filteredDepts.map((dept) => {
      const metrics = metricsMap[dept.id] || emptyMetrics();
      const societal = buildSocietal(dept.id);
      const activeCount = countActiveMetrics(metrics);
      const rawInst = dept.institution;
      const inst = Array.isArray(rawInst) ? rawInst[0] : rawInst as { id: string; name: string } | null;
      const institutionName = inst?.name || '';

      return {
        department_id: dept.id,
        department_name: dept.department_name,
        department_code: dept.department_code,
        institution_id: dept.institution_id,
        institution_name: institutionName,
        cluster: getClusterForInstitution(institutionName),
        metrics,
        societal,
        active_metrics_count: activeCount,
        societal_metrics_count: societal ? countActiveSocietalMetrics(societal) : null,
        tier: calculateTier(activeCount),
        composite_score: computeCompositeScore(metrics),
        // Deliberately still null. `composite_score` is a weighted sum with
        // weights someone chose for the commercial axis; no weighting was ever
        // specified for the societal one. Inventing hours-vs-beneficiaries-vs-SDGs
        // weights here would produce a number colleges are ranked by, decided by
        // nobody. The underlying counts are all present above for whoever sets
        // that policy.
        societal_score: null,
      };
    });

    // Filter by tier and/or cluster if requested
    let finalResult = result;
    if (filters?.tier) {
      finalResult = finalResult.filter(d => d.tier === filters.tier);
    }
    if (filters?.cluster) {
      finalResult = finalResult.filter(d => d.cluster === filters.cluster);
    }

    // 5. Build summary with tier and cluster breakdowns
    const buildClusterSummary = (cluster: SolutionsCluster): ClusterSummary => {
      const clusterDepts = finalResult.filter(d => d.cluster === cluster);
      return {
        count: clusterDepts.length,
        revenue: clusterDepts.reduce((sum, d) => sum + d.metrics.revenue_generated, 0),
        solutions: clusterDepts.reduce((sum, d) => sum + d.metrics.solutions_built, 0),
      };
    };

    const summary = {
      total_departments: finalResult.length,
      by_tier: {
        traditional: finalResult.filter(d => d.tier === 'traditional').length,
        emerging: finalResult.filter(d => d.tier === 'emerging').length,
        solution_ready: finalResult.filter(d => d.tier === 'solution_ready').length,
        pioneer: finalResult.filter(d => d.tier === 'pioneer').length,
      },
      by_cluster: {
        health: buildClusterSummary('health'),
        tech: buildClusterSummary('tech'),
        arts_professional: buildClusterSummary('arts_professional'),
      },
      total_revenue: finalResult.reduce((sum, d) => sum + d.metrics.revenue_generated, 0),
      total_solutions: finalResult.reduce((sum, d) => sum + d.metrics.solutions_built, 0),
      total_publications: finalResult.reduce((sum, d) => sum + d.metrics.publications, 0),
      // Summed across the SAME departments the caller is looking at, and `null`
      // whenever the underlying source was unreadable — never a zero standing in
      // for an unread source.
      total_beneficiaries: societalReadable
        ? finalResult.reduce((sum, d) => sum + (d.societal?.beneficiaries_reached ?? 0), 0)
        : null,
      total_community_engagements: societalReadable
        ? finalResult.reduce((sum, d) => sum + (d.societal?.community_engagements ?? 0), 0)
        : null,
      total_pro_bono: proBonoReadable
        ? finalResult.reduce((sum, d) => sum + (d.societal?.pro_bono_solutions ?? 0), 0)
        : null,
      societal_availability: societalAvailability,
    };

    return { departments: finalResult, summary };
  }

  /**
   * May this caller read the community engagement register at all?
   *
   * `true` / `false` are answers; `null` means the question could not be asked
   * and the caller must claim nothing either way.
   *
   * TWO probes, because ONE is not the policy. The SELECT policy on
   * `sh_community_engagements` is `is_super_admin() OR is_admin() OR
   * (user_has_permission('solutions.societal.view') AND
   * role_has_institution_access(institution_id))`, and
   * `user_has_permission()` bypasses ONLY `is_super_admin = true` — it knows
   * nothing about `is_admin()`, which also covers role IN ('admin',
   * 'administrator'). Asking the permission alone would report "hidden from
   * your role" to an administrator who can in fact read every row, hiding real
   * data behind an honest-sounding sentence. `is_admin()` is true for super
   * admins too, so these two together are the whole policy minus its
   * per-row institution filter — which is a filter, not a gate, and is the
   * same scoping the department list itself is already under.
   */
  private static async probeSocietalVisibility(): Promise<boolean | null> {
    type ProbeResult = PromiseSettledResult<{ data: unknown; error: unknown }>;

    const readProbe = (result: ProbeResult): boolean | null => {
      if (result.status !== 'fulfilled') return null;
      if (result.value.error) return null;
      if (typeof result.value.data !== 'boolean') return null;
      return result.value.data;
    };

    const [adminProbe, keyProbe] = (await Promise.allSettled([
      this.supabase.rpc('is_admin'),
      this.supabase.rpc('user_has_permission', {
        permission_name: 'solutions.societal.view',
      }),
    ])) as [ProbeResult, ProbeResult];

    const isAdmin = readProbe(adminProbe);
    const hasKey = readProbe(keyProbe);

    // Either yes is a yes.
    if (isAdmin === true || hasKey === true) return true;
    // A definite no requires BOTH to have answered no. One unanswered probe
    // leaves the question open, and an open question is not a denial.
    if (isAdmin === false && hasKey === false) return false;
    return null;
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
        institution:institutions!departments_institution_id_fkey(id, name)
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
