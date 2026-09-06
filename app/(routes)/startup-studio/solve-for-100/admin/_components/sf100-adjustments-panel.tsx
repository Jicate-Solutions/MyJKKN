'use client';

/**
 * SF100 Program Adjustments — the M7 human-approval surface for the Cohort Moat.
 *
 * Lists feed-forward proposals (public.cohort_adjustment_proposals) for a program
 * and lets an admin APPROVE / REJECT a pending one and APPLY an approved one. The
 * proposer/estimator/gates all live in the DB (migrations 20260731092000–094000);
 * this is purely the review surface. "Check for adjustments" runs the proposer
 * over the program's closed cohorts.
 *
 * Nothing here bypasses a gate: the DB refuses to apply anything not human-approved
 * (M7), binds the actor to auth.uid(), and makes applied/rejected terminal.
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  CheckCircle,
  XCircle,
  RefreshCw,
  TrendingUp,
  Info,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/hooks/use-auth';
import {
  useCohortProposals,
  useApproveProposal,
  useRejectProposal,
  useApplyProposal,
  useGenerateAdjustments,
} from '@/hooks/cohort-core/useMoat';
import type {
  CohortAdjustmentProposal,
  ProposalDecision,
  ProposalStatus,
} from '@/lib/types/cohort-core';

interface SF100AdjustmentsPanelProps {
  programId: string;
}

const DECISION_STYLE: Record<ProposalDecision, { label: string; cls: string }> = {
  adopt: { label: 'Adopt', cls: 'bg-green-100 text-green-700 border-green-200' },
  revert: { label: 'Revert', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  inconclusive: { label: 'Inconclusive', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const STATUS_STYLE: Record<ProposalStatus, { label: string; cls: string }> = {
  pending: { label: 'Pending review', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  approved: { label: 'Approved', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  applied: { label: 'Applied', cls: 'bg-green-100 text-green-700 border-green-200' },
  rejected: { label: 'Rejected', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};

function fmtDelta(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n > 0 ? `+${n}` : `${n}`;
}

/** Render proposed_changes as a human sentence. */
function describeChanges(changes: Record<string, unknown> | null | undefined): string {
  if (!changes) return 'No program change';
  const parts: string[] = [];
  if (changes.paid_user_target_delta != null)
    parts.push(`Paying-user target ${fmtDelta(changes.paid_user_target_delta)}`);
  if (changes.hard_deadline_shift_days != null)
    parts.push(`Deadline ${fmtDelta(changes.hard_deadline_shift_days)} day(s)`);
  if (changes.min_transaction_amount_delta != null)
    parts.push(`Min transaction ₹${fmtDelta(changes.min_transaction_amount_delta)}`);
  return parts.length ? parts.join(' · ') : 'No program change';
}

function fmtLift(v: number | null): string {
  if (v == null) return '—';
  return `${v > 0 ? '+' : ''}${v.toFixed(3)}`;
}

function ProposalCard({
  p,
  actorId,
  onApprove,
  onReject,
  onApply,
  busy,
}: {
  p: CohortAdjustmentProposal;
  actorId: string;
  onApprove: (id: string, reviewerId: string) => void;
  onReject: (id: string, reviewerId: string) => void;
  onApply: (id: string, actorId: string) => void;
  busy: boolean;
}) {
  const [showReject, setShowReject] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const decision = DECISION_STYLE[p.decision];
  const status = STATUS_STYLE[p.status];
  const causal = p.causal_lift;
  const naive = p.naive_lift;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            {describeChanges(p.proposed_changes)}
          </CardTitle>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge variant="outline" className={`text-xs ${decision.cls}`}>{decision.label}</Badge>
            <Badge variant="outline" className={`text-xs ${status.cls}`}>{status.label}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Lift readout — causal is the trustworthy number; naive is the confounded contrast */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-md border p-2.5">
            <div className="text-xs text-muted-foreground">Causal lift (act on this)</div>
            <div className="text-lg font-semibold tabular-nums">{fmtLift(causal)}</div>
          </div>
          <div className="rounded-md border p-2.5 opacity-70">
            <div className="text-xs text-muted-foreground">Naive lift (confounded)</div>
            <div className="text-lg font-semibold tabular-nums">{fmtLift(naive)}</div>
          </div>
        </div>

        {p.rationale && (
          <p className="text-sm text-muted-foreground flex gap-2">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{p.rationale}</span>
          </p>
        )}

        {/* Actions gated by status */}
        {p.status === 'pending' && (
          <div className="space-y-2">
            {showReject ? (
              <div className="space-y-2">
                <Textarea
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  placeholder="Reason for rejecting (optional)"
                  rows={2}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busy}
                    onClick={() => { onReject(p.id, actorId); setShowReject(false); }}
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm reject'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowReject(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button size="sm" disabled={busy} onClick={() => onApprove(p.id, actorId)}>
                  <CheckCircle className="h-4 w-4 mr-1.5" /> Approve
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => setShowReject(true)}>
                  <XCircle className="h-4 w-4 mr-1.5" /> Reject
                </Button>
              </div>
            )}
          </div>
        )}

        {p.status === 'approved' && (
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={busy} onClick={() => onApply(p.id, actorId)}>
              <ShieldCheck className="h-4 w-4 mr-1.5" /> Apply to program
            </Button>
            {p.decision !== 'adopt' && (
              <span className="text-xs text-muted-foreground">(no program change — marks resolved)</span>
            )}
          </div>
        )}

        {(p.status === 'applied' || p.status === 'rejected') && (
          <p className="text-xs text-muted-foreground">
            {p.status === 'applied' ? 'Applied' : 'Rejected'}
            {p.reviewed_at ? ` · reviewed ${new Date(p.reviewed_at).toLocaleDateString()}` : ''}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function SF100AdjustmentsPanel({ programId }: SF100AdjustmentsPanelProps) {
  const { profile } = useAuth();
  const actorId = profile?.id ?? '';
  const { data: proposals, isLoading, error } = useCohortProposals({ target_id: programId });
  const approve = useApproveProposal();
  const reject = useRejectProposal();
  const apply = useApplyProposal();
  const generate = useGenerateAdjustments();

  const busy = approve.isPending || reject.isPending || apply.isPending;

  const handleGenerate = () => {
    generate.mutate(programId, {
      onSuccess: (r) =>
        toast.success(
          r.generated > 0
            ? `${r.generated} adjustment(s) proposed from ${r.considered} closed cohort(s)`
            : `Analyzed ${r.considered} closed cohort(s) — no significant adjustment found`
        ),
      onError: () => toast.error('Could not analyze cohorts'),
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-5 w-5" /> Program Adjustments
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Data-driven proposals to tune this program, each gated on a control-group
              causal lift and your approval before anything changes.
            </p>
          </div>
          <Button size="sm" variant="outline" disabled={generate.isPending} onClick={handleGenerate} className="shrink-0">
            {generate.isPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <><RefreshCw className="h-4 w-4 mr-1.5" /> Check for adjustments</>}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <Card key={i}><CardContent className="p-4"><Skeleton className="h-24 w-full" /></CardContent></Card>
            ))}
          </div>
        ) : error ? (
          <Alert variant="destructive"><AlertDescription>Could not load proposals.</AlertDescription></Alert>
        ) : !proposals || proposals.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <TrendingUp className="h-8 w-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium">No program adjustments yet</p>
            <p className="text-xs mt-1 max-w-md mx-auto">
              Adjustments appear here after a cohort closes and its control-group experiment
              shows a significant causal lift. Use “Check for adjustments” to analyze closed cohorts.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {proposals.map((p) => (
              <ProposalCard
                key={p.id}
                p={p}
                actorId={actorId}
                busy={busy}
                onApprove={(id, rid) => approve.mutate({ proposalId: id, reviewerId: rid })}
                onReject={(id, rid) => reject.mutate({ proposalId: id, reviewerId: rid })}
                onApply={(id, aid) => apply.mutate({ proposalId: id, actorId: aid })}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
