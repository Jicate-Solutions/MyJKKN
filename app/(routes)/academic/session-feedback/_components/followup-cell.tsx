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
  const improved = lift != null && lift > 0;
  const worse = lift != null && lift < 0;
  const liftColor = improved
    ? 'text-green-600'
    : worse
      ? 'text-red-600'
      : 'text-muted-foreground';
  const LiftArrow = improved ? ArrowUp : worse ? ArrowDown : Minus;
  const liftLabel = improved ? 'improved' : worse ? 'worse' : 'no change';

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
        {lift != null ? (lift > 0 ? '+' : '') + lift.toFixed(2) : '—'}
        <span className="font-normal">{liftLabel}</span>
      </span>
      <span className="text-[11px] text-muted-foreground">
        next on {row.next_attendance_date}
      </span>
    </div>
  );
}
