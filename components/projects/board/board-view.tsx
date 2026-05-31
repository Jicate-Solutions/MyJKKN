'use client';

/**
 * Kanban Board View (Feature F13)
 *
 * Columns = project statuses (ordered by order_index). Cards = tasks for one
 * project. Dragging a card to another column calls useUpdateTaskStatus with an
 * optimistic local update; reverts on error.
 *
 * Pattern: app/(routes)/solutions/pipeline/_components/pipeline-board.tsx
 * (DndContext + useSortable + DragOverlay).
 * Spec: specs/pm-projects-module-2026-05-26.md (F13).
 */

import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Skeleton } from '@/components/ui/skeleton';
import {
  useProjectPriorities,
  useProjectStatuses,
} from '@/hooks/projects/use-projects';
import { useTasks, useUpdateTaskStatus } from '@/hooks/projects/use-tasks';
import type { ProjectStatus, ProjectTask } from '@/types/projects';
import { BoardColumn } from './board-column';
import { TaskCard } from './task-card';

const DONE_CATEGORY = 'done';

interface BoardViewProps {
  projectId: string;
  onCardClick?: (taskId: string) => void;
}

export function BoardView({ projectId, onCardClick }: BoardViewProps) {
  const { data: statuses = [], isLoading: statusesLoading } = useProjectStatuses();
  const { data: priorities = [] } = useProjectPriorities();
  const {
    data: serverTasks = [],
    isLoading: tasksLoading,
    isError,
    error,
  } = useTasks(projectId);

  const updateStatus = useUpdateTaskStatus();

  // Local copy for optimistic moves; resynced whenever the server data changes.
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [activeTask, setActiveTask] = useState<ProjectTask | null>(null);

  useEffect(() => {
    setTasks(serverTasks);
  }, [serverTasks]);

  const orderedStatuses = useMemo(
    () => [...statuses].sort((a, b) => a.order_index - b.order_index),
    [statuses]
  );

  const prioritiesById = useMemo(() => {
    const m = new Map<string, { id: string; name: string; color: string | null }>();
    for (const p of priorities) m.set(p.id, { id: p.id, name: p.name, color: p.color });
    return m;
  }, [priorities]);

  const statusByKey = useMemo(() => {
    const m = new Map<string, ProjectStatus>();
    for (const s of orderedStatuses) m.set(s.key, s);
    return m;
  }, [orderedStatuses]);

  const tasksByStatusKey = useMemo(() => {
    const m = new Map<string, ProjectTask[]>();
    for (const s of orderedStatuses) m.set(s.key, []);
    for (const t of tasks) {
      const bucket = m.get(t.status_key);
      if (bucket) bucket.push(t);
      else {
        // Task carries a status_key not in the board — surface it in the first column.
        const first = orderedStatuses[0];
        if (first) m.get(first.key)?.push(t);
      }
    }
    return m;
  }, [tasks, orderedStatuses]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  function resolveTargetKey(overId: string): string | null {
    if (overId.startsWith('column:')) return overId.slice('column:'.length);
    // Dropped over another card — adopt that card's column.
    const overTask = tasks.find((t) => t.id === overId);
    return overTask ? overTask.status_key : null;
  }

  function handleDragStart(event: DragStartEvent) {
    const t = tasks.find((x) => x.id === event.active.id);
    if (t) setActiveTask(t);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;

    const taskId = active.id as string;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const targetKey = resolveTargetKey(over.id as string);
    if (!targetKey || targetKey === task.status_key) return;

    const targetStatus = statusByKey.get(targetKey);
    if (!targetStatus) return;

    const isComplete = targetStatus.category === DONE_CATEGORY;
    const previousKey = task.status_key;

    // Optimistic local move.
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, status_key: targetKey, completed_at: isComplete ? new Date().toISOString() : null }
          : t
      )
    );

    updateStatus.mutate(
      { id: taskId, statusKey: targetKey, isComplete },
      {
        onSuccess: () => {
          toast.success(`Moved to ${targetStatus.name}`);
        },
        onError: () => {
          // Revert.
          setTasks((prev) =>
            prev.map((t) => (t.id === taskId ? { ...t, status_key: previousKey } : t))
          );
          toast.error('Failed to move task');
        },
      }
    );
  }

  if (statusesLoading || tasksLoading) {
    return (
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-96 w-[280px] shrink-0" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="p-8 text-sm text-destructive">
        Failed to load tasks: {(error as Error)?.message ?? 'unknown error'}
      </p>
    );
  }

  if (orderedStatuses.length === 0) {
    return (
      <p className="p-8 text-sm text-muted-foreground">
        No board columns configured. Add project statuses in admin to use the board.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {updateStatus.isPending && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Saving…
        </div>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {orderedStatuses.map((status) => (
            <BoardColumn
              key={status.id}
              status={status}
              tasks={tasksByStatusKey.get(status.key) ?? []}
              prioritiesById={prioritiesById}
              onCardClick={onCardClick}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTask ? (
            <div className="w-[280px] rotate-2 opacity-90">
              <TaskCard
                task={activeTask}
                priority={
                  activeTask.priority_id
                    ? prioritiesById.get(activeTask.priority_id)
                    : undefined
                }
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
