'use client';

// Asker status page per specs/chat-bypass-workflow-gravity.md §5.2
// — timeline (Submitted → Reviewing → Decided), Director's response inline,
// shareable URL the asker can paste back to chat instead of pinging again.
//
// State source: events.config.approval JSONB sub-object — read-only here.
// Director's review UI is deferred to Sprint 1B; for now Director records via /dashboard work-item.

import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  ArrowLeft,
  Loader2,
  Check,
  Clock,
  Send,
  Copy,
  CheckCircle2,
  XCircle,
  RefreshCw,
} from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';

type ApprovalStage = 'submitted' | 'reviewing' | 'approved' | 'rejected' | 'changes_requested';

type EventRow = {
  id: string;
  name: string | null;
  start_date: string | null;
  end_date: string | null;
  venue_text: string | null;
  proposed_by: string | null;
  target_audience: string[] | null;
  config: {
    approval?: {
      stage?: ApprovalStage;
      submitted_at?: string;
      submitted_by?: string;
      reviewed_at?: string;
      reviewed_by?: string;
      decision_notes?: string;
    };
    expected_attendance?: number | null;
    budget_estimate_inr?: number | null;
  } | null;
};

const STAGE_LABEL: Record<ApprovalStage, string> = {
  submitted: 'Submitted',
  reviewing: 'Reviewing',
  approved: 'Approved',
  rejected: 'Declined',
  changes_requested: 'Changes requested',
};

const stageOrder = (stage: ApprovalStage): number => {
  switch (stage) {
    case 'submitted': return 0;
    case 'reviewing': return 1;
    case 'approved':
    case 'rejected':
    case 'changes_requested': return 2;
    default: return 0;
  }
};

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function EventProposalStatusPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const supabase = createClientSupabaseClient();

  const eventId = String(params?.id ?? '');
  const justSubmitted = searchParams?.get('just_submitted') === '1';

  const [event, setEvent] = useState<EventRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!eventId) {
      setError('Missing event ID.');
      setLoading(false);
      return;
    }
    try {
      const { data, error: err } = await supabase
        .from('events')
        .select(
          'id, name, start_date, end_date, venue_text, proposed_by, target_audience, config'
        )
        .eq('id', eventId)
        .single();
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      setEvent((data ?? null) as unknown as EventRow);
      setLoading(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed.');
      setLoading(false);
    }
  }, [eventId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  // Auto-refresh every 30s while page is open and proposal is not yet decided
  useEffect(() => {
    const stage = event?.config?.approval?.stage;
    if (!stage || stageOrder(stage) >= 2) return;
    const handle = window.setInterval(() => {
      void load();
    }, 30_000);
    return () => window.clearInterval(handle);
  }, [event?.config?.approval?.stage, load]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleCopyUrl = async () => {
    if (typeof window === 'undefined') return;
    const url = window.location.origin + window.location.pathname;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link copied — paste it back into Chat.');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy. Long-press the URL to copy manually.');
    }
  };

  // ─────────────────────────────────────────────────────────
  // Loading / error states
  // ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <p className="text-sm text-muted-foreground mb-4">
          {error ?? 'This event proposal could not be found.'}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/events">Back to Events</Link>
          </Button>
          <Button asChild>
            <Link href="/events/propose">New proposal</Link>
          </Button>
        </div>
      </div>
    );
  }

  const approval = event.config?.approval ?? {};
  const currentStage: ApprovalStage = approval.stage ?? 'submitted';
  const currentOrder = stageOrder(currentStage);

  type Step = { key: ApprovalStage; label: string; ts: string | undefined; subtle?: string };
  const steps: Step[] = [
    {
      key: 'submitted',
      label: STAGE_LABEL.submitted,
      ts: approval.submitted_at,
      subtle: 'You sent this in.',
    },
    {
      key: 'reviewing',
      label: STAGE_LABEL.reviewing,
      ts: currentStage === 'reviewing' ? approval.reviewed_at ?? undefined : undefined,
      subtle: 'Director is looking at it.',
    },
    {
      key: currentStage === 'rejected' ? 'rejected'
        : currentStage === 'changes_requested' ? 'changes_requested'
        : 'approved',
      label:
        currentStage === 'rejected' ? STAGE_LABEL.rejected
          : currentStage === 'changes_requested' ? STAGE_LABEL.changes_requested
          : STAGE_LABEL.approved,
      ts: currentOrder >= 2 ? approval.reviewed_at : undefined,
      subtle:
        currentStage === 'rejected'
          ? 'Director declined.'
          : currentStage === 'changes_requested'
          ? 'Director asked for changes.'
          : 'Director approved.',
    },
  ];

  const decisionIcon =
    currentStage === 'rejected' ? <XCircle className="h-4 w-4" />
      : currentStage === 'approved' ? <CheckCircle2 className="h-4 w-4" />
      : <Clock className="h-4 w-4" />;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="mx-auto max-w-xl px-4 sm:px-6 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild aria-label="Back to events">
            <Link href="/events">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold leading-tight truncate">
              {event.name ?? 'Event proposal'}
            </h1>
            <p className="text-xs text-muted-foreground">Proposal status</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleManualRefresh}
            disabled={refreshing}
            aria-label="Refresh status"
          >
            <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 sm:px-6 py-6 space-y-6">
        {justSubmitted && (
          <div
            className="rounded-lg border bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 p-3 text-sm flex items-start gap-2"
            role="status"
          >
            <Check className="h-4 w-4 mt-0.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div>
              <p className="font-medium text-emerald-900 dark:text-emerald-100">Sent.</p>
              <p className="text-emerald-700 dark:text-emerald-300">
                Director has been pinged. You can come back anytime to see status.
              </p>
            </div>
          </div>
        )}

        {/* Timeline */}
        <Card>
          <CardContent className="p-5">
            <h2 className="text-sm font-semibold mb-4">Timeline</h2>
            <ol className="space-y-4">
              {steps.map((step, idx) => {
                const stepOrder = idx;
                const isDone = stepOrder < currentOrder;
                const isCurrent = stepOrder === currentOrder;
                const isFuture = stepOrder > currentOrder;
                return (
                  <li key={`${step.key}-${idx}`} className="flex items-start gap-3">
                    <div
                      className={cn(
                        'h-7 w-7 rounded-full border flex items-center justify-center shrink-0',
                        isDone && 'bg-primary border-primary text-primary-foreground',
                        isCurrent && (
                          step.key === 'rejected'
                            ? 'bg-red-500 border-red-500 text-white'
                            : step.key === 'approved'
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'bg-amber-500 border-amber-500 text-white'
                        ),
                        isFuture && 'border-border bg-background text-muted-foreground'
                      )}
                    >
                      {isDone && <Check className="h-3.5 w-3.5" />}
                      {isCurrent && decisionIcon}
                      {isFuture && <span className="text-xs">{stepOrder + 1}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          'text-sm font-medium',
                          isFuture && 'text-muted-foreground'
                        )}
                      >
                        {step.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {step.subtle}
                        {step.ts && <> · {formatDate(step.ts)}</>}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>

            {approval.decision_notes && currentOrder >= 2 && (
              <div className="mt-5 rounded-lg border bg-muted/30 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Director's note
                </p>
                <p className="text-sm whitespace-pre-wrap">{approval.decision_notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Event summary */}
        <Card>
          <CardContent className="p-5 space-y-3">
            <h2 className="text-sm font-semibold">What you sent</h2>
            <dl className="text-sm space-y-2">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">When</dt>
                <dd className="text-right">
                  {formatDate(event.start_date)}
                  {event.end_date && <> → {formatDate(event.end_date)}</>}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Where</dt>
                <dd className="text-right">{event.venue_text ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Audience</dt>
                <dd className="text-right">
                  {Array.isArray(event.target_audience) && event.target_audience.length > 0
                    ? event.target_audience.join(', ')
                    : '—'}
                </dd>
              </div>
              {event.config?.expected_attendance != null && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Expected attendance</dt>
                  <dd className="text-right">{event.config.expected_attendance}</dd>
                </div>
              )}
              {event.config?.budget_estimate_inr != null && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Budget bucket</dt>
                  <dd className="text-right">
                    ≤ ₹{event.config.budget_estimate_inr.toLocaleString('en-IN')}
                  </dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        {/* Share back to chat */}
        <Card>
          <CardContent className="p-5 space-y-3">
            <h2 className="text-sm font-semibold">Re-asking in chat?</h2>
            <p className="text-xs text-muted-foreground">
              Paste this link back to the chat thread instead of repeating the request — Director
              will see the same status here.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={handleCopyUrl}
              className="w-full justify-center h-11"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Link copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy this page's link
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Footer actions */}
        <div className="flex flex-col sm:flex-row gap-2 pb-6">
          <Button variant="outline" asChild className="flex-1 h-11">
            <Link href="/events">Back to Events</Link>
          </Button>
          <Button asChild className="flex-1 h-11">
            <Link href="/events/propose">
              <Send className="h-4 w-4 mr-2" />
              Another proposal
            </Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
