'use client';

// timeline.tsx — Event Proposal Status Timeline
// Loaded via next/dynamic({ ssr: false }) from the status page server component.
// Fetches the event_proposal record and renders a visual timeline of its
// current workflow state.

import { useEffect, useState } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  EventProposal,
  EventProposalStatus,
  EVENT_PROPOSAL_STATUS_LABELS,
} from '@/types/events';

// ─── Status step config ──────────────────────────────────────────────────────

interface StatusStep {
  status: EventProposalStatus;
  label: string;
  description: string;
}

const STATUS_STEPS: StatusStep[] = [
  {
    status: 'submitted',
    label: 'Submitted',
    description: 'Your proposal has been received.',
  },
  {
    status: 'reviewing',
    label: 'Under Review',
    description: 'The Director is reviewing your proposal.',
  },
  {
    status: 'approved',
    label: 'Approved',
    description: 'Proposal approved. Event will be scheduled.',
  },
];

const TERMINAL_STATUSES: EventProposalStatus[] = ['rejected', 'withdrawn'];

// ─── Helpers ────────────────────────────────────────────────────────────────

function stepIndex(status: EventProposalStatus): number {
  if (status === 'rejected' || status === 'withdrawn') return -1;
  return STATUS_STEPS.findIndex(s => s.status === status);
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

interface TimelineProps {
  proposalId: string;
}

export default function ProposalTimeline({ proposalId }: TimelineProps) {
  const supabase = createClientSupabaseClient();
  const [proposal, setProposal] = useState<EventProposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!proposalId) return;

    (async () => {
      const { data, error: fetchError } = await (supabase as any)
        .from('event_proposals')
        .select('*')
        .eq('id', proposalId)
        .single();

      if (fetchError) {
        setError(fetchError.message);
      } else {
        setProposal(data as EventProposal);
      }
      setLoading(false);
    })();
  }, [proposalId, supabase]);

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse" aria-label="Loading proposal status">
        <div className="h-4 bg-muted rounded w-1/3" />
        <div className="h-4 bg-muted rounded w-1/2" />
        <div className="h-4 bg-muted rounded w-2/5" />
      </div>
    );
  }

  if (error || !proposal) {
    return (
      <div
        className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        role="alert"
      >
        {error ? `Could not load proposal: ${error}` : 'Proposal not found.'}
      </div>
    );
  }

  const isTerminal = TERMINAL_STATUSES.includes(proposal.status);
  const currentIdx = stepIndex(proposal.status);

  return (
    <div className="space-y-6">
      {/* Summary header */}
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{proposal.title}</h2>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {proposal.event_date && (
            <span>Date: {formatDate(proposal.event_date)}</span>
          )}
          {proposal.venue && <span>Venue: {proposal.venue}</span>}
          {proposal.audience.length > 0 && (
            <span>Audience: {proposal.audience.join(', ')}</span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          Submitted {formatDate(proposal.created_at)}
        </div>
      </div>

      {/* Terminal state: rejected / withdrawn */}
      {isTerminal && (
        <div
          className={[
            'rounded-lg p-4 border text-sm',
            proposal.status === 'rejected'
              ? 'border-destructive/30 bg-destructive/10 text-destructive'
              : 'border-muted bg-muted/40 text-muted-foreground',
          ].join(' ')}
          role="status"
          aria-live="polite"
        >
          <p className="font-medium mb-1">
            {EVENT_PROPOSAL_STATUS_LABELS[proposal.status]}
          </p>
          {proposal.decision_notes && (
            <p>{proposal.decision_notes}</p>
          )}
          {proposal.decided_at && (
            <p className="mt-1 text-xs opacity-70">
              {formatDate(proposal.decided_at)}
            </p>
          )}
        </div>
      )}

      {/* Progressive timeline steps */}
      {!isTerminal && (
        <ol
          className="relative border-l-2 border-muted ml-2 space-y-6"
          aria-label="Proposal workflow steps"
        >
          {STATUS_STEPS.map((step, idx) => {
            const isPast = idx < currentIdx;
            const isCurrent = idx === currentIdx;
            const isFuture = idx > currentIdx;

            return (
              <li
                key={step.status}
                className="pl-6 relative"
                aria-current={isCurrent ? 'step' : undefined}
              >
                {/* Step dot */}
                <span
                  className={[
                    'absolute -left-[9px] top-0.5 h-4 w-4 rounded-full border-2 transition-colors',
                    isPast
                      ? 'bg-primary border-primary'
                      : isCurrent
                      ? 'bg-background border-primary ring-2 ring-primary/30'
                      : 'bg-background border-muted-foreground/30',
                  ].join(' ')}
                  aria-hidden="true"
                />

                <p
                  className={[
                    'font-medium text-sm leading-none',
                    isFuture ? 'text-muted-foreground' : 'text-foreground',
                  ].join(' ')}
                >
                  {step.label}
                  {isCurrent && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary font-semibold">
                      Current
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {step.description}
                </p>

                {/* Decision notes on approval */}
                {step.status === 'approved' && isPast && proposal.decision_notes && (
                  <p className="mt-1 text-xs italic text-muted-foreground">
                    &ldquo;{proposal.decision_notes}&rdquo;
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {/* Approved — show decision notes if any */}
      {proposal.status === 'approved' && proposal.decision_notes && !isTerminal && (
        <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/20 p-3 text-sm text-green-800 dark:text-green-300">
          Director&apos;s note: {proposal.decision_notes}
        </div>
      )}

      {/* Extra info: budget + attendance if set */}
      {(proposal.budget_band || proposal.expected_attendance) && (
        <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground space-y-0.5">
          {proposal.expected_attendance && (
            <p>Expected attendance: {proposal.expected_attendance.toLocaleString()}</p>
          )}
          {proposal.budget_band && (
            <p>Budget band: {proposal.budget_band}</p>
          )}
        </div>
      )}
    </div>
  );
}
