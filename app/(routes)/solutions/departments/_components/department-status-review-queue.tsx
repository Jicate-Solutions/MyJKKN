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
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { ADMIN_BYPASS_ROLES } from '@/lib/navigation/permission-filter';
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

/**
 * The database's own bypass, which both enforcement sites open with:
 * `is_super_admin() OR is_admin() OR ...`. `is_admin()` reads
 * `profiles.role`, so a UI gate that only checked the permission key refused
 * people the database would have accepted.
 *
 * Verified against production on 2026-09-07 by calling the live function:
 * `is_admin()` returned true for role `admin` (1 profile), `administrator`
 * (2 profiles) and `super_admin` (15) — the first two with
 * `is_super_admin = false`, so `usePermissions().isSuperAdmin` does not cover
 * them. Those three people were being told they had no access to a queue the
 * database would have let them read and decide.
 *
 * ADMIN_BYPASS_ROLES is imported rather than restated: it is the same list the
 * route guard on this very page already uses (`isPageAccessible` →
 * `hasAdminBypass`). Two copies of a bypass list is how they drift apart.
 */

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
  const {
    can,
    isSuperAdmin,
    userProfile,
    isLoading: permissionsLoading,
  } = usePermissions();
  const {
    getAccessibleInstitutionIds,
    loading: accessLoading,
    error: accessError,
  } = useUserInstitutionAccess();

  // The database bypasses on `is_super_admin() OR is_admin()` before it looks
  // at any permission key, so the screen must too — see ADMIN_BYPASS_ROLES.
  const isDatabaseAdmin =
    isSuperAdmin || ADMIN_BYPASS_ROLES.includes(userProfile?.role ?? '');

  const canView = isDatabaseAdmin || can(REVIEW_VIEW_PERMISSION);
  const canDecide = isDatabaseAdmin || can(REVIEW_DECIDE_PERMISSION);

  // ---- Institution scope --------------------------------------------------
  // Neither RLS policy on this path carries an institution predicate: the
  // reviews SELECT policy checks only the permission key, and
  // `sh_solution_departments_select` is `USING (true)`. So the narrowing has
  // to happen here or it does not happen at all. The ids come from
  // `get_user_accessible_institutions` — own campus UNION active
  // `user_institution_access` grants UNION every active institution when a
  // role carries `institution_scope = 'all'` — which is the same union
  // `role_has_institution_access()` applies inside the database.
  const accessibleInstitutionIds = getAccessibleInstitutionIds();

  // Database admins are not narrowed, because the database does not narrow
  // them either. Everyone else is filtered to what they may see.
  const institutionIds = isDatabaseAdmin ? null : accessibleInstitutionIds;

  // An empty id list while signed in is ambiguous — a reader with no grants
  // looks exactly like a read that has not answered — so the queue does not
  // fire until the scope is known. Failing closed here means a scope we could
  // not establish shows an explanation, never every college's proposals.
  const scopeKnown =
    isDatabaseAdmin ||
    (!accessLoading && !accessError && accessibleInstitutionIds.length > 0);

  const queriesEnabled = canView && scopeKnown;

  const openQuery = useOpenDepartmentStatusReviews(queriesEnabled, institutionIds);
  const decidedQuery = useDecidedDepartmentStatusReviews(
    20,
    queriesEnabled,
    institutionIds
  );
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
  if (permissionsLoading || accessLoading) {
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

  // ---- Scope refusal: also explained, and it fails closed ------------------
  if (!scopeKnown) {
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
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>We could not work out which colleges you may see</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>
                This queue is narrowed to the colleges your account has access to, and
                that list came back{' '}
                {accessError ? 'with an error' : 'empty'}. Rather than showing you every
                college&rsquo;s proposals, nothing is loaded.
              </p>
              {accessError && (
                <p className="text-xs font-mono break-words">{accessError}</p>
              )}
              <p>
                If you should be able to see this, ask an administrator to check your
                institution access in Role Management.
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
            {!isDatabaseAdmin && ' You are seeing proposals for the colleges your account has access to, not every college.'}
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
              <AlertTitle>No proposals are waiting on a decision</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>
                  There is no undecided proposal recorded for the colleges you can see.
                  That is all this screen can tell you: it reads proposals, it does not
                  recompute any department&rsquo;s status, so an empty queue is not
                  evidence that every department&rsquo;s status is correct.
                </p>
                <p>
                  Proposals are written by a scheduled sweep
                  (&nbsp;<span className="font-mono text-xs">update_department_statuses()</span>&nbsp;),
                  which compares months since recorded activity against each
                  department&rsquo;s stored status and records a row here when the two
                  disagree. If that sweep has not run, this queue stays empty whatever
                  the departments look like.
                </p>
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
                    {review.institution_name} &middot; decided by{' '}
                    {review.decided_by_name ?? 'Unknown user'} on{' '}
                    {formatDate(review.decided_at)}
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
