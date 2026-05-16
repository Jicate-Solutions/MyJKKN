'use client';

/**
 * HandoverBanner — surfaces the cascade-reassignment history for a lead.
 *
 * Per spec decisions #13 + #14:
 *   #13 — append-only notes timeline; previous counselor's notes immutable.
 *   #14 — off-duty counselor sees cascaded leads read-only; "Reassigned to <Y>" badge.
 *
 * Renders only when admission_lead_cascade_history has rows for this lead.
 * Empty-state → null (no banner rendered).
 *
 * Usage:
 *   <HandoverBanner leadId={lead.id} />
 *
 * Extends DataAlertBanner primitive from components/shared/data-alert-banner/.
 */

import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { GitBranch, Info } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useLeadCascadeHistory,
  type CascadeEntry,
} from '@/hooks/admission/use-lead-cascade-history';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Human-readable label for the reason code stored in the DB. */
function reasonLabel(reason: string): string {
  switch (reason) {
    case 'off_duty_60min':
      return 'Off-duty (60 min)';
    case 'queue_flush':
      return 'Queue flush';
    case 'manual_reassign':
      return 'Manual reassign';
    default:
      return reason.replace(/_/g, ' ');
  }
}

/** Badge variant colours keyed by reason code. */
function reasonBadgeClass(reason: string): string {
  switch (reason) {
    case 'off_duty_60min':
      return 'bg-amber-100 text-amber-800 border-amber-300';
    case 'queue_flush':
      return 'bg-purple-100 text-purple-800 border-purple-300';
    case 'manual_reassign':
      return 'bg-blue-100 text-blue-800 border-blue-300';
    default:
      return 'bg-gray-100 text-gray-700 border-gray-300';
  }
}

// ---------------------------------------------------------------------------
// Sub-component: single timeline row
// ---------------------------------------------------------------------------

function CascadeRow({ entry }: { entry: CascadeEntry }) {
  const from = entry.from_counselor_name ?? 'Unassigned';
  const to = entry.to_counselor_name ?? 'Unassigned';
  const when = new Date(entry.cascaded_at).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  return (
    <div className="flex items-start gap-3 py-2 border-b last:border-0 last:pb-0">
      {/* Timeline dot */}
      <div className="mt-1 flex-shrink-0 h-2 w-2 rounded-full bg-blue-400" />

      <div className="flex-1 min-w-0">
        <p className="text-sm text-blue-900 dark:text-blue-100">
          Lead reassigned from{' '}
          <span className="font-medium">{from}</span>
          {' '}to{' '}
          <span className="font-medium">{to}</span>
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-blue-700 dark:text-blue-300">{when}</span>
          <Badge
            variant="outline"
            className={`text-xs px-1.5 py-0 ${reasonBadgeClass(entry.reason)}`}
          >
            {reasonLabel(entry.reason)}
          </Badge>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface HandoverBannerProps {
  leadId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * HandoverBanner
 *
 * Mounts above the lead-detail content area.
 * Returns null when there is no cascade history (empty state).
 * Shows a stacked timeline of all reassignment events, most-recent first.
 */
export function HandoverBanner({ leadId }: HandoverBannerProps) {
  const { history, loading } = useLeadCascadeHistory(leadId);

  // Loading — show a slim skeleton so layout doesn't jump
  if (loading) {
    return (
      <div className="space-y-1">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-72" />
      </div>
    );
  }

  // Empty state — no cascade history for this lead, render nothing
  if (history.length === 0) return null;

  return (
    <Alert className="border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-200 [&>svg]:text-blue-600">
      <Info className="h-4 w-4" />
      <AlertTitle className="flex items-center gap-2">
        <GitBranch className="h-3.5 w-3.5" />
        Handover history ({history.length} reassignment{history.length !== 1 ? 's' : ''})
      </AlertTitle>
      <AlertDescription>
        <div className="mt-2 space-y-0">
          {history.map((entry) => (
            <CascadeRow key={entry.id} entry={entry} />
          ))}
        </div>
      </AlertDescription>
    </Alert>
  );
}
