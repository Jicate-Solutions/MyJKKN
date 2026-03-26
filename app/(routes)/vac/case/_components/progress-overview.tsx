'use client';

import { cn } from '@/lib/utils';
import { TrendingUp, Zap } from 'lucide-react';
import type { CaseLearnerProgress, CaseRiskCalculation } from '@/types/case';

interface ProgressOverviewProps {
  progress: CaseLearnerProgress;
  risk: CaseRiskCalculation | null;
  className?: string;
}

/** Draws an SVG arc for the semicircular progress ring */
function SemiCircleProgress({
  value,
  max,
  size = 160,
}: {
  value: number;
  max: number;
  size?: number;
}) {
  const pct = max === 0 ? 0 : Math.min(value / max, 1);
  const strokeWidth = 12;
  const r = (size - strokeWidth) / 2;
  // Semicircle: start at 180deg (left), sweep clockwise to 0deg (right)
  const cx = size / 2;
  const cy = size / 2 + 10; // shift down so arc is upper half
  const startAngle = Math.PI; // 180°
  const endAngle = 0; // 0°
  const totalArcLength = Math.PI * r; // half circumference
  const progressLength = pct * totalArcLength;

  // Convert angle+radius to x,y
  function polarToCartesian(angle: number) {
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  }

  const start = polarToCartesian(startAngle);
  const end = polarToCartesian(endAngle);

  const trackPath = `M ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${end.x} ${end.y}`;

  // Progress arc (from left to partially right)
  const progressEndAngle = startAngle - pct * Math.PI;
  const progressEnd = polarToCartesian(progressEndAngle);
  const largeArc = pct > 0.5 ? 1 : 0;
  const progressPath =
    pct === 0
      ? ''
      : `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${progressEnd.x} ${progressEnd.y}`;

  return (
    <svg
      width={size}
      height={size / 2 + 20}
      viewBox={`0 0 ${size} ${size / 2 + 20}`}
      aria-hidden="true"
      className="overflow-visible"
    >
      {/* Track (background arc) */}
      <path
        d={trackPath}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        className="text-muted/30"
      />
      {/* Progress arc */}
      {progressPath && (
        <path
          d={progressPath}
          fill="none"
          stroke="#0b6d41"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

export function ProgressOverview({ progress, risk, className }: ProgressOverviewProps) {
  const TOTAL_TRACKS = 6;
  const TOTAL_HOURS = 180;

  const tracksCompleted = progress.tracks_completed;
  const hoursCompleted = progress.total_hours_completed;
  const currentSemester = progress.current_semester;

  // Pace recommendation
  const tracksPerSemNeeded = risk?.tracks_per_semester_needed ?? 1;
  const semestersRemaining = risk?.semesters_remaining ?? null;
  const isOnTrack = tracksPerSemNeeded <= 1;
  const isCompleted = tracksCompleted >= TOTAL_TRACKS;

  const paceLabel = isCompleted
    ? 'All tracks complete'
    : isOnTrack
    ? '1 track per semester (on track)'
    : `${tracksPerSemNeeded} tracks/semester needed (accelerate)`;

  const paceColor = isCompleted
    ? 'text-[#0b6d41]'
    : isOnTrack
    ? 'text-green-700'
    : 'text-amber-700';

  const PaceIcon = isOnTrack || isCompleted ? TrendingUp : Zap;

  // Programme duration for semester display
  const programmeDuration = risk?.programme_duration_semesters ?? 8;

  return (
    <div
      className={cn(
        'flex flex-col items-center gap-4 rounded-xl border bg-card p-6 shadow-sm',
        className
      )}
      aria-label="Overall CASE progress"
    >
      {/* Semicircle */}
      <div className="relative flex flex-col items-center">
        <SemiCircleProgress value={tracksCompleted} max={TOTAL_TRACKS} size={160} />
        {/* Centered text below arc */}
        <div className="-mt-2 flex flex-col items-center">
          <span className="text-4xl font-bold text-foreground leading-none">
            {tracksCompleted}
            <span className="text-2xl text-muted-foreground font-medium">/{TOTAL_TRACKS}</span>
          </span>
          <span className="text-xs text-muted-foreground mt-1 uppercase tracking-wide font-medium">
            Tracks
          </span>
        </div>
      </div>

      {/* Hours */}
      <div className="text-center">
        <p className="text-sm text-muted-foreground">
          <span className="text-foreground font-semibold">{hoursCompleted}</span> of {TOTAL_HOURS}{' '}
          hours completed
        </p>
      </div>

      {/* Divider */}
      <div className="w-full border-t" />

      {/* Semester + Pace */}
      <div className="w-full space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Semester</span>
          <span className="font-medium text-foreground">
            {currentSemester}
            {semestersRemaining !== null ? (
              <span className="text-muted-foreground font-normal">
                {' '}
                of {programmeDuration}
              </span>
            ) : null}
          </span>
        </div>

        <div className="flex items-start justify-between gap-2">
          <span className="text-muted-foreground shrink-0">Pace</span>
          <span className={cn('flex items-center gap-1 font-medium text-right', paceColor)}>
            <PaceIcon className="h-3.5 w-3.5 shrink-0" />
            {paceLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
