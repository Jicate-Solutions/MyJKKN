'use client';

// ════════════════════════════════════════════════════════════════════════════
// Call History Card
// Shows the call history for a single lead — every inbound/outbound call,
// disposition, duration, counselor, and a deep-link to the call detail page
// where notes + AI intelligence (transcription/sentiment/summary) live.
//
// Backed by admission_call_logs WHERE lead_id = $leadId, latest 20.
// Reused from useLeadCallLogs which hits /api/admission/calls?lead_id=...
//
// Counselor-productivity context: per probe-compliance-2026-05-03.md (J3),
// the lead detail page previously had ZERO references to call_logs — making
// counselors context-switch between Lead view and Call Logs to see history.
// This card closes that gap.
// ════════════════════════════════════════════════════════════════════════════

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  Clock,
  ExternalLink,
  User,
} from 'lucide-react';
import { useLeadCallLogs, formatDuration } from '@/hooks/admission';

interface CallHistoryCardProps {
  leadId: string;
  institutionId: string;
}

// Mirror the small style maps from app/(routes)/admission/counselors/calls/[id]/page.tsx
// so disposition/status badges look consistent across the two pages.
const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  completed: { label: 'Answered', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  'no-answer': { label: 'Missed', className: 'bg-red-100 text-red-700 border-red-200' },
  busy: { label: 'Busy', className: 'bg-orange-100 text-orange-800 border-orange-200' },
  failed: { label: 'Failed', className: 'bg-red-100 text-red-800 border-red-200' },
  initiated: { label: 'Initiated', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  ringing: { label: 'Ringing', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  'in-progress': { label: 'In Progress', className: 'bg-green-100 text-green-800 border-green-200' },
  cancelled: { label: 'Cancelled', className: 'bg-gray-100 text-gray-800 border-gray-200' },
};

const DISPOSITION_LABELS: Record<string, string> = {
  interested: 'Interested',
  not_interested: 'Not Interested',
  callback: 'Callback',
  wrong_number: 'Wrong Number',
  not_reachable: 'Not Reachable',
  switched_off: 'Switched Off',
  busy: 'Busy',
  other: 'Other',
};

// IST timestamp — matches the convention used in incoming-calls-tab.tsx and
// counselors/calls/page.tsx so call timestamps render the same everywhere.
function formatTimestampIST(input: string | null): string {
  if (!input) return '—';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

export function CallHistoryCard({ leadId, institutionId }: CallHistoryCardProps) {
  const { logs, total, isLoading, isError } = useLeadCallLogs(institutionId, leadId);

  // Show top 20 (the hook already limits server-side to 50, we further trim for UI).
  const visible = logs.slice(0, 20);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Phone className="h-4 w-4" />
          Call History
          {total > 0 && (
            <Badge variant="outline" className="ml-1 text-xs">
              {total}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : isError ? (
          <p className="text-sm text-muted-foreground">Failed to load call history.</p>
        ) : visible.length === 0 ? (
          <div className="text-center py-6">
            <Phone className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No calls yet</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {visible.map((c) => {
              const status = STATUS_STYLES[c.status] || STATUS_STYLES.initiated;
              const isInbound = c.direction === 'inbound';
              const dispositionLabel = c.call_disposition
                ? DISPOSITION_LABELS[c.call_disposition] || c.call_disposition
                : null;
              return (
                <Link
                  key={c.id}
                  href={`/admission/counselors/calls/${c.id}`}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-md hover:bg-muted/50 transition-colors border border-transparent hover:border-border"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {isInbound ? (
                      <PhoneIncoming className="h-4 w-4 text-green-600 shrink-0" />
                    ) : (
                      <PhoneOutgoing className="h-4 w-4 text-blue-600 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge
                          variant="outline"
                          className={`${status.className} text-[10px] px-1.5 py-0`}
                        >
                          {status.label}
                        </Badge>
                        {dispositionLabel && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-muted">
                            {dispositionLabel}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {formatTimestampIST(c.started_at || c.created_at)}
                        {c.counselor?.full_name && (
                          <span className="ml-1">
                            <User className="h-3 w-3 inline mx-0.5" />
                            {c.counselor.full_name}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-mono tabular-nums text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDuration(c.duration_seconds)}
                    </span>
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </Link>
              );
            })}
            {total > visible.length && (
              <div className="pt-2 border-t mt-2">
                <Button variant="ghost" size="sm" className="w-full text-xs" asChild>
                  <Link href={`/admission/counselors/calls?lead_id=${leadId}`}>
                    View all {total} calls
                  </Link>
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
