'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { AlertCircle, AlertTriangle } from 'lucide-react';
import { useCandidates, useApproveCandidate, useRejectCandidate } from '@/hooks/hr/use-recruitment';
import { usePermissions } from '@/hooks/use-permissions';
import {
  CANDIDATE_STATUS_LABELS,
  ROLE_CATEGORY_LABELS,
  CTC_BAND_LABELS,
  type CandidateStatus,
  type HRRecruitmentCandidate,
} from '@/types/hr-recruitment';
import { toast } from 'sonner';

const STATUS_COLORS: Record<CandidateStatus, string> = {
  submitted:        'bg-yellow-100 text-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-200',
  pending_approval: 'bg-yellow-100 text-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-200',
  approved:         'bg-green-100 text-green-900 dark:bg-green-900/20 dark:text-green-200',
  package_fixed:    'bg-blue-100 text-blue-900 dark:bg-blue-900/20 dark:text-blue-200',
  offer_issued:     'bg-blue-100 text-blue-900 dark:bg-blue-900/20 dark:text-blue-200',
  joined:           'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-200',
  rejected:         'bg-red-100 text-red-900 dark:bg-red-900/20 dark:text-red-200',
  withdrawn:        'bg-gray-100 text-gray-900 dark:bg-gray-900/20 dark:text-gray-200',
  offer_rescinded:  'bg-gray-100 text-gray-900 dark:bg-gray-900/20 dark:text-gray-200',
  no_show:          'bg-orange-100 text-orange-900 dark:bg-orange-900/20 dark:text-orange-200',
};

type ViewMode = 'mine' | 'all';

export default function RecruitmentApprovalsPage() {
  const { isSuperAdmin, canAccess } = usePermissions();

  const [viewMode, setViewMode] = useState<ViewMode>('mine');

  // Fetch pending candidates
  const { data, isLoading, error: fetchError } = useCandidates({
    status: ['submitted', 'pending_approval'],
  });

  const allPending = data?.data ?? [];

  // "Awaiting my action" — filter to candidates where current_step approver_role
  // matches a permission the user has. Uses canAccess('hr.recruitment', 'approve')
  // as a proxy — full role matching would require a DB join we don't have client-side.
  // TODO: Phase 1A follow-up — add `pending_for_me=true` filter to the list API.
  const canApprove = isSuperAdmin || canAccess('hr.recruitment', 'approve');

  const myPending = canApprove ? allPending : allPending.filter((c) => {
    const step = (c.approval_chain ?? [])[c.current_step];
    if (!step) return false;
    // Best-effort: surface all pending if user has any recruitment approve perm
    return true;
  });

  const displayCandidates = viewMode === 'mine' ? myPending : allPending;

  // Approve flow
  const approveMutation = useApproveCandidate();
  const [approveId, setApproveId] = useState<string | null>(null);
  const [approveComment, setApproveComment] = useState('');

  const onApprove = async () => {
    if (!approveId) return;
    try {
      await approveMutation.mutateAsync({ id: approveId, comment: approveComment.trim() || undefined });
      toast.success('Candidate approved');
      setApproveId(null);
      setApproveComment('');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // Reject flow
  const rejectMutation = useRejectCandidate();
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const onReject = async () => {
    if (!rejectId || !rejectReason.trim()) return;
    try {
      await rejectMutation.mutateAsync({ id: rejectId, reason: rejectReason.trim() });
      toast.success('Candidate rejected');
      setRejectId(null);
      setRejectReason('');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <ContentLayout title="Recruitment Approvals">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr">HR</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr/recruitment">Recruitment</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Approvals</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4 max-w-4xl">
        {/* Toggle */}
        <div className="flex gap-1 border rounded-md p-1 w-fit">
          <button
            type="button"
            onClick={() => setViewMode('mine')}
            className={`px-3 py-1 rounded text-sm transition ${
              viewMode === 'mine'
                ? 'bg-foreground text-background font-medium'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Awaiting my action
          </button>
          <button
            type="button"
            onClick={() => setViewMode('all')}
            className={`px-3 py-1 rounded text-sm transition ${
              viewMode === 'all'
                ? 'bg-foreground text-background font-medium'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            All pending
          </button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {viewMode === 'mine' ? 'Awaiting Your Approval' : 'All Pending Candidates'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Skeleton loading */}
            {isLoading && (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="border rounded-md p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-2 flex-1">
                        <div className="h-4 w-48 rounded bg-muted/60 animate-pulse" />
                        <div className="h-3 w-72 rounded bg-muted/40 animate-pulse" />
                        <div className="h-3 w-56 rounded bg-muted/40 animate-pulse" />
                      </div>
                      <div className="space-y-1">
                        <div className="h-8 w-24 rounded bg-muted/40 animate-pulse" />
                        <div className="h-8 w-24 rounded bg-muted/40 animate-pulse" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Fetch error */}
            {!isLoading && fetchError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{(fetchError as Error).message}</AlertDescription>
              </Alert>
            )}

            {/* Empty states */}
            {!isLoading && !fetchError && displayCandidates.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">
                {viewMode === 'mine'
                  ? 'Nothing pending your approval right now.'
                  : 'No candidates in the pipeline.'}
              </p>
            )}

            {/* Candidate rows */}
            {!isLoading && !fetchError && displayCandidates.map((c: HRRecruitmentCandidate) => {
              const currentStep = (c.approval_chain ?? [])[c.current_step];
              return (
                <div key={c.id} className="border rounded-md p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{c.name}</span>
                        {c.is_emergency && (
                          <Badge variant="outline" className="border-red-500 text-red-700 dark:text-red-300 text-xs flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Urgent
                          </Badge>
                        )}
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[c.status]}`}>
                          {CANDIDATE_STATUS_LABELS[c.status]}
                        </span>
                      </div>

                      <p className="text-xs text-muted-foreground mt-0.5">
                        {ROLE_CATEGORY_LABELS[c.role_category]}
                        {c.proposed_ctc_band && (
                          <> &middot; {CTC_BAND_LABELS[c.proposed_ctc_band]}</>
                        )}
                        {c.institution_id && (
                          <> &middot; {c.institution_id}</>
                        )}
                      </p>

                      <p className="text-xs text-muted-foreground mt-0.5">
                        {c.role_title}
                      </p>

                      {currentStep && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Step {c.current_step + 1}/{(c.approval_chain ?? []).length} &middot; Current approver: <span className="font-medium text-foreground">{currentStep.approver_role}</span>
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col gap-1 shrink-0 min-w-[100px]">
                      <Button
                        size="sm"
                        onClick={() => { setApproveId(c.id); setApproveComment(''); }}
                        className="w-full"
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setRejectId(c.id); setRejectReason(''); }}
                        className="w-full"
                      >
                        Reject
                      </Button>
                      <Link
                        href={`/hr/recruitment/candidates/${c.id}`}
                        className="text-xs text-primary hover:underline text-center"
                      >
                        View
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Approve dialog */}
      <Dialog open={!!approveId} onOpenChange={(open) => { if (!open) setApproveId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Candidate</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This will advance the candidacy to the next step in the approval chain.
            </p>
            <div>
              <Label htmlFor="approveComment">Comment (optional)</Label>
              <Textarea
                id="approveComment"
                value={approveComment}
                onChange={(e) => setApproveComment(e.target.value)}
                rows={2}
                placeholder="Any notes for the next approver…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveId(null)}>Cancel</Button>
            <Button onClick={onApprove} disabled={approveMutation.isPending}>
              {approveMutation.isPending ? 'Approving…' : 'Confirm Approve'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={!!rejectId} onOpenChange={(open) => { if (!open) setRejectId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Candidate</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This will reject the candidacy. The submitter will be notified.
            </p>
            <div>
              <Label htmlFor="rejectReason">Rejection Reason <span className="text-destructive">*</span></Label>
              <Textarea
                id="rejectReason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                required
                placeholder="Explain why this candidate is being rejected…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={onReject}
              disabled={!rejectReason.trim() || rejectMutation.isPending}
            >
              {rejectMutation.isPending ? 'Rejecting…' : 'Confirm Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
