'use client';

/**
 * Task detail dialog — opened by clicking a card on the board.
 *
 * BoardView already exposed an onCardClick hook point that nothing supplied, so
 * cards were inert. This supplies it: a read-only summary of the task plus its
 * comment thread, which is the first UI able to reach project_task_comments.
 *
 * Editing stays where it already lives (RACI dialog, drag-to-change-status) —
 * this dialog deliberately does not duplicate it.
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { TaskComments } from '@/components/projects/board/task-comments';
import { useTask } from '@/hooks/projects/use-tasks';

interface TaskDetailDialogProps {
  taskId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function TaskDetailDialog({ taskId, open, onOpenChange }: TaskDetailDialogProps) {
  // enabled is driven by taskId; the query only runs while the dialog is mounted.
  const { data: task, isLoading } = useTask(open ? taskId : null);

  const due = formatDate(task?.due_date);
  const start = formatDate(task?.start_date);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="pr-6 text-base leading-snug">
            {isLoading ? 'Loading…' : task?.title ?? 'Task'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Task details and comment thread
          </DialogDescription>
        </DialogHeader>

        {task ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{task.status_key}</Badge>
              {start ? (
                <span className="text-xs text-muted-foreground">Starts {start}</span>
              ) : null}
              {due ? <span className="text-xs text-muted-foreground">Due {due}</span> : null}
            </div>

            {task.description ? (
              <p className="whitespace-pre-wrap text-sm text-foreground/90">
                {task.description}
              </p>
            ) : null}

            <Separator />
          </div>
        ) : null}

        {taskId ? <TaskComments taskId={taskId} /> : null}
      </DialogContent>
    </Dialog>
  );
}
