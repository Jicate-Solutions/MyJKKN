'use client';

// Shared follow-up indicator for the session-feedback "lift" (did understanding
// improve in the next same-faculty+course session?). Used by:
//   - principal/page.tsx  (institution-wide escalations)
//   - faculty/page.tsx    ("topics to revisit" — the teacher's own low sessions)
// Both consume the identical EscalationFollowupRow / FacultyFollowupRow contract.

import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import type { EscalationFollowupRow } from '@/types/session-feedback';

/** Follow-up indicator: next-session understanding + a lift arrow. */
export function FollowupCell({ row }: { row: EscalationFollowupRow }) {
  // No later session of this class has feedback yet — read as intentional.
  if (row.next_attendance_date == null || row.next_avg_understood == null) {
    return (
      <div className="flex flex-col items-end gap-0.5">
        <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          <Minus className="h-3.5 w-3.5" aria-hidden />
          No next session yet
        </span>
        <span className="text-[11px] text-muted-foreground">
          awaiting follow-up class
        </span>
      </div>
    );
  }

  const lift = row.lift; // next_avg - escalated_avg
  // Noise band: a lift this small is sampling noise on a tiny class, not a real
  // change in understanding — showing it as a number reads to the teacher like a
  // verdict on their teaching. Collapse |lift| < 0.5 into a neutral "about the
  // same" (no number); only show a signed one-decimal figure once it clears the band.
  const NOISE_BAND = 0.5;
  const meaningful = lift != null && Math.abs(lift) >= NOISE_BAND;
  const improved = meaningful && (lift as number) > 0;
  const worse = meaningful && (lift as number) < 0;
  const liftColor = improved
    ? 'text-green-600'
    : worse
      ? 'text-red-600'
      : 'text-muted-foreground';
  const LiftArrow = improved ? ArrowUp : worse ? ArrowDown : Minus;
  const liftLabel = improved ? 'improved' : worse ? 'worse' : 'about the same';

  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="text-sm font-semibold tabular-nums text-foreground">
        {row.next_avg_understood.toFixed(2)}
        <span className="ml-1 text-[11px] font-normal text-muted-foreground">
          ({row.next_responses ?? 0} resp.)
        </span>
      </span>
      <span className={`flex items-center gap-1 text-xs font-medium ${liftColor}`}>
        <LiftArrow className="h-3.5 w-3.5" aria-hidden />
        {meaningful ? (
          <>
            {((lift as number) > 0 ? '+' : '') + (lift as number).toFixed(1)}
            <span className="font-normal">{liftLabel}</span>
          </>
        ) : (
          <span className="font-normal">{liftLabel}</span>
        )}
      </span>
      <span className="text-[11px] text-muted-foreground">
        next on {row.next_attendance_date}
      </span>
    </div>
  );
}
