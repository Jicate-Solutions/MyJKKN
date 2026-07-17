'use client';

/**
 * Candidate-level "Awaiting my action" list for /hr/recruitment/approvals.
 *
 * The overview page is job-first, but "approve" is a candidate-level action —
 * so the default (mine) view flattens to the actual candidates currently routed
 * to the viewer (fn_list_my_pending_recruitment via `pending_for_me`) and offers
 * inline Approve / Reject without drilling into the job workspace.
 *
 * Interview-gated steps (step.interview_required) can't be actioned until the
 * sitting is completed, and scheduling lives in the workspace — those rows link
 * in instead of showing an inline approve that would only fail server-side.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  AlertCircle, CheckCircle2, ChevronRight, Inbox, XCircle,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useCandidates, useApproveCandidate, useRejectCandidate } from '@/hooks/hr/use-recruitment';
import type { HRRecruitmentCandidate, CandidateStatus } from '@/types/hr-recruitment';

/** Deep-link target: the candidate's job workspace when linked, else its detail page. */
function jobLink(c: HRRecruitmentCandidate): string {
  const jobId = (c.role_specific_details as Record<string, unknown> | null)?.job_id;
  return typeof jobId === 'string' && jobId
    ? `/hr/recruitment/approvals/${jobId}`
    : `/hr/recruitment/candidates/${c.id}`;
}

export function MyPendingCandidates({
  userId, search,
}: { userId: string | undefined; search: string }) {
  // pending_for_me short-circuits to the SECURITY DEFINER RPC server-side;
  // the route derives the approver from the session, so approver_id here only
  // keys the cache per user.
  const { data, isLoading, error } = useCandidates({
    pending_for_me: true,
    approver_id: userId,
    status: ['submitted', 'pending_approval'] as CandidateStatus[],
  });

  const candidates = useMemo(() => {
    const all = data?.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.role_title ?? '').toLowerCase().includes(q));
  }, [data, search]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-0 divide-y divide-border">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 p-4">
              <div className="flex-1 space-y-2">
                <div className="h-4 w-48 rounded bg-muted/60 animate-pulse" />
                <div className="h-3 w-64 rounded bg-muted/40 animate-pulse" />
              </div>
              <div className="h-8 w-24 rounded bg-muted/40 animate-pulse" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{(error as Error).message}</AlertDescription>
      </Alert>
    );
  }

  if (candidates.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 flex flex-col items-center gap-2 text-center">
          <Inbox className="h-8 w-8 text-muted-foreground/60" />
          <p className="text-sm font-medium">Nothing awaiting your action</p>
          <p className="text-xs text-muted-foreground max-w-sm">
            {search
              ? 'No candidate matches your search.'
              : 'No candidate is currently routed to you for approval.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0 divide-y divide-border">
        {candidates.map((c) => (
          <PendingRow key={c.id} candidate={c} />
        ))}
      </CardContent>
    </Card>
  );
}

function PendingRow({ candidate }: { candidate: HRRecruitmentCandidate }) {
  const approve = useApproveCandidate();
  const reject = useRejectCandidate();
  const [approveOpen, setApproveOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');

  const chain = candidate.approval_chain ?? [];
  const step = chain[candidate.current_step];
  // Legacy chains have no step_type — the last step acts as final.
  const isFinal =
    step?.step_type === 'final' ||
    (step?.step_type === undefined && candidate.current_step === chain.length - 1);
  const decisionLabel = isFinal ? 'Final Approve' : 'Mark Reviewed';

  const handleApprove = async () => {
    try {
      await approve.mutateAsync({ id: candidate.id, comment: comment.trim() || undefined });
      toast.success(isFinal ? 'Candidate approved' : 'Step reviewed');
      setApproveOpen(false);
      setComment('');
    } catch (err) {
      const message = (err as Error).message ?? '';
      if (message.includes('already been fully approved') || message.includes('Approval chain exhausted')) {
        toast.info('This candidate is no longer pending — refreshing the list.');
        setApproveOpen(false);
        setComment('');
        return;
      }
      toast.error(message);
    }
  };

  const handleReject = async () => {
    if (!reason.trim()) return;
    try {
      await reject.mutateAsync({ id: candidate.id, reason: reason.trim() });
      toast.success('Candidate rejected');
      setRejectOpen(false);
      setReason('');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
      {/* Identity + step */}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/hr/recruitment/candidates/${candidate.id}`}
            className="text-sm font-semibold text-foreground hover:text-primary hover:underline"
          >
            {candidate.name}
          </Link>
          {candidate.is_emergency && (
            <Badge variant="outline" className="border-red-500 text-red-700 dark:text-red-300 text-[10px] px-1.5 py-0">
              Urgent
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            Step {candidate.current_step + 1}/{chain.length} · {step?.approver_role ?? '—'}
            {isFinal ? ' · final' : ''}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {candidate.role_title && <span className="truncate">{candidate.role_title}</span>}
          {candidate.email && <span className="truncate">{candidate.email}</span>}
        </div>
      </div>

      {/* Actions — stack under identity on mobile, inline on sm+.
          Interview is optional; approval is never blocked by it. */}
      <div className="flex items-center gap-2 shrink-0">
        <Button size="sm" className="gap-1.5" onClick={() => setApproveOpen(true)}>
          <CheckCircle2 className="h-3.5 w-3.5" />
          {decisionLabel}
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setRejectOpen(true)}>
          <XCircle className="h-3.5 w-3.5" />
          Reject
        </Button>
        <Button asChild size="sm" variant="ghost" className="px-2" aria-label="Open in workspace">
          <Link href={jobLink(candidate)}>
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      {/* Approve / review dialog */}
      <Dialog open={approveOpen} onOpenChange={(o) => { if (!o) setApproveOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isFinal ? 'Final Approval' : 'Mark as Reviewed'}</DialogTitle>
            <DialogDescription>
              {isFinal
                ? `Grants the final approval for ${candidate.name}.`
                : `Records your review of ${candidate.name} and forwards to the next approver.`}
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor={`pending-approve-${candidate.id}`}>
              {isFinal ? 'Comment (optional)' : 'Review notes (optional)'}
            </Label>
            <Textarea
              id={`pending-approve-${candidate.id}`}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              placeholder={isFinal ? 'Final remarks…' : 'Any notes for the next approver…'}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)}>Cancel</Button>
            <Button disabled={approve.isPending} onClick={handleApprove}>
              {approve.isPending ? 'Saving…' : isFinal ? 'Confirm Final Approval' : 'Confirm Review'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={(o) => { if (!o) setRejectOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Candidate</DialogTitle>
            <DialogDescription>
              {candidate.name} will be rejected. This ends the approval chain.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor={`pending-reject-${candidate.id}`}>Reason (required)</Label>
            <Textarea
              id={`pending-reject-${candidate.id}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Why is this candidate being rejected…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!reason.trim() || reject.isPending}
              onClick={handleReject}
            >
              {reject.isPending ? 'Rejecting…' : 'Confirm Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
