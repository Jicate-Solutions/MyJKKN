'use client';

/**
 * Solutions Hub ↔ Projects bridge — projects delivered for a client.
 *
 * Reads the PM module's tables directly with the browser client (RLS-scoped),
 * NOT via /api/solutions: the projects module has no API layer, its pages use
 * ProjectService the same way. Flat queries joined in JS — no nested PostgREST
 * embeds through staff, which projects reaches by two different FKs
 * (owner_staff_id and project_members.staff_id).
 */

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface ClientProjectMember {
  staffId: string;
  name: string;
  role: string;
}

export interface ClientProjectSummary {
  id: string;
  code: string | null;
  title: string;
  ragStatus: string;
  percentComplete: number;
  dueDate: string | null;
  statusName: string | null;
  statusCategory: string | null;
  solutionId: string | null;
  ownerName: string | null;
  members: ClientProjectMember[];
  tasksTotal: number;
  tasksDone: number;
}

const PROJECT_COLUMNS =
  'id, code, title, rag_status, percent_complete, due_date, owner_staff_id, solution_id, status:project_statuses(name, category)';

async function fetchClientProjects(
  clientId: string,
  solutionIds: string[]
): Promise<ClientProjectSummary[]> {
  const supabase = createClientSupabaseClient();

  // A project can be linked to the client directly, or only to one of the
  // client's solutions — union both, deduped by id.
  const byClient = await supabase
    .from('projects')
    .select(PROJECT_COLUMNS)
    .eq('client_id', clientId)
    .is('cancelled_at', null);
  if (byClient.error) throw byClient.error;

  const rows: any[] = [...(byClient.data ?? [])];
  if (solutionIds.length > 0) {
    const bySolution = await supabase
      .from('projects')
      .select(PROJECT_COLUMNS)
      .in('solution_id', solutionIds)
      .is('cancelled_at', null);
    if (bySolution.error) throw bySolution.error;
    for (const r of bySolution.data ?? []) {
      if (!rows.some((x) => x.id === r.id)) rows.push(r);
    }
  }
  if (rows.length === 0) return [];

  const projectIds = rows.map((r) => r.id);

  // Team + task rollup. A viewer allowed to see the project but not its
  // members/tasks (RLS) still gets the project row — degrade, don't fail.
  const [membersRes, tasksRes] = await Promise.all([
    supabase
      .from('project_members')
      .select('project_id, staff_id, role')
      .in('project_id', projectIds),
    supabase
      .from('project_tasks')
      .select('id, project_id, completed_at')
      .in('project_id', projectIds),
  ]);
  const members = membersRes.error ? [] : membersRes.data ?? [];
  const tasks = tasksRes.error ? [] : tasksRes.data ?? [];

  const staffIds = new Set<string>();
  for (const r of rows) if (r.owner_staff_id) staffIds.add(r.owner_staff_id);
  for (const m of members) if (m.staff_id) staffIds.add(m.staff_id);

  const staffNameById = new Map<string, string>();
  if (staffIds.size > 0) {
    const staffRes = await supabase
      .from('staff')
      .select('id, first_name, last_name')
      .in('id', [...staffIds]);
    if (!staffRes.error) {
      for (const s of staffRes.data ?? []) {
        staffNameById.set(
          s.id,
          [s.first_name, s.last_name].filter(Boolean).join(' ') || 'Unnamed'
        );
      }
    }
  }

  return rows.map((r) => {
    const projectMembers: ClientProjectMember[] = members
      .filter((m) => m.project_id === r.id)
      .map((m) => ({
        staffId: m.staff_id,
        name: staffNameById.get(m.staff_id) ?? 'Unknown',
        role: m.role ?? 'member',
      }));
    const projectTasks = tasks.filter((t) => t.project_id === r.id);
    return {
      id: r.id,
      code: r.code ?? null,
      title: r.title,
      ragStatus: r.rag_status ?? 'green',
      percentComplete: r.percent_complete ?? 0,
      dueDate: r.due_date ?? null,
      statusName: r.status?.name ?? null,
      statusCategory: r.status?.category ?? null,
      solutionId: r.solution_id ?? null,
      ownerName: r.owner_staff_id
        ? staffNameById.get(r.owner_staff_id) ?? null
        : null,
      members: projectMembers,
      tasksTotal: projectTasks.length,
      tasksDone: projectTasks.filter((t) => !!t.completed_at).length,
    };
  });
}

export function useClientProjects(clientId: string, solutionIds: string[]) {
  return useQuery({
    queryKey: [
      'solutions',
      'client-projects',
      clientId,
      [...solutionIds].sort().join(','),
    ],
    queryFn: () => fetchClientProjects(clientId, solutionIds),
    enabled: !!clientId,
    staleTime: 30_000,
  });
}
