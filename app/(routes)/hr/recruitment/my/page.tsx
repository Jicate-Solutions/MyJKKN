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
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useCandidates, useWithdrawCandidate } from '@/hooks/hr/use-recruitment';
import {
  CANDIDATE_STATUS_LABELS,
  ROLE_CATEGORY_LABELS,
  type CandidateStatus,
} from '@/types/hr-recruitment';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';

// Status → Tailwind colour mapping (mirrors /hr/leave pattern exactly)
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

const PENDING_STATUSES: CandidateStatus[] = ['submitted', 'pending_approval'];

export default function MyCandidatesPage() {
  const { profile } = useAuth();

  // Filter state
  const [statusFilter, setStatusFilter] = useState<CandidateStatus | ''>('');

  // Fetch all — API does not yet support submitted_by filter; we filter client-side
  // TODO: Phase 1A follow-up — add submitted_by param to /api/hr/recruitment/candidates GET
  const { data, isLoading } = useCandidates(
    statusFilter ? { status: statusFilter } : {}
  );

  const allCandidates = data?.data ?? [];

  // Client-side filter by current user's ID when the API doesn't support it
  const candidates = profile?.id
    ? allCandidates.filter((c) => c.submitted_by === profile.id)
    : allCandidates;

  // Withdraw dialog
  const [withdrawId, setWithdrawId] = useState<string | null>(null);
  const [withdrawReason, setWithdrawReason] = useState('');
  const withdraw = useWithdrawCandidate();

  const onWithdraw = async () => {
    if (!withdrawId) return;
    try {
      await withdraw.mutateAsync({ id: withdrawId, reason: withdrawReason.trim() || undefined });
      toast.success('Candidate withdrawn');
      setWithdrawId(null);
      setWithdrawReason('');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <ContentLayout title="My Candidates">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr">HR</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr/recruitment">Recruitment</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>My Candidates</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle className="text-base">Candidates You Submitted</CardTitle>
              <div className="flex items-center gap-2">
                <Label htmlFor="statusFilter" className="text-sm shrink-0">Filter by status:</Label>
                <select
                  id="statusFilter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as CandidateStatus | '')}
                  className="border rounded-md h-9 px-2 text-sm bg-background"
                >
                  <option value="">All</option>
                  {(Object.entries(CANDIDATE_STATUS_LABELS) as [CandidateStatus, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {/* Skeleton loading rows */}
            {isLoading && (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="border rounded-md p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-2 flex-1">
                        <div className="h-4 w-48 rounded bg-muted/60 animate-pulse" />
                        <div className="h-3 w-64 rounded bg-muted/40 animate-pulse" />
                      </div>
                      <div className="h-6 w-24 rounded bg-muted/40 animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty state */}
            {!isLoading && candidates.length === 0 && (
              <div className="py-8 text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  You haven&apos;t submitted any candidates yet.
                </p>
                <Button asChild size="sm">
                  <Link href="/hr/recruitment/submit">Submit one &rarr;</Link>
                </Button>
              </div>
            )}

            {/* Candidate rows */}
            {!isLoading && candidates.length > 0 && (
              <div className="space-y-2">
                {candidates.map((c) => (
                  <div key={c.id} className="border rounded-md p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{c.name}</span>
                          {c.is_emergency && (
                            <Badge variant="outline" className="border-red-500 text-red-700 dark:text-red-300 text-xs">
                              Urgent
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {ROLE_CATEGORY_LABELS[c.role_category]} &middot; {c.role_title}
                          {c.institution_id && (
                            <span> &middot; {c.institution_id}</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Submitted: {new Date(c.submitted_at ?? c.created_at).toLocaleDateString()}
                        </p>
                        {c.rejection_reason && (
                          <p className="text-xs text-red-700 dark:text-red-400 mt-1">
                            Rejection: {c.rejection_reason}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[c.status]}`}>
                          {CANDIDATE_STATUS_LABELS[c.status]}
                        </span>
                        <div className="flex gap-1">
                          <Link
                            href={`/hr/recruitment/candidates/${c.id}`}
                            className="text-xs text-primary hover:underline"
                          >
                            View
                          </Link>
                          {PENDING_STATUSES.includes(c.status) && (
                            <button
                              type="button"
                              className="text-xs text-muted-foreground hover:text-foreground ml-2"
                              onClick={() => {
                                setWithdrawId(c.id);
                                setWithdrawReason('');
                              }}
                            >
                              Withdraw
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button asChild>
            <Link href="/hr/recruitment/submit">Submit New Candidate</Link>
          </Button>
        </div>
      </div>

      {/* Withdraw confirmation dialog */}
      <Dialog open={!!withdrawId} onOpenChange={(open) => { if (!open) setWithdrawId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Withdraw Candidate</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This will withdraw the candidacy from the approval queue. You can resubmit later if needed.
            </p>
            <div>
              <Label htmlFor="withdrawReason">Reason (optional)</Label>
              <Textarea
                id="withdrawReason"
                value={withdrawReason}
                onChange={(e) => setWithdrawReason(e.target.value)}
                rows={2}
                placeholder="Why are you withdrawing this candidate?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWithdrawId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={onWithdraw}
              disabled={withdraw.isPending}
            >
              {withdraw.isPending ? 'Withdrawing…' : 'Confirm Withdraw'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
