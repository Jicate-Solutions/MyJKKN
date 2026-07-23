// app/(routes)/ai-pulse/rotation/[section_id]/_components/rotation-queue-panel.tsx
// Lane D (SOP §2) — read-only rotation queue for the Class Incharge.
//
// Shows who is "Up next" for the coming week's auto-drawn Pulse teams (the
// front of the section's fairness queue) plus each learner's turn count.
// Rendered by the rotation page ONLY after the incharge/section access check
// passes — same gating as SectionRoster.
//
// Data: useSectionRotationQueue → ai_pulse_rotation_state (+ policy-derived
// draw size). Defensive: renders an empty state when the queue isn't
// initialized yet (first draw happens on the configured generation day).

'use client';

import { ListOrdered, RotateCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useSectionRotationQueue } from '@/lib/services/ai-pulse/rotation-engine-service';

interface RotationQueuePanelProps {
  sectionId: string;
}

export function RotationQueuePanel({ sectionId }: RotationQueuePanelProps) {
  const { data, isLoading } = useSectionRotationQueue(sectionId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ListOrdered className="h-4 w-4" />
            Rotation queue
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.entries.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ListOrdered className="h-4 w-4" />
            Rotation queue
          </CardTitle>
          <CardDescription>
            Everyone gets a turn — once you present, you move to the back of
            the line.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            The queue hasn&apos;t been drawn yet. It fills automatically from
            the section roster on the next team draw.
          </p>
        </CardContent>
      </Card>
    );
  }

  const upNext = data.entries.slice(0, data.draw_size);
  const waiting = data.entries.length - upNext.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ListOrdered className="h-4 w-4" />
          Rotation queue
        </CardTitle>
        <CardDescription>
          Everyone gets a turn — once you present, you move to the back of the
          line. The next draw takes the top {data.draw_size} learner
          {data.draw_size === 1 ? '' : 's'} ({data.team_count} team
          {data.team_count === 1 ? '' : 's'} of up to {data.team_size}).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Up next
        </p>
        <ul className="divide-y rounded-md border">
          {upNext.map((entry, idx) => (
            <li
              key={entry.id}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-6 shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">
                  {idx + 1}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{entry.full_name}</p>
                  {entry.roll_number && (
                    <p className="truncate text-xs text-muted-foreground">
                      {entry.roll_number}
                    </p>
                  )}
                </div>
              </div>
              <Badge variant="secondary" className="shrink-0 gap-1">
                <RotateCw className="h-3 w-3" />
                {entry.times_participated} turn
                {entry.times_participated === 1 ? '' : 's'}
              </Badge>
            </li>
          ))}
        </ul>
        {waiting > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            +{waiting} more waiting behind them.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
