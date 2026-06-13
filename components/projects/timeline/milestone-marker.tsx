'use client';

/**
 * Milestone marker (Decision F2.3) — a zero-duration diamond on the Gantt.
 *
 * Rendered in a dedicated milestone lane above the task rows. A milestone with
 * an actual_date that differs from planned_date shows a ghost diamond at the
 * planned position (baseline comparison, F2.7) and a solid one at actual.
 */

import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ProjectMilestone } from '@/types/projects';
import { parseDateOnly, dateToX, type TimelineRange, type TimelineZoom } from './timeline-scale';

const DIAMOND = 14; // px edge-to-edge

interface MilestoneMarkerProps {
  milestone: ProjectMilestone;
  range: TimelineRange;
  zoom: TimelineZoom;
}

function Diamond({
  x,
  className,
  title,
}: {
  x: number;
  className: string;
  title: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={title}
          className={cn('absolute top-1/2', className)}
          style={{
            left: x - DIAMOND / 2,
            width: DIAMOND,
            height: DIAMOND,
            transform: 'translateY(-50%) rotate(45deg)',
          }}
        />
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  );
}

export function MilestoneMarker({ milestone, range, zoom }: MilestoneMarkerProps) {
  const planned = parseDateOnly(milestone.planned_date);
  const actual = parseDateOnly(milestone.actual_date);
  const anchor = actual ?? planned;
  if (!anchor) return null;

  const plannedX = planned ? dateToX(planned, range, zoom) : null;
  const actualX = actual ? dateToX(actual, range, zoom) : null;

  // Ghost planned diamond only when it differs from the actual position.
  const showGhost =
    plannedX !== null && actualX !== null && Math.abs(plannedX - actualX) > 1;

  const solidX = actualX ?? plannedX!;
  const solidLabel = milestone.is_complete
    ? `${milestone.name} (done${milestone.actual_date ? ` ${milestone.actual_date}` : ''})`
    : `${milestone.name}${milestone.planned_date ? ` (planned ${milestone.planned_date})` : ''}`;

  return (
    <>
      {showGhost && (
        <Diamond
          x={plannedX!}
          className="border border-dashed border-muted-foreground/60 bg-transparent"
          title={`${milestone.name} — planned ${milestone.planned_date}`}
        />
      )}
      <Diamond
        x={solidX}
        className={cn(
          'border shadow-sm',
          milestone.is_complete
            ? 'border-emerald-600 bg-emerald-500'
            : 'border-violet-600 bg-violet-500'
        )}
        title={solidLabel}
      />
    </>
  );
}
