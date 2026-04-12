'use client';

import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';

interface SF100PaidUserCounterProps {
  /** Total cumulative paid users logged */
  cumulative: number;
  /** Currently active (non-churned) paid users */
  active: number;
  /** Target to reach (100) */
  target: number;
  /** Enrollment ID for the log user link */
  enrollmentId?: string;
}

export function SF100PaidUserCounter({
  cumulative,
  active,
  target,
  enrollmentId,
}: SF100PaidUserCounterProps) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(cumulative / target, 1);
  const strokeDashoffset = circumference * (1 - progress);

  // Color transitions: red → amber → green as progress increases
  const progressColor =
    progress < 0.25
      ? '#ef4444'
      : progress < 0.5
        ? '#f59e0b'
        : progress < 0.75
          ? '#3b82f6'
          : '#22c55e';

  return (
    <div className="flex flex-col items-center gap-3">
      {/* SVG Progress Ring */}
      <div className="relative">
        <svg width="140" height="140" viewBox="0 0 140 140" aria-label={`${cumulative} of ${target} paid users`}>
          {/* Track ring */}
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="10"
            className="text-muted/30"
          />
          {/* Progress ring */}
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke={progressColor}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            transform="rotate(-90 70 70)"
            style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.4s ease' }}
          />
        </svg>

        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold tabular-nums leading-none">
            {cumulative}
          </span>
          <span className="text-xs text-muted-foreground font-medium mt-0.5">
            / {target}
          </span>
        </div>
      </div>

      {/* Labels */}
      <div className="text-center space-y-0.5">
        <p className="text-sm font-semibold">Paid Users</p>
        {active !== cumulative && (
          <p className="text-xs text-muted-foreground">
            ({active} active)
          </p>
        )}
      </div>

      {/* Log User CTA */}
      {enrollmentId && (
        <Button size="sm" asChild className="w-full max-w-[160px]">
          <Link href={`/startup-studio/solve-for-100/dashboard/log-user?enrollment=${enrollmentId}`}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Log User
          </Link>
        </Button>
      )}
    </div>
  );
}
