'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Lock,
  PlayCircle,
  PlusCircle,
} from 'lucide-react';
import type { CaseTrack, CaseTrackEnrollment } from '@/types/case';

// Derived status a track can be in from the Learner's perspective
export type TrackDisplayStatus = 'completed' | 'in_progress' | 'locked' | 'available';

interface Gate {
  label: string;
  met: boolean;
  value: string | null;
}

interface TrackCardProps {
  track: CaseTrack;
  enrollment: CaseTrackEnrollment | null;
  prerequisiteTrack: CaseTrack | null;
  displayStatus: TrackDisplayStatus;
  onEnroll?: (trackId: string) => void;
  isEnrolling?: boolean;
  className?: string;
}

const STATUS_CONFIG: Record<
  TrackDisplayStatus,
  { badge: string; badgeVariant: 'default' | 'secondary' | 'outline' | 'destructive'; label: string }
> = {
  completed: {
    badge: 'bg-[#0b6d41] text-white border-transparent',
    badgeVariant: 'default',
    label: 'Completed',
  },
  in_progress: {
    badge: 'bg-blue-100 text-blue-700 border-blue-200',
    badgeVariant: 'outline',
    label: 'In Progress',
  },
  available: {
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
    badgeVariant: 'outline',
    label: 'Available',
  },
  locked: {
    badge: 'bg-muted text-muted-foreground border-muted',
    badgeVariant: 'outline',
    label: 'Locked',
  },
};

function GateIndicator({ gate }: { gate: Gate }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{gate.label}</span>
      <span
        className={cn(
          'font-medium flex items-center gap-1',
          gate.met ? 'text-[#0b6d41]' : 'text-muted-foreground'
        )}
      >
        {gate.met ? (
          <CheckCircle2 className="h-3 w-3" />
        ) : (
          <AlertCircle className="h-3 w-3 text-muted-foreground/60" />
        )}
        {gate.value ?? '—'}
      </span>
    </div>
  );
}

function ActionButton({
  status,
  trackId,
  onEnroll,
  isEnrolling,
}: {
  status: TrackDisplayStatus;
  trackId: string;
  onEnroll?: (id: string) => void;
  isEnrolling?: boolean;
}) {
  if (status === 'completed') {
    return (
      <Button size="sm" variant="outline" className="w-full gap-2" disabled>
        <CheckCircle2 className="h-4 w-4 text-[#0b6d41]" />
        Completed
      </Button>
    );
  }

  if (status === 'in_progress') {
    return (
      <Button
        size="sm"
        className="w-full gap-2 bg-[#0b6d41] hover:bg-[#0b6d41]/90 text-white"
        onClick={() => onEnroll?.(trackId)}
      >
        <PlayCircle className="h-4 w-4" />
        Continue
        <ChevronRight className="h-4 w-4 ml-auto" />
      </Button>
    );
  }

  if (status === 'available') {
    return (
      <Button
        size="sm"
        variant="outline"
        className="w-full gap-2 border-[#0b6d41] text-[#0b6d41] hover:bg-[#0b6d41]/5"
        onClick={() => onEnroll?.(trackId)}
        disabled={isEnrolling}
      >
        <PlusCircle className="h-4 w-4" />
        {isEnrolling ? 'Enrolling…' : 'Enroll Now'}
      </Button>
    );
  }

  // locked
  return (
    <Button size="sm" variant="ghost" className="w-full gap-2 text-muted-foreground" disabled>
      <Lock className="h-4 w-4" />
      Locked
    </Button>
  );
}

export function TrackCard({
  track,
  enrollment,
  prerequisiteTrack,
  displayStatus,
  onEnroll,
  isEnrolling,
  className,
}: TrackCardProps) {
  const cfg = STATUS_CONFIG[displayStatus];

  // Build gate list from enrollment data (or empty if not enrolled)
  const attendanceThreshold = Math.round(track.completion_attendance_threshold * 100);
  const graderThreshold = Math.round(track.completion_grader_threshold * 100);

  const gates: Gate[] = [
    {
      label: `Attendance (≥${attendanceThreshold}%)`,
      met: enrollment?.completion_gate_attendance ?? false,
      value: enrollment ? `${Math.round(enrollment.attendance_percentage)}%` : null,
    },
    {
      label: `Grader Score (≥${graderThreshold}%)`,
      met: enrollment?.completion_gate_grader ?? false,
      value: enrollment ? `${Math.round(enrollment.grader_score_average)}%` : null,
    },
    ...(track.completion_project_required
      ? [
          {
            label: 'Project',
            met: enrollment?.completion_gate_project ?? false,
            value:
              enrollment?.project_submitted
                ? enrollment.project_score !== null
                  ? `${enrollment.project_score}/100`
                  : 'Submitted'
                : null,
          },
        ]
      : []),
  ];

  const isLocked = displayStatus === 'locked';
  const isCompleted = displayStatus === 'completed';

  return (
    <Card
      className={cn(
        'flex flex-col transition-shadow',
        isCompleted && 'border-[#0b6d41]/40 bg-[#0b6d41]/[0.02]',
        isLocked && 'opacity-60',
        !isLocked && !isCompleted && 'hover:shadow-md',
        className
      )}
      aria-label={`${track.track_name} — ${cfg.label}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          {/* Track code chip */}
          <span
            className={cn(
              'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-mono font-semibold border',
              track.track_type === 'ai_mastery'
                ? 'bg-violet-50 text-violet-700 border-violet-200'
                : 'bg-sky-50 text-sky-700 border-sky-200'
            )}
          >
            {track.track_code}
          </span>

          {/* Status badge */}
          <Badge className={cn('text-xs capitalize', cfg.badge)}>
            {isCompleted ? (
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                {cfg.label}
              </span>
            ) : isLocked ? (
              <span className="flex items-center gap-1">
                <Lock className="h-3 w-3" />
                {cfg.label}
              </span>
            ) : (
              cfg.label
            )}
          </Badge>
        </div>

        <CardTitle className="text-base leading-snug mt-2">{track.track_name}</CardTitle>

        {track.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{track.description}</p>
        )}

        <p className="text-xs text-muted-foreground mt-1">
          <span className="font-medium text-foreground">{track.duration_hours}h</span> •{' '}
          {track.track_type === 'ai_mastery' ? 'AI Mastery' : 'Human Excellence'}
        </p>
      </CardHeader>

      <CardContent className="flex flex-col flex-1 gap-4 pt-0">
        {/* Locked message */}
        {isLocked && prerequisiteTrack && (
          <div className="flex items-center gap-2 rounded-md bg-muted/50 border px-3 py-2 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            Complete <span className="font-semibold">{prerequisiteTrack.track_name}</span> first
          </div>
        )}

        {/* Gate indicators — shown when enrolled or completed */}
        {(displayStatus === 'in_progress' || displayStatus === 'completed') && (
          <div className="space-y-1.5 rounded-md border bg-muted/30 px-3 py-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Completion Gates
            </p>
            {gates.map((g) => (
              <GateIndicator key={g.label} gate={g} />
            ))}
          </div>
        )}

        {/* Spacer pushes button to bottom */}
        <div className="flex-1" />

        {/* Action button */}
        <ActionButton
          status={displayStatus}
          trackId={track.id}
          onEnroll={onEnroll}
          isEnrolling={isEnrolling}
        />
      </CardContent>
    </Card>
  );
}
