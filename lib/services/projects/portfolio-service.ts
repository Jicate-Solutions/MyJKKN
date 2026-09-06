/**
 * Portfolio Service
 *
 * Cross-institution aggregate reads for the Projects Portfolio dashboard (F4).
 *
 * The base ProjectService.listProjects returns project rows + master relations.
 * The portfolio cards additionally need metrics that live in sibling tables:
 *   - task counts (project_tasks)          → % complete corroboration, X/Y tasks
 *   - budget summary (project_budget)     → planned vs actual INR
 *   - open risk count (project_risks)      → risk count badge
 *   - owner name (staff)                   → owner avatar/initials
 *   - institution name (institutions)      → grouping + heatmap rows
 *   - last activity (project_activity_feed)→ "last active" timestamp
 *
 * Rather than N per-project round-trips, we fetch each sibling set ONCE keyed
 * by project_id and fold the aggregates in memory. This keeps the portfolio a
 * handful of queries regardless of project count.
 *
 * COMPUTED vs STUBBED (spec-vs-reality):
 *   - percent_complete: read from projects.percent_complete (authoritative column)
 *   - taskTotal / taskDone: COMPUTED from project_tasks (status_key 'done'-family
 *     heuristic + completed_at). The status_key vocabulary is board-defined, so
 *     "done" detection is best-effort; completed_at is the firmer signal.
 *   - budgetPlanned / budgetActual: COMPUTED summing project_budget rows.
 *   - openRiskCount: COMPUTED counting project_risks not in a closed status_key.
 *   - lastActivityAt: COMPUTED as max(project_activity_feed.created_at), falling
 *     back to projects.updated_at when no feed entries exist.
 *
 * Pattern: static class, SupabaseClient as first arg (matches ProjectService).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ProjectWithRelations,
  RagStatus,
} from '@/types/projects';
import { ProjectService } from './project-service';

// ─── Read shapes ──────────────────────────────────────────────────────────────

export interface PortfolioCardMetrics {
  taskTotal: number;
  taskDone: number;
  /** Sum of project_budget.planned_amount_inr (INR). */
  budgetPlanned: number;
  /** Sum of project_budget.actual_amount_inr (INR). */
  budgetActual: number;
  /** project_risks rows in an open status. */
  openRiskCount: number;
  /** max(activity feed created_at) || projects.updated_at. */
  lastActivityAt: string;
}

export interface PortfolioProject extends ProjectWithRelations {
  institutionName: string | null;
  ownerName: string | null;
  metrics: PortfolioCardMetrics;
}

/** Coarse status bucket key (see STATUS_BUCKETS). */
export const STATUS_BUCKETS = [
  'on_track',
  'at_risk',
  'delayed',
  'completed',
] as const;

export type StatusBucket = (typeof STATUS_BUCKETS)[number];

export const STATUS_BUCKET_LABELS: Record<StatusBucket, string> = {
  on_track: 'On Track',
  at_risk: 'At Risk',
  delayed: 'Delayed',
  completed: 'Completed',
};

/** One cell in the institution × status matrix. */
export interface HeatmapCell {
  institutionId: string;
  bucket: StatusBucket;
  count: number;
}

export interface InstitutionSummary {
  institutionId: string;
  institutionName: string;
  projectCount: number;
  atRiskCount: number; // rag_status amber or red
  redCount: number;
}

export interface PortfolioData {
  projects: PortfolioProject[];
  institutions: InstitutionSummary[];
  /** Flat list of matrix cells (institution × bucket). */
  heatmap: HeatmapCell[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Reduce a project to one of the four coarse buckets.
 * Done/cancelled → completed. Otherwise rag_status drives:
 *   red → delayed, amber → at_risk, green/unknown → on_track.
 */
export function bucketForProject(p: {
  status?: { category?: string | null } | null;
  rag_status: RagStatus | string;
}): StatusBucket {
  const category = p.status?.category ?? null;
  if (category === 'done' || category === 'cancelled') return 'completed';
  const rag = p.rag_status;
  if (rag === 'red') return 'delayed';
  if (rag === 'amber') return 'at_risk';
  return 'on_track';
}

// Open-risk status keys we DON'T count (closed/resolved/mitigated).
const CLOSED_RISK_STATUS_KEYS = new Set([
  'closed',
  'resolved',
  'mitigated',
  'accepted',
  'retired',
]);

// Task status keys we treat as "done" when completed_at is absent.
const DONE_TASK_STATUS_KEYS = new Set(['done', 'complete', 'completed', 'closed']);

// ─── Service ────────────────────────────────────────────────────────────────────

export class PortfolioService {
  /**
   * Build the full portfolio dataset (cards + institution summaries + heatmap)
   * with a bounded number of queries.
   */
  static async getPortfolio(supabase: SupabaseClient): Promise<PortfolioData> {
    // 1) Base projects (+ master relations). Reuse the canonical list path so
    //    soft-deleted rows are already hidden and the master joins match the
    //    rest of the module.
    const projects = await ProjectService.listProjects(supabase, {});
    const projectIds = projects.map((p) => p.id);

    if (projectIds.length === 0) {
      return { projects: [], institutions: [], heatmap: [] };
    }

    // 2) Sibling aggregates — fetched once each, folded by project_id.
    const [taskRows, budgetRows, riskRows, activityRows, institutionRows, staffRows] =
      await Promise.all([
        this.fetchTasks(supabase, projectIds),
        this.fetchBudgets(supabase, projectIds),
        this.fetchRisks(supabase, projectIds),
        this.fetchLastActivity(supabase, projectIds),
        this.fetchInstitutions(supabase, projects),
        this.fetchOwners(supabase, projects),
      ]);

    const institutionNameById = new Map(institutionRows.map((i) => [i.id, i.name]));
    const ownerNameById = new Map(staffRows.map((s) => [s.id, s.name]));

    // Fold task counts
    const taskAgg = new Map<string, { total: number; done: number }>();
    for (const t of taskRows) {
      const cur = taskAgg.get(t.project_id) ?? { total: 0, done: 0 };
      cur.total += 1;
      const isDone =
        t.completed_at != null ||
        DONE_TASK_STATUS_KEYS.has((t.status_key ?? '').toLowerCase());
      if (isDone) cur.done += 1;
      taskAgg.set(t.project_id, cur);
    }

    // Fold budgets
    const budgetAgg = new Map<string, { planned: number; actual: number }>();
    for (const b of budgetRows) {
      const cur = budgetAgg.get(b.project_id) ?? { planned: 0, actual: 0 };
      cur.planned += Number(b.planned_amount_inr ?? 0);
      cur.actual += Number(b.actual_amount_inr ?? 0);
      budgetAgg.set(b.project_id, cur);
    }

    // Fold open risks
    const riskAgg = new Map<string, number>();
    for (const r of riskRows) {
      const isOpen = !CLOSED_RISK_STATUS_KEYS.has((r.status_key ?? '').toLowerCase());
      if (isOpen) riskAgg.set(r.project_id, (riskAgg.get(r.project_id) ?? 0) + 1);
    }

    // Fold last activity (rows already ordered desc; first per project wins)
    const lastActivity = new Map<string, string>();
    for (const a of activityRows) {
      if (!lastActivity.has(a.project_id)) {
        lastActivity.set(a.project_id, a.created_at);
      }
    }

    // 3) Assemble enriched portfolio projects
    const portfolioProjects: PortfolioProject[] = projects.map((p) => {
      const tasks = taskAgg.get(p.id) ?? { total: 0, done: 0 };
      const budget = budgetAgg.get(p.id) ?? { planned: 0, actual: 0 };
      return {
        ...p,
        institutionName: p.institution_id
          ? institutionNameById.get(p.institution_id) ?? null
          : null,
        ownerName: p.owner_staff_id
          ? ownerNameById.get(p.owner_staff_id) ?? null
          : null,
        metrics: {
          taskTotal: tasks.total,
          taskDone: tasks.done,
          budgetPlanned: budget.planned,
          budgetActual: budget.actual,
          openRiskCount: riskAgg.get(p.id) ?? 0,
          lastActivityAt: lastActivity.get(p.id) ?? p.updated_at,
        },
      };
    });

    // 4) Institution summaries + heatmap matrix
    const { institutions, heatmap } = this.buildAggregates(portfolioProjects);

    return { projects: portfolioProjects, institutions, heatmap };
  }

  // ─── Sibling fetchers (chunked IN lists) ──────────────────────────────────

  private static async fetchTasks(
    supabase: SupabaseClient,
    projectIds: string[]
  ): Promise<
    Array<{ project_id: string; status_key: string | null; completed_at: string | null }>
  > {
    const { data, error } = await supabase
      .from('project_tasks')
      .select('project_id, status_key, completed_at')
      .in('project_id', projectIds);
    if (error) throw error;
    return (data ?? []) as Array<{
      project_id: string;
      status_key: string | null;
      completed_at: string | null;
    }>;
  }

  private static async fetchBudgets(
    supabase: SupabaseClient,
    projectIds: string[]
  ): Promise<
    Array<{
      project_id: string;
      planned_amount_inr: number | null;
      actual_amount_inr: number | null;
    }>
  > {
    const { data, error } = await supabase
      .from('project_budget')
      .select('project_id, planned_amount_inr, actual_amount_inr')
      .in('project_id', projectIds);
    if (error) throw error;
    return (data ?? []) as Array<{
      project_id: string;
      planned_amount_inr: number | null;
      actual_amount_inr: number | null;
    }>;
  }

  private static async fetchRisks(
    supabase: SupabaseClient,
    projectIds: string[]
  ): Promise<Array<{ project_id: string; status_key: string | null }>> {
    const { data, error } = await supabase
      .from('project_risks')
      .select('project_id, status_key')
      .in('project_id', projectIds);
    if (error) throw error;
    return (data ?? []) as Array<{ project_id: string; status_key: string | null }>;
  }

  private static async fetchLastActivity(
    supabase: SupabaseClient,
    projectIds: string[]
  ): Promise<Array<{ project_id: string; created_at: string }>> {
    const { data, error } = await supabase
      .from('project_activity_feed')
      .select('project_id, created_at')
      .in('project_id', projectIds)
      .order('created_at', { ascending: false });
    // Activity feed is non-critical; degrade gracefully rather than fail the page.
    if (error) return [];
    return (data ?? []) as Array<{ project_id: string; created_at: string }>;
  }

  private static async fetchInstitutions(
    supabase: SupabaseClient,
    projects: ProjectWithRelations[]
  ): Promise<Array<{ id: string; name: string }>> {
    const ids = Array.from(
      new Set(
        projects.map((p) => p.institution_id).filter((id): id is string => !!id)
      )
    );
    if (ids.length === 0) return [];
    const { data, error } = await supabase
      .from('institutions')
      .select('id, name')
      .in('id', ids);
    if (error) throw error;
    return (data ?? []) as Array<{ id: string; name: string }>;
  }

  private static async fetchOwners(
    supabase: SupabaseClient,
    projects: ProjectWithRelations[]
  ): Promise<Array<{ id: string; name: string }>> {
    const ids = Array.from(
      new Set(
        projects.map((p) => p.owner_staff_id).filter((id): id is string => !!id)
      )
    );
    if (ids.length === 0) return [];
    const { data, error } = await supabase
      .from('staff')
      .select('id, first_name, last_name')
      .in('id', ids);
    // Owner name is cosmetic; degrade to empty on error.
    if (error) return [];
    return (
      (data ?? []) as Array<{
        id: string;
        first_name: string | null;
        last_name: string | null;
      }>
    ).map((s) => ({
      id: s.id,
      name: [s.first_name, s.last_name].filter(Boolean).join(' ').trim() || 'Unknown',
    }));
  }

  // ─── In-memory aggregation ────────────────────────────────────────────────

  private static buildAggregates(projects: PortfolioProject[]): {
    institutions: InstitutionSummary[];
    heatmap: HeatmapCell[];
  } {
    const summaryById = new Map<string, InstitutionSummary>();
    const cellKey = (inst: string, bucket: string) => `${inst}::${bucket}`;
    const cellCounts = new Map<string, number>();

    const UNASSIGNED = '__unassigned__';

    for (const p of projects) {
      const instId = p.institution_id ?? UNASSIGNED;
      const instName =
        p.institutionName ?? (p.institution_id ? 'Unknown institution' : 'Unassigned');

      const summary: InstitutionSummary =
        summaryById.get(instId) ?? {
          institutionId: instId,
          institutionName: instName,
          projectCount: 0,
          atRiskCount: 0,
          redCount: 0,
        };

      summary.projectCount += 1;
      if (p.rag_status === 'amber' || p.rag_status === 'red') summary.atRiskCount += 1;
      if (p.rag_status === 'red') summary.redCount += 1;
      summaryById.set(instId, summary);

      const bucket = bucketForProject(p);
      const key = cellKey(instId, bucket);
      cellCounts.set(key, (cellCounts.get(key) ?? 0) + 1);
    }

    const institutions = Array.from(summaryById.values()).sort((a, b) =>
      a.institutionName.localeCompare(b.institutionName)
    );

    const heatmap: HeatmapCell[] = [];
    for (const inst of institutions) {
      for (const bucket of STATUS_BUCKETS) {
        heatmap.push({
          institutionId: inst.institutionId,
          bucket,
          count: cellCounts.get(cellKey(inst.institutionId, bucket)) ?? 0,
        });
      }
    }

    return { institutions, heatmap };
  }
}
