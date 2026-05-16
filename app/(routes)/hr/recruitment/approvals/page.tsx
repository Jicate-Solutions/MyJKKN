'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
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
import {
  AlertCircle, AlertTriangle, Clock, FileText, CheckCircle2, Loader2, Settings,
} from 'lucide-react';
import { useCandidates, useApproveCandidate, useRejectCandidate } from '@/hooks/hr/use-recruitment';
import { useAlumniSignalBulk } from '@/hooks/hr/use-alumni-signal-bulk';
import { AlumniSignalLine } from '../_components/alumni-signal-line';
import {
  CANDIDATE_STATUS_LABELS,
  ROLE_CATEGORY_LABELS,
  MONTHLY_SALARY_BAND_LABELS,
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
  const [viewMode, setViewMode] = useState<ViewMode>('mine');
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClientSupabaseClient();
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, []);

  // "Awaiting my action" — server-side filter via pending_for_me + approver_id.
  // The service matches approval_chain[current_step].approver_user_id against
  // the caller's id, so this returns only candidates actually routed to me.
  const mineFilters = userId
    ? { status: ['submitted', 'pending_approval'] as CandidateStatus[], pending_for_me: true, approver_id: userId }
    : null;
  const allFilters = { status: ['submitted', 'pending_approval'] as CandidateStatus[] };

  const { data, isLoading, error: fetchError } = useCandidates(
    viewMode === 'mine' ? (mineFilters ?? allFilters) : allFilters,
  );

  // While the auth lookup is in flight, hold the "mine" view as loading so we
  // never render the unfiltered list under the "Awaiting my action" tab.
  const awaitingAuth = viewMode === 'mine' && userId === null;
  const displayCandidates = awaitingAuth ? [] : (data?.data ?? []);

  // T8.5 — bulk-fetch alumni signals for all displayed candidates so each
  // row can show JKKN history inline without N detail fetches.
  const candidateEmails = displayCandidates.map((c) => c.email);
  const { data: alumniMap } = useAlumniSignalBulk(candidateEmails);

  // Decision-grade row — bulk-resolve submitter names so each row shows
  // "Submitted by X" inline (no per-row fetch). Stable key on the sorted ids
  // so identical sets reuse the cache regardless of display order.
  const submitterIds = Array.from(
    new Set(displayCandidates.map((c) => c.submitted_by).filter(Boolean) as string[]),
  ).sort();
  const { data: submitterNames } = useQuery<Record<string, string>>({
    queryKey: ['hr-recruitment-approvals-submitters', submitterIds],
    queryFn: async () => {
      if (submitterIds.length === 0) return {};
      const supabase = createClientSupabaseClient();
      const { data: rows, error } = await (supabase as any)
        .from('profiles')
        .select('id, full_name')
        .in('id', submitterIds);
      if (error) {
        console.error('[approvals] submitter name lookup failed:', error.message);
        return {};
      }
      const map: Record<string, string> = {};
      for (const r of (rows ?? []) as Array<{ id: string; full_name: string | null }>) {
        if (r.id) map[r.id] = r.full_name ?? 'Unknown';
      }
      return map;
    },
    enabled: submitterIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // Approve flow
  const queryClient = useQueryClient();
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
      const message = (err as Error).message ?? '';
      // BUG-003310 / BUG-003302 — When a different approver finished the chain (or
      // the React Query cache was stale), the row in the list is no longer pending.
      // Show an info toast instead of the scary red error, refresh the list, and
      // dismiss the dialog.
      if (
        message.includes('already been fully approved') ||
        message.includes('Approval chain exhausted')
      ) {
        toast.info('This candidate is no longer pending — refreshing the list.');
        queryClient.invalidateQueries({ queryKey: ['hr-recruitment-candidates'] });
        setApproveId(null);
        setApproveComment('');
        return;
      }
      toast.error(message);
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
            {(isLoading || awaitingAuth) && (
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
            {!isLoading && !awaitingAuth && !fetchError && displayCandidates.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">
                {viewMode === 'mine'
                  ? 'You have no candidates awaiting your action.'
                  : 'There are no pending candidates.'}
              </p>
            )}

            {/* Candidate rows — decision-grade: every field Director needs to
                Approve/Reject without leaving this page is inline. */}
            {!isLoading && !fetchError && displayCandidates.map((c: HRRecruitmentCandidate) => {
              const chain = c.approval_chain ?? [];
              const currentStep = chain[c.current_step];
              const chainConfigured = chain.length > 0;

              // Waiting days — drives urgency color
              const submittedMs = new Date(c.submitted_at).getTime();
              const waitDays = Number.isFinite(submittedMs)
                ? Math.floor((Date.now() - submittedMs) / 86400000)
                : 0;
              const waitClass =
                waitDays > 14
                  ? 'text-red-700 dark:text-red-300 border-red-500/50 bg-red-50 dark:bg-red-900/20'
                  : waitDays >= 7
                  ? 'text-amber-700 dark:text-amber-300 border-amber-500/50 bg-amber-50 dark:bg-amber-900/20'
                  : 'text-muted-foreground border-muted bg-muted/40';

              // Submitter line — prefer resolved name, else relative date only
              const submitterName = c.submitted_by ? submitterNames?.[c.submitted_by] : undefined;
              const submittedLabel = (() => {
                if (waitDays === 0) return 'today';
                if (waitDays === 1) return 'yesterday';
                return `${waitDays} days ago`;
              })();

              // Latest decided step that left a comment — the most recent voice
              // in the chain the next approver should see before deciding.
              const latestCommented = [...chain]
                .filter((s) => s.decided_by && s.comment && s.comment.trim().length > 0)
                .sort((a, b) => {
                  const at = a.decided_at ? new Date(a.decided_at).getTime() : 0;
                  const bt = b.decided_at ? new Date(b.decided_at).getTime() : 0;
                  return bt - at;
                })[0];

              return (
                <div key={c.id} className="border rounded-md p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      {/* Row 1 — name + emergency + status + waiting-days badge */}
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
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium ${waitClass}`}
                          title={`Submitted ${new Date(c.submitted_at).toLocaleString()}`}
                        >
                          <Clock className="h-3 w-3" />
                          {waitDays} {waitDays === 1 ? 'day' : 'days'} waiting
                        </span>
                      </div>

                      {/* Row 2 — role line, with explicit salary-band fallback so an
                          unset band is visible to the approver, not silently hidden. */}
                      <p className="text-xs text-muted-foreground">
                        {ROLE_CATEGORY_LABELS[c.role_category]}
                        <> &middot; </>
                        {c.proposed_monthly_salary_band ? (
                          <span className="font-medium text-foreground">
                            {MONTHLY_SALARY_BAND_LABELS[c.proposed_monthly_salary_band]}
                          </span>
                        ) : (
                          <span className="italic">Salary band not specified</span>
                        )}
                        {c.institution_id && (
                          <> &middot; {c.institution_id}</>
                        )}
                      </p>

                      <p className="text-xs text-muted-foreground">
                        {c.role_title}
                      </p>

                      {/* Row 3 — Submitter line */}
                      <p className="text-xs text-muted-foreground">
                        {submitterName
                          ? <>Submitted by <span className="font-medium text-foreground">{submitterName}</span> &middot; {submittedLabel}</>
                          : <>Submitted {submittedLabel}</>}
                      </p>

                      {/* Row 4 — Inline CV link (BUG-003300, surfaced on the row) */}
                      {c.cvviz_url && (
                        <a
                          href={c.cvviz_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <FileText className="h-3 w-3" />
                          CV
                        </a>
                      )}

                      {/* T8.5 — JKKN history badge (renders nothing when no match) */}
                      <AlumniSignalLine
                        signal={alumniMap ? alumniMap[c.email.toLowerCase().trim()] : null}
                      />

                      {/* Row 5 — Chain progress cascade.
                          Empty chain = legacy/orphan submission. Surface loudly so
                          Director sees it on the row, not after clicking through. */}
                      {!chainConfigured ? (
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-amber-500/50 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 text-xs font-medium">
                            <AlertTriangle className="h-3 w-3" />
                            Approval chain not configured — director must backfill
                          </span>
                          <Link
                            href="/admin/hr/recruitment-maintenance"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <Settings className="h-3 w-3" />
                            Open maintenance
                          </Link>
                        </div>
                      ) : (
                        <div className="space-y-1 mt-1">
                          <p className="text-xs text-muted-foreground">
                            Step {c.current_step + 1} of {chain.length} &middot; waiting on{' '}
                            <span className="font-medium text-foreground">
                              {currentStep?.approver_role ?? '—'}
                            </span>
                          </p>
                          <div className="flex flex-wrap items-center gap-1">
                            {chain.map((step, idx) => {
                              const isApproved = step.status === 'approved';
                              const isRejected = step.status === 'rejected';
                              const isCurrent = idx === c.current_step && !isApproved && !isRejected;
                              const Icon = isApproved
                                ? CheckCircle2
                                : isCurrent
                                ? Loader2
                                : isRejected
                                ? AlertCircle
                                : Clock;
                              const cls = isApproved
                                ? 'text-green-700 dark:text-green-300 border-green-500/40 bg-green-50 dark:bg-green-900/20'
                                : isRejected
                                ? 'text-red-700 dark:text-red-300 border-red-500/40 bg-red-50 dark:bg-red-900/20'
                                : isCurrent
                                ? 'text-blue-700 dark:text-blue-300 border-blue-500/40 bg-blue-50 dark:bg-blue-900/20'
                                : 'text-muted-foreground border-muted bg-muted/30';
                              return (
                                <span
                                  key={`${c.id}-step-${idx}`}
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] ${cls}`}
                                  title={`Step ${idx + 1}: ${step.approver_role} — ${step.status}`}
                                >
                                  <Icon className={`h-3 w-3 ${isCurrent ? 'animate-spin' : ''}`} />
                                  {step.approver_role}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Row 6 — Latest comment from the chain (skip if none) */}
                      {latestCommented && (
                        <p className="text-xs text-muted-foreground italic mt-1">
                          Latest &middot; {latestCommented.approver_role}: &ldquo;{latestCommented.comment}&rdquo;
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col gap-1 shrink-0 min-w-[100px]">
                      <Button
                        size="sm"
                        onClick={() => { setApproveId(c.id); setApproveComment(''); }}
                        className="w-full"
                        disabled={!chainConfigured}
                        title={chainConfigured ? undefined : 'Approval chain not configured — backfill first'}
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
                        View detail
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
