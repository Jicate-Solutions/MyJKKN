'use client';

/**
 * Gantt row (Decisions F2.2 task bar, F2.5 critical highlight, F2.6 drag-to-move)
 *
 * One task = one row: a left label cell + a bar positioned on the time axis.
 * The bar is draggable horizontally; on drop the row reports a whole-day shift
 * to the parent, which persists via useUpdateTask and cascades dependents.
 *
 * Resize handles and full dependency-line rendering are intentionally out of
 * scope for V1 (documented TODO in gantt-chart.tsx). Drag-to-move is implemented
 * with optimistic local offset so the bar tracks the cursor immediately.
 */

import { useRef, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ProjectTask } from '@/types/projects';
import {
  barGeometry,
  pxDeltaToDays,
  ROW_HEIGHT,
  type TimelineRange,
  type TimelineZoom,
} from './timeline-scale';

interface GanttRowProps {
  task: ProjectTask;
  range: TimelineRange;
  zoom: TimelineZoom;
  isCritical: boolean;
  /** Disable drag (e.g. while a previous move is still saving). */
  dragDisabled?: boolean;
  /** Report a whole-day shift of this task's dates after a drag-drop. */
  onMoveDays: (taskId: string, deltaDays: number) => void;
}

export function GanttRow({
  task,
  range,
  zoom,
  isCritical,
  dragDisabled,
  onMoveDays,
}: GanttRowProps) {
  const geom = barGeometry(task.start_date, task.due_date, range, zoom);
  const [dragOffsetPx, setDragOffsetPx] = useState(0);
  const dragStartXRef = useRef<number | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (dragDisabled || !geom) return;
      // Only the primary (left) button initiates a drag.
      if (e.button !== 0) return;
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragStartXRef.current = e.clientX;
    },
    [dragDisabled, geom]
  );

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartXRef.current === null) return;
    setDragOffsetPx(e.clientX - dragStartXRef.current);
  }, []);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (dragStartXRef.current === null) return;
      const deltaPx = e.clientX - dragStartXRef.current;
      dragStartXRef.current = null;
      setDragOffsetPx(0);
      const deltaDays = pxDeltaToDays(deltaPx, zoom);
      if (deltaDays !== 0) onMoveDays(task.id, deltaDays);
    },
    [zoom, task.id, onMoveDays]
  );

  const undated = !geom;

  return (
    <div
      className="relative border-b border-border/60"
      style={{ height: ROW_HEIGHT }}
    >
      {undated ? (
        <div className="absolute inset-y-0 left-2 flex items-center text-xs italic text-muted-foreground">
          no dates set
        </div>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              role="button"
              tabIndex={0}
              aria-label={`${task.title} bar — drag to move dates`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              className={cn(
                'absolute top-1/2 flex items-center rounded px-2 text-xs font-medium text-white shadow-sm',
                'cursor-grab touch-none select-none active:cursor-grabbing',
                isCritical
                  ? 'bg-red-500 ring-1 ring-red-700'
                  : task.is_blocked
                    ? 'bg-amber-500'
                    : 'bg-sky-500',
                dragDisabled && 'cursor-not-allowed opacity-70'
              )}
              style={{
                left: geom.x + dragOffsetPx,
                width: geom.width,
                height: ROW_HEIGHT - 12,
                transform: 'translateY(-50%)',
              }}
            >
              <span className="truncate">{task.title}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="space-y-0.5 text-xs">
              <div className="font-medium">{task.title}</div>
              <div className="text-muted-foreground">
                {task.start_date ?? '—'} → {task.due_date ?? '—'}
              </div>
              {isCritical && <div className="text-red-400">On critical path</div>}
            </div>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
