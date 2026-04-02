'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Lock, CheckCircle2, Circle, ArrowRight, BrainCircuit, Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CASETrack, CASETrackEnrollment } from '@/types/case';

interface TrackCardProps {
  track: CASETrack;
  enrollment?: CASETrackEnrollment;
  isLocked: boolean;
  prerequisiteTrackName?: string;
}

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  enrolled: {
    label: 'Enrolled',
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  },
  in_progress: {
    label: 'In Progress',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  },
  completed: {
    label: 'Completed',
    className: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  },
  incomplete: {
    label: 'Incomplete',
    className: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  },
  retry: {
    label: 'Retry',
    className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  },
};

function GateCheck({ passed, label }: { passed: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {passed ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <Circle className="h-3.5 w-3.5 text-muted-foreground/40" />
      )}
      <span className={cn('text-[11px]', passed ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground')}>
        {label}
      </span>
    </div>
  );
}

export function TrackCard({ track, enrollment, isLocked, prerequisiteTrackName }: TrackCardProps) {
  const isAI = track.track_type === 'ai_mastery';
  const hoursCompleted = enrollment
    ? Math.round((enrollment.attendance_percentage / 100) * track.duration_hours)
    : 0;
  const progressPct = track.duration_hours > 0
    ? Math.round((hoursCompleted / track.duration_hours) * 100)
    : 0;

  const status = enrollment?.status;
  const statusConfig = status ? STATUS_STYLES[status] : null;

  return (
    <Card
      className={cn(
        'transition-shadow hover:shadow-md',
        isLocked && 'opacity-60'
      )}
    >
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            {isLocked ? (
              <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : isAI ? (
              <BrainCircuit className="h-4 w-4 shrink-0 text-blue-500" />
            ) : (
              <Heart className="h-4 w-4 shrink-0 text-rose-500" />
            )}
            <div>
              <h4 className="text-sm font-semibold leading-tight">{track.track_name}</h4>
              <span className="text-[11px] text-muted-foreground">{track.track_code}</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="text-[10px]">
              {isAI ? 'AI' : 'Human'}
            </Badge>
            {statusConfig && (
              <Badge variant="secondary" className={cn('text-[10px]', statusConfig.className)}>
                {statusConfig.label}
              </Badge>
            )}
          </div>
        </div>

        {/* Locked state */}
        {isLocked && (
          <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2">
            <p className="text-xs text-muted-foreground">
              <Lock className="mr-1 inline h-3 w-3" />
              Complete <span className="font-medium text-foreground">{prerequisiteTrackName || 'prerequisite track'}</span> first
            </p>
          </div>
        )}

        {/* Progress */}
        {!isLocked && (
          <>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {hoursCompleted}h / {track.duration_hours}h
                </span>
                <span className="font-semibold tabular-nums">{progressPct}%</span>
              </div>
              <Progress
                value={progressPct}
                className={cn(
                  'h-2',
                  progressPct >= 80
                    ? '[&>div]:bg-green-500'
                    : progressPct >= 40
                      ? '[&>div]:bg-yellow-500'
                      : '[&>div]:bg-blue-500'
                )}
              />
            </div>

            {/* Triple Gate */}
            <div className="flex items-center gap-4">
              <GateCheck
                passed={enrollment?.completion_gate_attendance ?? false}
                label="Attendance"
              />
              <GateCheck
                passed={enrollment?.completion_gate_grader ?? false}
                label="Grader"
              />
              <GateCheck
                passed={enrollment?.completion_gate_project ?? false}
                label="Project"
              />
            </div>
          </>
        )}

        {/* Action */}
        {!isLocked && (
          <Button asChild size="sm" variant={enrollment ? 'outline' : 'default'} className="w-full text-xs">
            <Link href={`/vac/case/${track.id}`}>
              {enrollment?.status === 'in_progress'
                ? 'Continue'
                : enrollment?.status === 'completed'
                  ? 'Review'
                  : 'Start Track'}
              <ArrowRight className="ml-1.5 h-3 w-3" />
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
