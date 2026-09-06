'use client';

/**
 * Kanban Task Card (Feature F13)
 *
 * Compact card: title, priority dot, due date, blocked/overdue chips, owner avatar.
 * Pattern: components/solutions/pipeline/prospect-card.tsx (compact card shape).
 * Spec: specs/pm-projects-module-2026-05-26.md (F13).
 */

import { useState } from 'react';
import { AlertTriangle, CalendarDays, Lock, Users } from 'lucide-react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TAP_TARGET } from '@/app/(routes)/projects/_lib/tap-targets';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { ProjectPriority, ProjectTask } from '@/types/projects';
import { TaskRaciDialog } from './task-raci-dialog';

function initials(staffId: string | null): string {
  if (!staffId) return '?';
  return staffId.slice(0, 2).toUpperCase();
}

function formatDue(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

interface TaskCardProps {
  task: ProjectTask;
  priority?: Pick<ProjectPriority, 'id' | 'name' | 'color'>;
  onClick?: () => void;
  className?: string;
}

export function TaskCard({ task, priority, onClick, className }: TaskCardProps) {
  const due = formatDue(task.due_date);
  const [raciOpen, setRaciOpen] = useState(false);

  return (
    <Card
      onClick={onClick}
      className={cn(
        'cursor-pointer space-y-2 p-3 shadow-sm transition-shadow hover:shadow-md',
        className
      )}
    >
      <div className="flex items-start gap-2">
        {priority?.color && (
          <span
            className="mt-1 h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: priority.color }}
            title={priority.name}
          />
        )}
        <p className="text-sm font-medium leading-snug">{task.title}</p>
      </div>

      {(task.is_blocked || task.is_overdue) && (
        <div className="flex flex-wrap gap-1">
          {task.is_blocked && (
            <Badge variant="outline" className="gap-1 border-amber-200 bg-amber-50 text-amber-800">
              <Lock className="h-3 w-3" />
              Blocked
            </Badge>
          )}
          {task.is_overdue && (
            <Badge variant="outline" className="gap-1 border-red-200 bg-red-50 text-red-800">
              <AlertTriangle className="h-3 w-3" />
              Overdue
            </Badge>
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        {due ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarDays className="h-3 w-3" />
            {due}
          </span>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={`h-6 gap-1 px-1.5 text-[11px] text-muted-foreground hover:text-foreground ${TAP_TARGET}`}
            title="Assign RACI (Responsible / Accountable / Consulted / Informed)"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setRaciOpen(true);
            }}
          >
            <Users className="h-3 w-3" />
            RACI
          </Button>
          {task.owner_staff_id && (
            <Avatar className="h-6 w-6">
              <AvatarFallback className="text-[10px]">
                {initials(task.owner_staff_id)}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      </div>

      <TaskRaciDialog task={task} open={raciOpen} onOpenChange={setRaciOpen} />
    </Card>
  );
}
