'use client';

/**
 * Kanban Board Column (Feature F13)
 *
 * One column per project status. Uses useDroppable so a card can be dropped on
 * an EMPTY column (the pipeline-board pattern only resolves over-card, which
 * can't target empty columns). Cards are sortable within the column.
 *
 * Spec: specs/pm-projects-module-2026-05-26.md (F13).
 */

import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ProjectPriority, ProjectStatus, ProjectTask } from '@/types/projects';
import { TaskCard } from './task-card';

function SortableTaskCard({
  task,
  priority,
  onClick,
}: {
  task: ProjectTask;
  priority?: Pick<ProjectPriority, 'id' | 'name' | 'color'>;
  onClick?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard task={task} priority={priority} onClick={onClick} />
    </div>
  );
}

interface BoardColumnProps {
  status: ProjectStatus;
  tasks: ProjectTask[];
  prioritiesById: Map<string, Pick<ProjectPriority, 'id' | 'name' | 'color'>>;
  onCardClick?: (taskId: string) => void;
}

export function BoardColumn({
  status,
  tasks,
  prioritiesById,
  onCardClick,
}: BoardColumnProps) {
  // Droppable keyed by the status KEY — task.status_key is set to this on drop.
  const { setNodeRef, isOver } = useDroppable({
    id: `column:${status.key}`,
    data: { statusKey: status.key },
  });

  return (
    <div className="flex w-[280px] min-w-[280px] shrink-0 flex-col">
      {/* Header */}
      <div
        className="flex items-center justify-between rounded-t-lg border px-3 py-2"
        style={status.color ? { borderColor: status.color } : undefined}
      >
        <div className="flex items-center gap-2">
          {status.color && (
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: status.color }}
            />
          )}
          <span className="text-sm font-semibold">{status.name}</span>
        </div>
        <Badge variant="outline" className="h-5 px-1.5 text-xs">
          {tasks.length}
        </Badge>
      </div>

      {/* Body (droppable) */}
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn(
            'min-h-[200px] max-h-[calc(100vh-340px)] flex-1 space-y-2 overflow-y-auto rounded-b-lg border border-t-0 bg-muted/30 p-2 transition-colors',
            isOver && 'bg-primary/10'
          )}
        >
          {tasks.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">
              Drop tasks here
            </div>
          ) : (
            tasks.map((task) => (
              <SortableTaskCard
                key={task.id}
                task={task}
                priority={task.priority_id ? prioritiesById.get(task.priority_id) : undefined}
                onClick={() => onCardClick?.(task.id)}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  );
}
