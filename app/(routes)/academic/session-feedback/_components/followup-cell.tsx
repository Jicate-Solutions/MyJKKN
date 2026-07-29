'use client';

// Shared follow-up indicator for the session-feedback "lift" (did understanding
// improve in the next same-faculty+course session?). Used by:
//   - principal/page.tsx  (institution-wide escalations)
//   - faculty/page.tsx    ("topics to revisit" — the teacher's own low sessions)
// Both consume the identical EscalationFollowupRow / FacultyFollowupRow contract.

import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import type { EscalationFollowupRow } from '@/types/session-feedback';
import { UnderstandingBand } from '@/components/session-feedback/understanding-band';

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
  // change in understanding. Below it → a neutral "about the same"; above it →
  // "improved" / "worse". NEVER a numeric delta — a signed lift figure still reads
  // to the teacher as a graded number (anti-gaming; same rule as the band itself).
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
      {/* <div>, not <span>: UnderstandingBand renders a <div> (Badge), and a span
          may not contain a div. Rendered as a flex item, span/div are identical. */}
      <div className="text-sm font-semibold tabular-nums text-foreground">
        <UnderstandingBand avg={row.next_avg_understood} />
        <span className="ml-1 text-[11px] font-normal text-muted-foreground">
          ({row.next_responses ?? 0} resp.)
        </span>
      </div>
      <span className={`flex items-center gap-1 text-xs font-medium ${liftColor}`}>
        <LiftArrow className="h-3.5 w-3.5" aria-hidden />
        <span className="font-normal">{liftLabel}</span>
      </span>
      <span className="text-[11px] text-muted-foreground">
        next on {row.next_attendance_date}
      </span>
    </div>
  );
}
