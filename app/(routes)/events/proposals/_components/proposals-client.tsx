'use client';

/**
 * Event Proposals — client list with status filter + approve/reject actions.
 *
 * RLS gates which rows are visible. RLS gates which actions succeed. We just
 * render UI affordances for what's allowed and rely on the database to refuse
 * anything stale (toast surfaces the Postgres message).
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  CalendarDays, MapPin, Users, Wallet, Check, X, ExternalLink, Loader2,
} from 'lucide-react';
import type {
  EventProposalStatus,
} from '@/types/events';
import { EVENT_PROPOSAL_STATUS_LABELS } from '@/types/events';

interface ProposalRow {
  id: string;
  title: string;
  status: EventProposalStatus;
  event_date: string | null;
  venue: string | null;
  audience: string[];
  expected_attendance: number | null;
  budget_band: string | null;
  decision_notes: string | null;
  decided_at: string | null;
  created_at: string;
  institution_id: string;
  proposer_id: string;
  sender_email: string | null;
  sender_role: string | null;
  institution?: { id: string; name: string } | null;
  proposer?: { id: string; full_name: string; email: string | null } | null;
}

interface ProposalsClientProps {
  initialProposals: ProposalRow[];
  isAdminRole: boolean;
  currentUserId: string;
}

const STATUS_FILTERS: ('all' | EventProposalStatus)[] = [
  'all', 'submitted', 'reviewing', 'approved', 'rejected', 'withdrawn',
];

const STATUS_BADGE: Record<EventProposalStatus, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string }> = {
  submitted:  { variant: 'secondary',   className: 'bg-blue-50 text-blue-700 border-blue-200' },
  reviewing:  { variant: 'secondary',   className: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  approved:   { variant: 'default',     className: 'bg-green-50 text-green-700 border-green-200' },
  rejected:   { variant: 'destructive', className: '' },
  withdrawn:  { variant: 'outline',     className: 'text-muted-foreground' },
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export function ProposalsClient({
  initialProposals, isAdminRole, currentUserId,
}: ProposalsClientProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClientSupabaseClient(), []);
  const [proposals, setProposals] = useState(initialProposals);
  const [filter, setFilter] = useState<'all' | EventProposalStatus>('all');
  const [decisionTarget, setDecisionTarget] = useState<{
    proposal: ProposalRow;
    action: 'approve' | 'reject';
  } | null>(null);
  const [decisionNotes, setDecisionNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: proposals.length };
    for (const p of proposals) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [proposals]);

  const visible = useMemo(
    () => (filter === 'all' ? proposals : proposals.filter(p => p.status === filter)),
    [proposals, filter],
  );

  const openDecision = (proposal: ProposalRow, action: 'approve' | 'reject') => {
    setDecisionTarget({ proposal, action });
    setDecisionNotes('');
  };

  const submitDecision = async () => {
    if (!decisionTarget) return;
    const { proposal, action } = decisionTarget;
    const nextStatus: EventProposalStatus = action === 'approve' ? 'approved' : 'rejected';

    if (action === 'reject' && !decisionNotes.trim()) {
      toast.error('Please add a note explaining the rejection');
      return;
    }

    setSubmitting(true);
    const { data, error } = await supabase
      .from('event_proposals')
      .update({
        status: nextStatus,
        decision_notes: decisionNotes.trim() || null,
        decided_by: currentUserId,
        decided_at: new Date().toISOString(),
      })
      .eq('id', proposal.id)
      .select('id, status, decision_notes, decided_at')
      .single();
    setSubmitting(false);

    if (error) {
      toast.error(`Failed to ${action}: ${error.message}`);
      return;
    }

    setProposals(prev => prev.map(p =>
      p.id === proposal.id
        ? { ...p, status: data.status, decision_notes: data.decision_notes, decided_at: data.decided_at }
        : p,
    ));
    toast.success(action === 'approve' ? 'Proposal approved' : 'Proposal rejected');
    setDecisionTarget(null);
    router.refresh();
  };

  const withdraw = async (proposal: ProposalRow) => {
    if (!confirm('Withdraw this proposal? This cannot be undone.')) return;
    const { error } = await supabase
      .from('event_proposals')
      .update({ status: 'withdrawn' as EventProposalStatus })
      .eq('id', proposal.id);
    if (error) {
      toast.error(`Failed to withdraw: ${error.message}`);
      return;
    }
    setProposals(prev => prev.map(p =>
      p.id === proposal.id ? { ...p, status: 'withdrawn' as EventProposalStatus } : p,
    ));
    toast.success('Proposal withdrawn');
    router.refresh();
  };

  return (
    <div className="space-y-4">
      {/* Status filter pills */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map(s => {
          const active = filter === s;
          const label = s === 'all' ? 'All' : EVENT_PROPOSAL_STATUS_LABELS[s as EventProposalStatus];
          const count = counts[s] ?? 0;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={[
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-foreground border-input hover:bg-accent',
              ].join(' ')}
            >
              {label}
              <span className={[
                'inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs',
                active ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground',
              ].join(' ')}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* List */}
      {visible.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p className="text-sm">No proposals match the “{filter}” filter.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map(p => {
            const badge = STATUS_BADGE[p.status];
            const isOwn = p.proposer_id === currentUserId;
            const isPending = p.status === 'submitted' || p.status === 'reviewing';
            const canDecide = isAdminRole && isPending;
            const canWithdraw = isOwn && isPending;

            return (
              <Card key={p.id}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={badge.variant} className={badge.className}>
                          {EVENT_PROPOSAL_STATUS_LABELS[p.status]}
                        </Badge>
                        {p.institution?.name && (
                          <Badge variant="outline" className="text-xs font-normal">
                            {p.institution.name}
                          </Badge>
                        )}
                      </div>
                      <h3 className="font-semibold text-base truncate">{p.title}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Submitted by {p.proposer?.full_name ?? p.sender_email ?? 'Unknown'}
                        {' · '}
                        {formatDate(p.created_at)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/events/propose/${p.id}/status`}>
                          <ExternalLink className="h-3.5 w-3.5 mr-1" />
                          View
                        </Link>
                      </Button>
                      {canDecide && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => openDecision(p, 'approve')}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <Check className="h-3.5 w-3.5 mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => openDecision(p, 'reject')}
                          >
                            <X className="h-3.5 w-3.5 mr-1" />
                            Reject
                          </Button>
                        </>
                      )}
                      {canWithdraw && !canDecide && (
                        <Button size="sm" variant="ghost" onClick={() => withdraw(p)}>
                          Withdraw
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {formatDate(p.event_date)}
                    </span>
                    {p.venue && (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" />
                        {p.venue}
                      </span>
                    )}
                    {p.audience && p.audience.length > 0 && (
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" />
                        {p.audience.join(', ')}
                      </span>
                    )}
                    {p.expected_attendance != null && (
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" />
                        ~{p.expected_attendance} attendees
                      </span>
                    )}
                    {p.budget_band && (
                      <span className="inline-flex items-center gap-1.5">
                        <Wallet className="h-3.5 w-3.5" />
                        {p.budget_band}
                      </span>
                    )}
                  </div>

                  {p.decision_notes && (
                    <div className="border-t pt-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Decision note: </span>
                      {p.decision_notes}
                      {p.decided_at && (
                        <span className="ml-1">· {formatDate(p.decided_at)}</span>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Decision dialog */}
      <Dialog
        open={!!decisionTarget}
        onOpenChange={(open) => { if (!open) setDecisionTarget(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decisionTarget?.action === 'approve' ? 'Approve Proposal' : 'Reject Proposal'}
            </DialogTitle>
            <DialogDescription>
              {decisionTarget?.proposal.title}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="decision-notes" className="text-sm font-medium">
              Decision note{decisionTarget?.action === 'reject' ? ' *' : ' (optional)'}
            </label>
            <Textarea
              id="decision-notes"
              rows={4}
              placeholder={decisionTarget?.action === 'approve'
                ? 'Any comments for the proposer (optional)…'
                : 'Explain why this is being rejected…'
              }
              value={decisionNotes}
              onChange={(e) => setDecisionNotes(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDecisionTarget(null)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              onClick={submitDecision}
              disabled={submitting}
              className={decisionTarget?.action === 'approve' ? 'bg-green-600 hover:bg-green-700' : ''}
              variant={decisionTarget?.action === 'reject' ? 'destructive' : 'default'}
            >
              {submitting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {decisionTarget?.action === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
