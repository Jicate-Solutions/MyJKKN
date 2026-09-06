'use client';

/**
 * Application screening panel on the job detail page.
 *
 * The apply wizard writes hr_job_applications; HR screens them here
 * (review / shortlist / reject) and promotes shortlisted ones into
 * hr_recruitment_candidates, where the frozen approval chain takes over.
 */

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Inbox,
  FileText,
  ExternalLink,
  Star,
  XCircle,
  Eye,
  ArrowUpRight,
  Loader2,
  AlertTriangle,
  Trash2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  useJobApplications,
  useReviewApplication,
  usePromoteApplication,
  usePurgeRejectedApplicant,
} from '@/hooks/hr/use-recruitment';
import { usePermissions } from '@/hooks/use-permissions';
import {
  JOB_APPLICATION_STATUS_LABELS,
  type HRJobApplication,
  type JobApplicationStatus,
} from '@/types/hr-recruitment';

const STATUS_BADGE: Record<JobApplicationStatus, string> = {
  pending:
    'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
  reviewed:
    'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300',
  shortlisted:
    'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  rejected:
    'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/60 dark:text-red-300',
  promoted:
    'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
};

const fmtExp = (months: number) => {
  if (months <= 0) return 'Fresher';
  const yrs = Math.floor(months / 12);
  const rem = months % 12;
  if (yrs === 0) return `${rem} mo`;
  return rem === 0 ? `${yrs} yr` : `${yrs} yr ${rem} mo`;
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export function ApplicationsSection({ jobId }: { jobId: string }) {
  const { data, isLoading, error } = useJobApplications({ job_id: jobId, pageSize: 100 });
  const review = useReviewApplication();
  const promote = usePromoteApplication();
  const purge = usePurgeRejectedApplicant();
  const { isSuperAdmin } = usePermissions();

  const [rejectTarget, setRejectTarget] = useState<HRJobApplication | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');
  const [promoteTarget, setPromoteTarget] = useState<HRJobApplication | null>(null);
  const [promoteEmergency, setPromoteEmergency] = useState(false);
  const [purgeTarget, setPurgeTarget] = useState<HRJobApplication | null>(null);
  const [purgeConfirm, setPurgeConfirm] = useState('');

  const applications = data?.data ?? [];
  const purgeArmed = purgeConfirm.trim().toUpperCase() === 'DELETE';

  const handleReview = (
    app: HRJobApplication,
    status: 'reviewed' | 'shortlisted' | 'rejected',
    notes?: string
  ) => {
    review.mutate(
      { id: app.id, status, review_notes: notes ?? null },
      {
        onSuccess: () => {
          toast.success(
            status === 'shortlisted'
              ? `${app.first_name} shortlisted`
              : status === 'rejected'
                ? `${app.first_name} rejected`
                : 'Marked as reviewed'
          );
          setRejectTarget(null);
          setRejectNotes('');
        },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  // Permanent erase of a rejected applicant — super admins only. The server
  // re-checks both the super-admin identity and the rejected status, so this
  // gate only decides whether the affordance is visible.
  const handlePurge = async () => {
    if (!purgeTarget || !purgeArmed) return;
    const name = `${purgeTarget.first_name} ${purgeTarget.last_name}`.trim();
    try {
      const result = await purge.mutateAsync({ applicationId: purgeTarget.id });
      toast.success(`${name} permanently deleted`, {
        description:
          result.resumes_failed > 0
            ? 'All records removed, but the resume could not be deleted from Drive — it has been logged for cleanup.'
            : 'Application details and resume have been erased.',
      });
      setPurgeTarget(null);
      setPurgeConfirm('');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handlePromote = () => {
    if (!promoteTarget) return;
    promote.mutate(
      { id: promoteTarget.id, is_emergency: promoteEmergency },
      {
        onSuccess: ({ candidate }) => {
          toast.success(
            `${promoteTarget.first_name} moved to the approval pipeline`,
            {
              action: {
                label: 'View candidate',
                onClick: () => window.open(`/hr/recruitment/candidates/${candidate.id}`, '_self'),
              },
            }
          );
          setPromoteTarget(null);
          setPromoteEmergency(false);
        },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-3 text-base font-semibold">
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-cyan-100 dark:bg-cyan-950">
            <Inbox className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
          </span>
          Applications
          {applications.length > 0 && (
            <span className="rounded-full border bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
              {applications.length}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {error instanceof Error ? error.message : 'Failed to load applications'}
          </div>
        ) : applications.length === 0 ? (
          <div className="py-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Inbox className="h-5 w-5 text-muted-foreground/50" />
            </div>
            <p className="text-sm text-muted-foreground">No applications received yet.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {applications.map((app) => {
              const busy =
                (review.isPending && review.variables?.id === app.id) ||
                (promote.isPending && promoteTarget?.id === app.id);
              return (
                <li key={app.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/hr/recruitment/applications/${app.id}`}
                        className="font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {app.first_name} {app.last_name}
                      </Link>
                      <Badge variant="outline" className={cn('text-[11px]', STATUS_BADGE[app.status])}>
                        {JOB_APPLICATION_STATUS_LABELS[app.status]}
                      </Badge>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {app.email} · {app.phone}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {app.qualification} · {fmtExp(app.experience_months)} exp · Applied{' '}
                      {fmtDate(app.submitted_at)}
                    </p>
                    {app.review_notes && (
                      <p className="rounded-md bg-muted/60 px-2 py-1 text-xs italic text-muted-foreground">
                        “{app.review_notes}”
                      </p>
                    )}
                  </div>

                  <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5">
                    {app.resume_url && (
                      <Button variant="ghost" size="sm" asChild>
                        <a href={app.resume_url} target="_blank" rel="noopener noreferrer">
                          <FileText className="mr-1 h-3.5 w-3.5" />
                          Resume
                        </a>
                      </Button>
                    )}

                    {app.status === 'promoted' && app.promoted_candidate_id ? (
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/hr/recruitment/candidates/${app.promoted_candidate_id}`}>
                          <ExternalLink className="mr-1 h-3.5 w-3.5" />
                          View Candidate
                        </Link>
                      </Button>
                    ) : (
                      <>
                        {app.status === 'pending' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => handleReview(app, 'reviewed')}
                          >
                            <Eye className="mr-1 h-3.5 w-3.5" />
                            Reviewed
                          </Button>
                        )}
                        {app.status !== 'shortlisted' && app.status !== 'rejected' && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => handleReview(app, 'shortlisted')}
                          >
                            <Star className="mr-1 h-3.5 w-3.5" />
                            Shortlist
                          </Button>
                        )}
                        {app.status === 'shortlisted' && (
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() => {
                              setPromoteTarget(app);
                              setPromoteEmergency(false);
                            }}
                          >
                            {busy ? (
                              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <ArrowUpRight className="mr-1 h-3.5 w-3.5" />
                            )}
                            Promote
                          </Button>
                        )}
                        {app.status !== 'rejected' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            disabled={busy}
                            onClick={() => {
                              setRejectTarget(app);
                              setRejectNotes('');
                            }}
                          >
                            <XCircle className="mr-1 h-3.5 w-3.5" />
                            Reject
                          </Button>
                        )}
                        {app.status === 'rejected' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => handleReview(app, 'shortlisted')}
                          >
                            <Star className="mr-1 h-3.5 w-3.5" />
                            Re-shortlist
                          </Button>
                        )}
                        {app.status === 'rejected' && isSuperAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40"
                            disabled={busy || purge.isPending}
                            onClick={() => {
                              setPurgeTarget(app);
                              setPurgeConfirm('');
                            }}
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" />
                            Delete
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      {/* Reject dialog — optional notes */}
      <Dialog open={!!rejectTarget} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject application</DialogTitle>
            <DialogDescription>
              Reject {rejectTarget?.first_name} {rejectTarget?.last_name}&apos;s application for
              this posting. You can add an internal note for the record.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-notes">Notes (optional)</Label>
            <Textarea
              id="reject-notes"
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              placeholder="Reason for rejection…"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={review.isPending}
              onClick={() =>
                rejectTarget && handleReview(rejectTarget, 'rejected', rejectNotes.trim() || undefined)
              }
            >
              {review.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Reject Application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Promote dialog — confirm entry into the approval pipeline */}
      <Dialog
        open={!!promoteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setPromoteTarget(null);
            setPromoteEmergency(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Promote to approval pipeline</DialogTitle>
            <DialogDescription>
              This creates a recruitment candidate for {promoteTarget?.first_name}{' '}
              {promoteTarget?.last_name} and starts the approval chain configured for this
              job&apos;s role category. The application can no longer be screened afterwards.
            </DialogDescription>
          </DialogHeader>
          <label className="flex items-start gap-2.5 rounded-lg border p-3 text-sm">
            <Checkbox
              checked={promoteEmergency}
              onCheckedChange={(v) => setPromoteEmergency(v === true)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Emergency hire</span>
              <span className="block text-xs text-muted-foreground">
                Bypasses the multi-step approval chain (single-step approval).
              </span>
            </span>
          </label>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPromoteTarget(null);
                setPromoteEmergency(false);
              }}
            >
              Cancel
            </Button>
            <Button disabled={promote.isPending} onClick={handlePromote}>
              {promote.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Promote Candidate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permanent delete — super admin only, irreversible, typed confirmation */}
      <Dialog
        open={!!purgeTarget}
        onOpenChange={(open) => {
          if (!open) {
            setPurgeTarget(null);
            setPurgeConfirm('');
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-4 w-4" />
              Delete {purgeTarget?.first_name} {purgeTarget?.last_name} permanently
            </DialogTitle>
            <DialogDescription>
              This erases every record of this applicant. It cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <span className="block font-medium">The following will be destroyed:</span>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
                <li>Application details — name, email, phone, qualification, experience</li>
                <li>Screening notes and decision history</li>
                {purgeTarget?.resume_url && <li>The resume file in Google Drive</li>}
              </ul>
            </AlertDescription>
          </Alert>

          <div className="space-y-1.5">
            <Label htmlFor="purge-confirm">
              Type <span className="font-mono font-semibold">DELETE</span> to confirm
            </Label>
            <Input
              id="purge-confirm"
              value={purgeConfirm}
              onChange={(e) => setPurgeConfirm(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPurgeTarget(null);
                setPurgeConfirm('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!purgeArmed || purge.isPending}
              onClick={handlePurge}
            >
              {purge.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
