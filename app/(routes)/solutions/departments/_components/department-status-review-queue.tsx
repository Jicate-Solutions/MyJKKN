'use client';

// department-status-review-queue.tsx
// ---------------------------------------------------------------------------
// The screen where a person decides a proposed dormancy change.
//
// It exists because the decision existed only in the database. On 2026-08-17 a
// sweep moved all 44 solution departments to dormant in one statement and eight
// colleges' work vanished from the Council page. The fix, on 2026-09-02, made
// `update_department_statuses()` write a PROPOSAL into
// `sh_department_status_reviews` instead of changing a status — and then
// nothing rendered that table. A proposal could be written and never acted on,
// which is a quieter version of the same failure.
//
// Two rules shape everything below:
//
//   1. The empty state must be explanatory. A silent blank is what hid the
//      original problem; "no data" here would hide it a second time.
//   2. A refusal must be readable. RLS answers a forbidden SELECT on this table
//      with zero rows rather than an error, so the read permission is checked
//      before the query fires and the missing key is named on screen
//      (CLAUDE.md rule 27).
// ---------------------------------------------------------------------------

import { useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Lock,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useDecideDepartmentStatusReview,
  useDecidedDepartmentStatusReviews,
  useOpenDepartmentStatusReviews,
  type DepartmentStatusReviewWithDetails,
} from '@/hooks/solutions/use-department-status-reviews';

// The two keys the database itself enforces on this table. The SELECT policy on
// `sh_department_status_reviews` and the permission check inside
// `apply_department_status_review()` both name these exactly — see
// supabase/migrations/20261019000000_societal_approval_and_status_review.sql.
// Gating the UI on anything else would draw a button that always fails.
const REVIEW_VIEW_PERMISSION = 'solutions.societal.view';
const REVIEW_DECIDE_PERMISSION = 'solutions.societal.approve';

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  at_risk: 'At risk',
  dormant: 'Dormant',
  pending_approval: 'Pending approval',
};

function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? status;
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'dormant') return 'destructive';
  if (status === 'at_risk') return 'outline';
  return 'default';
}

/**
 * Read a message out of whatever the data layer threw.
 *
 * Supabase rejects with a PostgrestError — a plain object carrying `message`,
 * NOT an `Error` instance. An `err instanceof Error` check therefore misses
 * every database refusal, including the one this screen most needs to show:
 * `apply_department_status_review()` raises "Only a head of department can
 * decide a status review." by name, and falling back to a generic message would
 * leave the person unable to say what to ask an administrator for.
 */
function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === 'string' && m.trim()) return m;
  }
  return fallback;
}

function formatDate(value: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatMonths(months: number) {
  const n = Number(months);
  if (!Number.isFinite(n)) return 'an unknown period';
  if (n < 1) return 'less than a month';
  return `${n} month${n === 1 ? '' : 's'}`;
}

// ============================================
// DECISION DIALOG
// ============================================

function DecisionDialog({
  review,
  apply,
  open,
  onOpenChange,
  onConfirm,
  saving,
}: {
  review: DepartmentStatusReviewWithDetails | null;
  apply: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (note: string) => void;
  saving: boolean;
}) {
  const [note, setNote] = useState('');
  const [dialogKey, setDialogKey] = useState<string | null>(null);

  // Derived-state-during-render, matching the sibling capability register: the
  // note box must be empty on the first paint of a different review, not flash
  // the previous one's text.
  const currentKey = review ? `${review.id}:${apply}` : null;
  if (currentKey !== dialogKey) {
    setDialogKey(currentKey);
    setNote('');
  }

  if (!review) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {apply ? 'Accept this status change' : 'Reject this status change'}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 pt-1">
              <p>
                <span className="font-medium text-foreground">{review.department_name}</span>{' '}
                &mdash; {review.institution_name}
              </p>
              {apply ? (
                <p>
                  Its status moves from {statusLabel(review.current_status)} to{' '}
                  {statusLabel(review.proposed_status)}, and the change is written to the
                  department&rsquo;s status history. Every page that reads department status
                  will show the new value.
                </p>
              ) : (
                <p>
                  The department keeps its current status of{' '}
                  {statusLabel(review.current_status)}. Nothing about the department changes.
                  The next monthly sweep will propose this again if the department is still
                  inactive, so a rejection is not permanent.
                </p>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="status-review-note">Note (optional)</Label>
          <Textarea
            id="status-review-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              apply
                ? 'Why this department really is inactive — anything a reader should know.'
                : 'Why the department is still active despite no recorded activity.'
            }
            rows={3}
          />
          <p className="text-xs text-muted-foreground">
            Stored with the decision and readable by anyone who can open this queue.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant={apply ? 'default' : 'destructive'}
            onClick={() => onConfirm(note)}
            disabled={saving}
          >
            {saving ? 'Saving…' : apply ? 'Accept the change' : 'Reject the change'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================
// MAIN
// ============================================

export function DepartmentStatusReviewQueue() {
  const { toast } = useToast();
  const { can, isLoading: permissionsLoading } = usePermissions();

  const canView = can(REVIEW_VIEW_PERMISSION);
  const canDecide = can(REVIEW_DECIDE_PERMISSION);

  const openQuery = useOpenDepartmentStatusReviews(canView);
  const decidedQuery = useDecidedDepartmentStatusReviews(20, canView);
  const decide = useDecideDepartmentStatusReview();

  const [pending, setPending] = useState<{
    review: DepartmentStatusReviewWithDetails;
    apply: boolean;
  } | null>(null);

  const handleConfirm = async (note: string) => {
    if (!pending) return;
    const { review, apply } = pending;
    try {
      await decide.mutateAsync({ reviewId: review.id, apply, note });
      setPending(null);
      toast({
        title: apply ? 'Status change accepted' : 'Status change rejected',
        description: apply
          ? `${review.department_name} is now ${statusLabel(review.proposed_status)}.`
          : `${review.department_name} stays ${statusLabel(review.current_status)}.`,
      });
    } catch (err: unknown) {
      // The database raises a named exception when the caller lacks
      // solutions.societal.approve. Surface its own words — a generic
      // "something went wrong" would leave the person unable to say what to ask
      // an administrator for.
      toast({
        variant: 'destructive',
        title: 'The decision was not saved',
        description: errorMessage(
          err,
          'The database refused the decision and gave no reason.'
        ),
      });
    }
  };

  // ---- Permission refusal: explained, never a silent empty list -------------
  if (permissionsLoading) {
    return (
      <Card>
        <CardContent className="p-4 space-y-2">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-3 w-80" />
        </CardContent>
      </Card>
    );
  }

  if (!canView) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" />
            Status review queue
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Alert>
            <Lock className="h-4 w-4" />
            <AlertTitle>You do not have access to the status review queue</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>
                Reading proposed dormancy changes needs the{' '}
                <span className="font-mono text-xs">{REVIEW_VIEW_PERMISSION}</span>{' '}
                permission, and deciding one needs{' '}
                <span className="font-mono text-xs">{REVIEW_DECIDE_PERMISSION}</span>. Your
                role has neither, so this section is empty for you — not because there is
                nothing waiting.
              </p>
              <p>
                Ask an administrator to add the permission in Role Management if you are
                meant to decide these.
              </p>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const loading = openQuery.isLoading || decidedQuery.isLoading;
  const error = openQuery.error ?? decidedQuery.error;
  const openReviews = openQuery.data ?? [];
  const decidedReviews = decidedQuery.data ?? [];

  const refresh = () => {
    openQuery.refetch();
    decidedQuery.refetch();
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardContent className="p-4 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-72" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-center space-y-3">
          <p className="text-destructive">Could not load the status review queue</p>
          <p className="text-sm text-muted-foreground">
            {errorMessage(error, 'The database did not say why.')}
          </p>
          <Button variant="outline" onClick={refresh}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" />
              Status review queue
              <Badge variant="secondary" className="text-xs font-normal">
                {openReviews.length} waiting
              </Badge>
            </span>
            <Button variant="ghost" size="sm" onClick={refresh}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <p className="text-sm text-muted-foreground">
            The monthly sweep no longer changes a department&rsquo;s status by itself. It
            proposes a change here, and a person accepts or rejects it. Accepting writes the
            new status and a history entry; rejecting leaves the department exactly as it is.
          </p>

          {!canDecide && openReviews.length > 0 && (
            <Alert>
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>You can read this queue but not decide it</AlertTitle>
              <AlertDescription>
                Accepting or rejecting a proposal needs the{' '}
                <span className="font-mono text-xs">{REVIEW_DECIDE_PERMISSION}</span>{' '}
                permission. The proposals below are shown so you know what is waiting; the
                buttons are hidden because the database would refuse the decision.
              </AlertDescription>
            </Alert>
          )}

          {openReviews.length === 0 ? (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Nothing is waiting on a decision</AlertTitle>
              <AlertDescription>
                No department&rsquo;s computed status currently differs from its recorded
                status, so the sweep has nothing to propose. This is not the same as
                &ldquo;no data&rdquo;: the sweep compares months since the last recorded
                revenue or activity against each department&rsquo;s stored status and writes
                a row here only when the two disagree. A department that is already recorded
                as dormant and is still inactive produces no proposal.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="divide-y">
              {openReviews.map((review) => (
                <div
                  key={review.id}
                  className="py-3 flex items-start justify-between gap-3 flex-wrap sm:flex-nowrap"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {review.department_name}
                      {review.department_code && (
                        <span className="ml-2 text-xs font-mono text-muted-foreground">
                          {review.department_code}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{review.institution_name}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <Badge
                        variant={statusVariant(review.current_status)}
                        className="text-xs font-normal"
                      >
                        {statusLabel(review.current_status)}
                      </Badge>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <Badge
                        variant={statusVariant(review.proposed_status)}
                        className="text-xs font-normal"
                      >
                        {statusLabel(review.proposed_status)}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {formatMonths(review.months_since_activity)} without recorded activity
                      &middot; {review.reason} &middot; computed {formatDate(review.computed_at)}
                    </p>
                  </div>

                  {canDecide && (
                    <div className="flex gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPending({ review, apply: true })}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        Accept
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPending({ review, apply: false })}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recently decided</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {decidedReviews.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No proposal has been decided yet. Once somebody accepts or rejects one, it
              appears here with who decided it and when.
            </p>
          ) : (
            <div className="divide-y">
              {decidedReviews.map((review) => (
                <div key={review.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{review.department_name}</p>
                    <Badge
                      variant={review.decision === 'applied' ? 'success' : 'outline'}
                      className="text-xs font-normal"
                    >
                      {review.decision === 'applied' ? 'Accepted' : 'Rejected'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {statusLabel(review.current_status)} &rarr;{' '}
                      {statusLabel(review.proposed_status)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {review.institution_name} &middot; decided {formatDate(review.decided_at)}
                  </p>
                  {review.decision_note && (
                    <p className="text-xs text-muted-foreground mt-1 italic">
                      &ldquo;{review.decision_note}&rdquo;
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <DecisionDialog
        review={pending?.review ?? null}
        apply={pending?.apply ?? true}
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        onConfirm={handleConfirm}
        saving={decide.isPending}
      />
    </div>
  );
}
