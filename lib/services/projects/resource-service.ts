/**
 * Resource & Capacity Service — F5
 *
 * Aggregates project_members with their allocated capacity and the sum of
 * estimated_hours from project_tasks where owner_staff_id = member.staff_id.
 * Optionally enriches with hr_faculty_workload for broader context (graceful
 * skip on error / missing data — project data is the primary source).
 *
 * Pattern: static class, SupabaseClient first arg (matches RiskService).
 * Errors are thrown, not swallowed.
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F5.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProjectMember, ProjectTask } from '@/types/projects';

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface MemberCapacity {
  member: ProjectMember;
  /** Sum of estimated_hours for tasks owned by this member in this project */
  assignedHours: number;
  /** Count of tasks owned by this member */
  taskCount: number;
  /**
   * Weekly hours from hr_faculty_workload (contact + admin + research).
   * null means the cross-module fetch was skipped or returned no row.
   */
  facultyWeeklyHours: number | null;
  /** True when assignedHours > capacity implied by allocation_percentage (>100% of 40h std week) */
  isOverAllocated: boolean;
}

/** Capacity limit in hours assumed for 100% allocation (standard 40h week, 5-day). */
export const FULL_WEEK_HOURS = 40;

/** Derive allocated hours from allocation_percentage (null → treat as 100%) */
export function allocationToHours(pct: number | null): number {
  return ((pct ?? 100) / 100) * FULL_WEEK_HOURS;
}

// ─── Service ──────────────────────────────────────────────────────────────────────

export class ResourceService {
  /**
   * Fetch all project_members for a project, then aggregate task hours per
   * member. Optionally fetches the latest hr_faculty_workload row per staff_id
   * for cross-module context (single query, failure is non-fatal).
   */
  static async listMemberCapacity(
    supabase: SupabaseClient,
    projectId: string
  ): Promise<MemberCapacity[]> {
    // 1. Members for this project
    const { data: members, error: membersError } = await supabase
      .from('project_members')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (membersError) throw membersError;
    if (!members || members.length === 0) return [];

    const typedMembers = members as ProjectMember[];

    // 2. Tasks for this project that have an owner — select only needed cols
    const { data: tasks, error: tasksError } = await supabase
      .from('project_tasks')
      .select('id, owner_staff_id, estimated_hours, status_key')
      .eq('project_id', projectId)
      .not('owner_staff_id', 'is', null);

    if (tasksError) throw tasksError;
    const typedTasks = (tasks ?? []) as Pick<
      ProjectTask,
      'id' | 'owner_staff_id' | 'estimated_hours' | 'status_key'
    >[];

    // 3. Build per-staff aggregates
    const taskMap = new Map<string, { hours: number; count: number }>();
    for (const task of typedTasks) {
      if (!task.owner_staff_id) continue;
      const existing = taskMap.get(task.owner_staff_id) ?? { hours: 0, count: 0 };
      existing.hours += task.estimated_hours ?? 0;
      existing.count += 1;
      taskMap.set(task.owner_staff_id, existing);
    }

    // 4. Try to fetch hr_faculty_workload (cross-module, graceful skip on error)
    const staffIds = typedMembers.map((m) => m.staff_id);
    let workloadMap = new Map<string, number>();
    try {
      const { data: workloads, error: workloadError } = await supabase
        .from('hr_faculty_workload')
        .select('staff_id, weekly_contact_hours, weekly_admin_hours, weekly_research_hours')
        .in('staff_id', staffIds)
        .order('created_at', { ascending: false });

      if (!workloadError && workloads) {
        // Take first (most recent) row per staff_id since we ordered DESC
        for (const row of workloads as {
          staff_id: string;
          weekly_contact_hours: number | null;
          weekly_admin_hours: number | null;
          weekly_research_hours: number | null;
        }[]) {
          if (!workloadMap.has(row.staff_id)) {
            const total =
              (row.weekly_contact_hours ?? 0) +
              (row.weekly_admin_hours ?? 0) +
              (row.weekly_research_hours ?? 0);
            workloadMap.set(row.staff_id, total);
          }
        }
      }
      // If workloadError: silently skip — project data is enough
    } catch {
      // Cross-module read failed — non-fatal, continue with project data only
      workloadMap = new Map();
    }

    // 5. Compose result
    return typedMembers.map((member) => {
      const agg = taskMap.get(member.staff_id) ?? { hours: 0, count: 0 };
      const capacityHours = allocationToHours(member.allocation_percentage);
      return {
        member,
        assignedHours: agg.hours,
        taskCount: agg.count,
        facultyWeeklyHours: workloadMap.get(member.staff_id) ?? null,
        isOverAllocated: agg.hours > capacityHours,
      };
    });
  }
}
