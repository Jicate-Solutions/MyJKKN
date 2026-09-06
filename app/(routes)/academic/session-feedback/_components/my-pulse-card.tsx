'use client';

// =====================================================================
// My Pulse — your work, evidenced
// =====================================================================
// Phase 1 of the work-signals spine: this surface now reads the CANONICAL
// engine (fn_work_signals_for) via the shared <WorkSignalsCard>, instead of
// its own fn_scf_my_pulse. My Pulse and the dashboard now render the SAME
// component off the SAME engine — the numbers can no longer disagree.
//
// Kept as a thin named-export wrapper so faculty/page.tsx's import is
// untouched. The old fn_scf_my_pulse RPC + SessionFeedbackService.getMyPulse
// are now unused by any surface; they are retired in a follow-up once prod
// confirms zero external callers (strangler pattern — never drop a live RPC in
// the same change that repoints its consumer).

import { WorkSignalsCard } from '@/components/work-signals/work-signals-card';

export function MyPulseCard() {
  return <WorkSignalsCard />;
}
