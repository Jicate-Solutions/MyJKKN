'use client';

/**
 * TimelineView (Feature F2) — project-scoped wrapper that fetches the timeline
 * data layer and renders the Gantt. Reusable: the per-project route renders it,
 * and the `/projects` shell Timeline tab can render it once a project is picked.
 *
 * Tasks come from the existing useTasks hook (data layer on main); phases /
 * milestones / dependencies come from the additive use-timeline hooks.
 */

import { useTasks } from '@/hooks/projects/use-tasks';
import {
  useProjectPhases,
  useProjectMilestones,
  useTaskDependencies,
} from '@/hooks/projects/use-timeline';
import { GanttChart } from './gantt-chart';

interface TimelineViewProps {
  projectId: string;
}

export function TimelineView({ projectId }: TimelineViewProps) {
  const tasksQ = useTasks(projectId);
  const phasesQ = useProjectPhases(projectId);
  const milestonesQ = useProjectMilestones(projectId);
  const depsQ = useTaskDependencies(projectId);

  const isLoading =
    tasksQ.isLoading ||
    phasesQ.isLoading ||
    milestonesQ.isLoading ||
    depsQ.isLoading;

  const error =
    tasksQ.error || phasesQ.error || milestonesQ.error || depsQ.error;

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Failed to load timeline: {(error as Error)?.message ?? 'unknown error'}
      </div>
    );
  }

  return (
    <GanttChart
      tasks={tasksQ.data ?? []}
      phases={phasesQ.data ?? []}
      milestones={milestonesQ.data ?? []}
      dependencies={depsQ.data ?? []}
      isLoading={isLoading}
    />
  );
}
