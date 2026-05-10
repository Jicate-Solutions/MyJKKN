'use client';

// ════════════════════════════════════════════════════════════════════════════
// Calls Tab
// Wraps the CallHistoryCard for the lead detail page Tabs UI. Extracted from
// page.tsx as part of the monolith reduction (PR-D / phase 1).
// Pure refactor — zero behavior change.
// ════════════════════════════════════════════════════════════════════════════

import { CallHistoryCard } from '../call-history-card';

interface CallsTabProps {
  leadId: string;
  institutionId: string;
}

export function CallsTab({ leadId, institutionId }: CallsTabProps) {
  return (
    <CallHistoryCard
      leadId={leadId}
      institutionId={institutionId}
    />
  );
}
