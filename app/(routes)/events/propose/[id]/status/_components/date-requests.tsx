'use client';

// date-requests.tsx — Event Date Requests (CARRE instrumentation, Lane B)
// LC brief Q4: "no confirmed event dates; repeated Principal meetings". Every
// in-person ask was invisible — this surface turns the ask into a timestamped
// row so "how long has this been waiting" is measurable.
//
// Renders on /events/propose/[id]/status below the timeline:
//   • an open-requests line (count + oldest waiting days),
//   • a small "Request a date" button → fn_event_date_request_raise RPC,
//   • explicit denial states — every RPC failure shows its reason inline
//     (rule #27: never a silent no-op or redirect).
// Writes are RPC-only; the base table is read-only under RLS.

import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Loader2 } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';

interface DateRequestRow {
  id: string;
  requested_at: string;
  decision: 'confirmed' | 'declined' | 'superseded' | null;
  decided_at: string | null;
}

interface RaiseRpcResult {
  success: boolean;
  error?: string;
  message?: string;
  request_id?: string;
  requested_at?: string;
}

function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

interface DateRequestsProps {
  proposalId: string;
}

export default function DateRequests({ proposalId }: DateRequestsProps) {
  const supabase = createClientSupabaseClient();
  const [requests, setRequests] = useState<DateRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [raiseError, setRaiseError] = useState<string | null>(null);
  const [raised, setRaised] = useState(false);

  const loadRequests = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from('event_date_requests')
      .select('id, requested_at, decision, decided_at')
      .eq('proposal_id', proposalId)
      .order('requested_at', { ascending: false });

    if (error) {
      setLoadError(error.message);
    } else {
      setLoadError(null);
      setRequests((data ?? []) as DateRequestRow[]);
    }
    setLoading(false);
  }, [proposalId, supabase]);

  useEffect(() => {
    if (!proposalId) return;
    void loadRequests();
  }, [proposalId, loadRequests]);

  const handleRaise = async () => {
    setSubmitting(true);
    setRaiseError(null);
    try {
      const { data, error } = await (supabase as any).rpc('fn_event_date_request_raise', {
        p_proposal_id: proposalId,
      });

      if (error) {
        setRaiseError(error.message);
      } else {
        const result = data as RaiseRpcResult;
        if (result?.success) {
          setRaised(true);
          await loadRequests();
        } else {
          // Explicit denial — surface the exact reason from the RPC.
          setRaiseError(result?.message ?? 'The date request could not be raised.');
        }
      }
    } catch (err) {
      setRaiseError(err instanceof Error ? err.message : 'The date request could not be raised.');
    } finally {
      setSubmitting(false);
    }
  };

  const open = requests.filter(r => r.decided_at === null);
  const latestDecided = requests.find(r => r.decided_at !== null);
  const oldestOpen = open.length > 0 ? open[open.length - 1] : null;

  return (
    <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h3 className="text-sm font-semibold">Event date</h3>
      </div>

      {loading ? (
        <div className="h-4 w-2/3 bg-muted rounded animate-pulse" aria-label="Loading date requests" />
      ) : loadError ? (
        <p className="text-sm text-destructive" role="alert">
          Could not load date requests: {loadError}
        </p>
      ) : (
        <>
          {/* Open-requests line — the measured wait, not anecdote */}
          {open.length > 0 && oldestOpen ? (
            <p className="text-sm text-muted-foreground" role="status">
              <span className="font-medium text-foreground">
                {open.length} open date request{open.length === 1 ? '' : 's'}
              </span>{' '}
              · oldest waiting {daysSince(oldestOpen.requested_at)} day
              {daysSince(oldestOpen.requested_at) === 1 ? '' : 's'} (asked{' '}
              {formatDate(oldestOpen.requested_at)})
            </p>
          ) : latestDecided ? (
            <p className="text-sm text-muted-foreground" role="status">
              Last date request {latestDecided.decision}
              {latestDecided.decided_at ? ` on ${formatDate(latestDecided.decided_at)}` : ''}.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No date request yet. If this event is still waiting for a confirmed date, raise
              one — it timestamps the ask so the wait is visible.
            </p>
          )}

          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              onClick={handleRaise}
              disabled={submitting}
              aria-label="Request a confirmed date for this event"
            >
              {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              Request a date
            </Button>
            {raised && !raiseError && (
              <span className="text-xs text-green-700 dark:text-green-400" role="status">
                Date request raised — the wait is now on record.
              </span>
            )}
          </div>

          {/* Explicit denial state — the exact reason, never a silent failure */}
          {raiseError && (
            <p
              className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive"
              role="alert"
            >
              {raiseError}
            </p>
          )}
        </>
      )}
    </div>
  );
}
