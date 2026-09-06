/**
 * lib/solutions/digest.ts — shared Solutions Hub digest compute.
 *
 * One function, two consumers:
 *   - GET /api/solutions/digest (page API, caller's RLS client) — what a
 *     permission-holder sees at /solutions/digest.
 *   - /api/cron/solutions-director-digest (weekly cron, service-role client) —
 *     the Monday notification to the Director. Same numbers, same code, so the
 *     notification can never disagree with the page.
 *
 * Every section is computed independently and degrades to an empty section
 * with its error recorded — one broken table must not blank the whole digest
 * or fail the weekly notification. In particular sh_proposals is being built
 * in a PARALLEL lane and does not exist in this branch: its section reports
 * `available: false` until that lane ships, regardless of merge order.
 *
 * Bounded by design: a handful of aggregate reads over small tables (hundreds
 * of rows), never a per-client N+1 — the dispatcher aborts cron calls at 120s.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const QUIET_CLIENT_DAYS = 14;

/** Hard cap on rows pulled for client-side grouping — all these tables sit in the hundreds today. */
const ROW_CAP = 5000;

export interface DigestSectionError {
  section: string;
  error: string;
}

export interface QuietClient {
  clientId: string;
  clientName: string;
  /** Latest communication_date, or null when the client has none on record. */
  lastContactAt: string | null;
  /** Whole days since the last communication (null when none on record). */
  quietDays: number | null;
  /** Active client-linked project titles (first few). */
  projects: string[];
}

export interface ClientProjectRollup {
  projectId: string;
  code: string | null;
  title: string;
  clientId: string;
  clientName: string;
  percentComplete: number;
  ragStatus: string;
  statusCategory: string | null;
  tasksByStatus: Record<string, number>;
  taskCount: number;
  overdueMilestones: number;
}

export interface SolutionsDigest {
  generatedAt: string;
  /** sh_prospects (is_active) counted per pipeline_stage. */
  pipelineByStage: Record<string, number>;
  prospectCount: number;
  /** sh_proposals per status — the table ships from a parallel lane; `available` is false until it exists. */
  proposals: { available: boolean; byStatus: Record<string, number>; count: number };
  /** Active clients with an active client-linked project and no communication in QUIET_CLIENT_DAYS. */
  quietClients: QuietClient[];
  /** Client-linked projects with task + overdue-milestone rollups. */
  clientProjects: ClientProjectRollup[];
  /** sh_payments amounts summed per status. */
  paymentsByStatus: Record<string, { count: number; amount: number }>;
  /** sh_client_communications logged in the trailing 7 days. */
  commsLast7d: number;
  /** Sections that failed and were degraded to empty (never thrown). */
  errors: DigestSectionError[];
}

/** Run one section; on ANY failure degrade to the fallback and record why. */
async function section<T>(
  errors: DigestSectionError[],
  name: string,
  fallback: T,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    errors.push({ section: name, error: e instanceof Error ? e.message : String(e) });
    return fallback;
  }
}

function tally(rows: Array<Record<string, unknown>>, key: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const k = String(row[key] ?? 'unknown');
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/** Project status categories that mean delivery is over (excluded from "active"). */
const CONCLUDED = new Set(['done', 'cancelled', 'archived']);

export async function computeSolutionsDigest(db: SupabaseClient): Promise<SolutionsDigest> {
  const errors: DigestSectionError[] = [];
  const now = Date.now();

  // -- Pipeline: active prospects per stage -------------------------------
  const pipeline = await section(errors, 'pipeline', { byStage: {} as Record<string, number>, count: 0 }, async () => {
    const { data, error } = await db
      .from('sh_prospects')
      .select('pipeline_stage')
      .eq('is_active', true)
      .limit(ROW_CAP);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    return { byStage: tally(rows, 'pipeline_stage'), count: rows.length };
  });

  // -- Proposals: table lives in a parallel lane — degrade, never fail ----
  const proposals = await section(
    errors,
    'proposals',
    { available: false, byStatus: {} as Record<string, number>, count: 0 },
    async () => {
      const { data, error } = await db.from('sh_proposals').select('status').limit(ROW_CAP);
      if (error) {
        // relation-does-not-exist (or any read failure) → honest "not yet available",
        // NOT an error: this branch intentionally predates the sh_proposals lane.
        return { available: false, byStatus: {}, count: 0 };
      }
      const rows = data ?? [];
      return { available: true, byStatus: tally(rows, 'status'), count: rows.length };
    },
  );

  // -- Client-linked projects (the Solutions↔Projects bridge) -------------
  interface ProjectRow {
    id: string;
    code: string | null;
    title: string;
    client_id: string;
    percent_complete: number | null;
    rag_status: string | null;
    project_statuses: { category: string | null } | null;
    sh_clients: { id: string; name: string; is_active: boolean | null } | null;
  }
  const projects = await section(errors, 'clientProjects', [] as ProjectRow[], async () => {
    const { data, error } = await db
      .from('projects')
      .select(
        'id, code, title, client_id, percent_complete, rag_status, project_statuses:status_id(category), sh_clients:client_id(id, name, is_active)',
      )
      .not('client_id', 'is', null)
      .limit(ROW_CAP);
    if (error) throw new Error(error.message);
    // PostgREST single-FK embeds are objects; generated generics may claim arrays.
    return (data ?? []) as unknown as ProjectRow[];
  });

  const activeProjects = projects.filter(
    (p) => !CONCLUDED.has(p.project_statuses?.category ?? ''),
  );
  const projectIds = activeProjects.map((p) => p.id);

  // -- Task rollup per project (status_key is a per-project workflow key) --
  const taskRows = await section(errors, 'tasks', [] as Array<{ project_id: string; status_key: string }>, async () => {
    if (projectIds.length === 0) return [];
    const { data, error } = await db
      .from('project_tasks')
      .select('project_id, status_key')
      .in('project_id', projectIds)
      .limit(ROW_CAP);
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{ project_id: string; status_key: string }>;
  });

  // -- Overdue milestones: planned_date past, not complete ----------------
  const overdueRows = await section(errors, 'milestones', [] as Array<{ project_id: string }>, async () => {
    if (projectIds.length === 0) return [];
    const today = new Date(now + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10); // IST calendar day
    const { data, error } = await db
      .from('project_milestones')
      .select('project_id')
      .in('project_id', projectIds)
      .eq('is_complete', false)
      .lt('planned_date', today)
      .limit(ROW_CAP);
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{ project_id: string }>;
  });

  const tasksByProject = new Map<string, Record<string, number>>();
  for (const t of taskRows) {
    const bucket = tasksByProject.get(t.project_id) ?? {};
    const k = t.status_key || 'unknown';
    bucket[k] = (bucket[k] ?? 0) + 1;
    tasksByProject.set(t.project_id, bucket);
  }
  const overdueByProject = new Map<string, number>();
  for (const m of overdueRows) {
    overdueByProject.set(m.project_id, (overdueByProject.get(m.project_id) ?? 0) + 1);
  }

  const clientProjects: ClientProjectRollup[] = activeProjects.map((p) => {
    const tasksByStatus = tasksByProject.get(p.id) ?? {};
    return {
      projectId: p.id,
      code: p.code,
      title: p.title,
      clientId: p.client_id,
      clientName: p.sh_clients?.name ?? 'Unknown client',
      percentComplete: Number(p.percent_complete ?? 0),
      ragStatus: p.rag_status ?? 'green',
      statusCategory: p.project_statuses?.category ?? null,
      tasksByStatus,
      taskCount: Object.values(tasksByStatus).reduce((a, b) => a + b, 0),
      overdueMilestones: overdueByProject.get(p.id) ?? 0,
    };
  });

  // -- Quiet clients: active, with active delivery, silent > 14 days ------
  const quietClients = await section(errors, 'quietClients', [] as QuietClient[], async () => {
    const byClient = new Map<string, { name: string; projects: string[] }>();
    for (const p of activeProjects) {
      if (p.sh_clients?.is_active === false) continue; // inactive client → no nudge-worthy silence
      const entry = byClient.get(p.client_id) ?? { name: p.sh_clients?.name ?? 'Unknown client', projects: [] };
      if (entry.projects.length < 3) entry.projects.push(p.title);
      byClient.set(p.client_id, entry);
    }
    const clientIds = [...byClient.keys()];
    if (clientIds.length === 0) return [];

    const { data, error } = await db
      .from('sh_client_communications')
      .select('client_id, communication_date')
      .in('client_id', clientIds)
      .order('communication_date', { ascending: false })
      .limit(ROW_CAP);
    if (error) throw new Error(error.message);

    const latest = new Map<string, string>();
    for (const c of (data ?? []) as Array<{ client_id: string; communication_date: string | null }>) {
      if (c.communication_date && !latest.has(c.client_id)) latest.set(c.client_id, c.communication_date);
    }

    const out: QuietClient[] = [];
    for (const [clientId, info] of byClient) {
      const last = latest.get(clientId) ?? null;
      const quietDays = last ? Math.floor((now - new Date(last).getTime()) / 86_400_000) : null;
      // No communication on record counts as quiet (quietDays null → surfaced,
      // the CRON applies its own backlog floor before nudging anyone).
      if (quietDays === null || quietDays > QUIET_CLIENT_DAYS) {
        out.push({ clientId, clientName: info.name, lastContactAt: last, quietDays, projects: info.projects });
      }
    }
    out.sort((a, b) => (b.quietDays ?? Number.MAX_SAFE_INTEGER) - (a.quietDays ?? Number.MAX_SAFE_INTEGER));
    return out;
  });

  // -- Payments totals per status -----------------------------------------
  const paymentsByStatus = await section(errors, 'payments', {} as Record<string, { count: number; amount: number }>, async () => {
    const { data, error } = await db.from('sh_payments').select('status, amount').limit(ROW_CAP);
    if (error) throw new Error(error.message);
    const out: Record<string, { count: number; amount: number }> = {};
    for (const row of (data ?? []) as Array<{ status: string | null; amount: number | string | null }>) {
      const k = row.status ?? 'unknown';
      const bucket = (out[k] = out[k] ?? { count: 0, amount: 0 });
      bucket.count += 1;
      bucket.amount += Number(row.amount ?? 0);
    }
    return out;
  });

  // -- Communications in the trailing 7 days ------------------------------
  const commsLast7d = await section(errors, 'comms7d', 0, async () => {
    const since = new Date(now - 7 * 86_400_000).toISOString();
    const { count, error } = await db
      .from('sh_client_communications')
      .select('id', { count: 'exact', head: true })
      .gte('communication_date', since);
    if (error) throw new Error(error.message);
    return count ?? 0;
  });

  return {
    generatedAt: new Date(now).toISOString(),
    pipelineByStage: pipeline.byStage,
    prospectCount: pipeline.count,
    proposals,
    quietClients,
    clientProjects,
    paymentsByStatus,
    commsLast7d,
    errors,
  };
}
