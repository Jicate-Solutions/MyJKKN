'use client';

/**
 * The community engagement register for one department — the capture surface
 * whose absence is why 44 activated solution departments have no way to show
 * non-revenue work.
 *
 * Rule 27 runs through the whole file: a reader who cannot see the register,
 * cannot record into it, cannot approve, or whose write the database refuses,
 * is told which of those happened and who can change it. Nothing here fails
 * silently and nothing redirects.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertCircle,
  Check,
  Clock,
  HandHeart,
  Info,
  Plus,
  Users,
  X,
} from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { hasDbAdminBypass } from '@/lib/navigation/permission-filter';
import {
  useCommunityEngagements,
  useDecideCommunityEngagement,
  type CommunityEngagement,
  type DepartmentActivityReadout,
} from '@/hooks/solutions/use-community-engagements';
import {
  DEPARTMENT_STATUS_LABELS,
  ENGAGEMENT_STATUS_LABELS,
  EngagementRegisterMissingError,
  describeSdgGoal,
  shortSdgLabel,
  type EngagementApprovalStatus,
  type SolutionDepartmentStatus,
} from '@/lib/services/solutions/societal-service';
import { RecordEngagementDialog } from './record-engagement-dialog';

interface CommunityEngagementsPanelProps {
  departmentId: string;
  institutionId: string | null;
  departmentName: string;
}

const STATUS_CLASSES: Record<EngagementApprovalStatus, string> = {
  // Status colours are theme-paired and use the 700 ramp in light, which is the
  // only weight that clears 4.5:1 on white (design-system/MASTER.md §6).
  pending: 'text-amber-700 dark:text-amber-400',
  approved: 'text-green-700 dark:text-emerald-400',
  rejected: 'text-red-600 dark:text-red-400',
};

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

/**
 * What to tell the approver, using only what the database confirmed.
 *
 * The previous message — "Approved. This department now counts as active on
 * non-revenue work." — was asserted on a resolved promise and was wrong on three
 * of the trigger's four paths: a department with no `sh_solution_departments`
 * row is returned from early, `last_activity_at` moves under GREATEST so a
 * backdated entry can move nothing, and `status` is only set to 'active' when
 * the previous status was at_risk/dormant AND the work is inside 30 days. The
 * approval is the fact; the consequence is read back, and where it cannot be
 * read, nothing is claimed.
 */
function describeApproval(departmentName: string, activity: DepartmentActivityReadout): string {
  if (activity.kind === 'not_a_solution_department') {
    return (
      `Approved. ${departmentName} is not registered as a solution department, so no ` +
      'dormancy clock is tracking it — the entry is on the record but moves nothing.'
    );
  }

  if (activity.kind === 'unreadable' || activity.kind === 'not_read') {
    return "Approved. Its effect on the department's activity clock could not be read back from here.";
  }

  const label =
    DEPARTMENT_STATUS_LABELS[activity.status as SolutionDepartmentStatus] ?? activity.status;

  if (activity.status === 'at_risk' || activity.status === 'dormant') {
    return (
      `Approved. ${departmentName} is still ${label} — only work dated inside the last ` +
      '30 days lifts a department out of that.'
    );
  }

  return `Approved. ${departmentName}'s status now reads ${label}.`;
}

export function CommunityEngagementsPanel({
  departmentId,
  institutionId,
  departmentName,
}: CommunityEngagementsPanelProps) {
  const { can, isSuperAdmin, isLoading: permissionsLoading, userProfile } = usePermissions();
  const { data, isLoading, error } = useCommunityEngagements(departmentId);
  const decide = useDecideCommunityEngagement();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  // Every policy on sh_community_engagements opens `is_super_admin() OR
  // is_admin() OR ...`, and `is_admin()` covers role IN ('admin','super_admin',
  // 'administrator'). Gating on `isSuperAdmin` alone made this panel STRICTER
  // than the database: an `administrator` was shown "you don't have access to
  // this register" over rows RLS would have handed them. `user_has_permission()`
  // does not close the gap either — it bypasses only `is_super_admin = true`.
  const adminBypass = hasDbAdminBypass(userProfile?.role, isSuperAdmin);

  /**
   * FOUR CAPABILITIES, NOT ONE GATE.
   *
   * Read off the live production grid on 2026-09-07, because the shape of this
   * component depends on it and guessing it wrong locks people out:
   *
   *   submit  — faculty (490) and staff (201). Add YOUR OWN entry. They
   *             deliberately do NOT hold `view`: they are not meant to browse
   *             colleagues' community work.
   *   view    — hod, principal, managing_director, ceo/cbo. Browse the whole
   *             register for the department.
   *   record  — executives only. Enter work on someone else's behalf.
   *   approve — hod and principal only. Decide.
   *
   * The grid is COHERENT; the absence of `view` for faculty and staff is a
   * decision, not a gap. This panel used to return an access-denied card
   * whenever `view` was missing, which locked all 691 submitters out of the one
   * action the submit key exists to give them. So the surface is split by
   * capability: what you can do decides what you see.
   */
  const canView = adminBypass || can('solutions.societal.view');
  const canApprove = adminBypass || can('solutions.societal.approve');
  // The INSERT policy accepts EITHER key, so the form must too — gating on
  // `record` alone would hide it from every faculty member the submit key was
  // created for.
  const canCreate =
    adminBypass || can('solutions.societal.record') || can('solutions.societal.submit');

  if (permissionsLoading || isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Community Engagements</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Rule 27 — named, never silent. But ONLY when there is genuinely nothing
  // this person can do here. Missing `view` on its own is not that: a faculty
  // member holding `submit` has a real action on this page.
  if (!canView && !canCreate && !canApprove) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Community Engagements</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>You don&apos;t have access to this register</AlertTitle>
            <AlertDescription>
              Recording community work needs{' '}
              <code className="text-xs">solutions.societal.submit</code> and browsing what has
              already been recorded needs <code className="text-xs">solutions.societal.view</code>.
              Your role holds neither. Ask your Solutions Hub administrator for whichever one
              matches what you need to do.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const registerMissing = error instanceof EngagementRegisterMissingError;

  if (error && registerMissing) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Community Engagements</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>The register is not installed here yet</AlertTitle>
            <AlertDescription>
              The community engagement table has not been created in this environment. Ask an
              administrator to apply the migration{' '}
              <code className="text-xs">20261013000000_societal_capture_and_activity_clock.sql</code>
              .
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Community Engagements</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>The register could not be read</AlertTitle>
            <AlertDescription>
              {error instanceof Error ? error.message : 'Something went wrong reading the register.'}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const allReturned: CommunityEngagement[] = data ?? [];

  /**
   * A submitter without `view` must never be shown a colleague's entry.
   *
   * RLS is the control, not this line: the SELECT policy requires
   * `solutions.societal.view`, so for a faculty member this array is already
   * empty and the filter removes nothing today. It is here because a UI that
   * would start displaying other people's work the moment a policy widened is a
   * UI trusting the policy to stay narrow. It NARROWS and cannot contradict RLS
   * — it can only ever show fewer rows than the database returned, never more,
   * and it is switched off entirely for anyone who does hold `view`.
   */
  const engagements: CommunityEngagement[] = canView
    ? allReturned
    : allReturned.filter((e) => !!userProfile?.id && e.recorded_by === userProfile.id);

  const approved = engagements.filter((e) => e.approval_status === 'approved');
  const pending = engagements.filter((e) => e.approval_status === 'pending');

  const approvedHours = approved.reduce((sum, e) => sum + e.hours_spent, 0);
  const approvedBeneficiaries = approved.reduce((sum, e) => sum + e.beneficiaries_count, 0);

  const startReject = (id: string) => {
    setRejectingId(id);
    setReviewNote('');
    setActionError(null);
  };

  const runDecision = async (
    engagementId: string,
    decision: 'approved' | 'rejected',
    note?: string
  ) => {
    setActionError(null);
    try {
      const outcome = await decide.mutateAsync({
        engagementId,
        decision,
        reviewNote: note ?? null,
      });
      toast.success(
        decision === 'approved'
          ? describeApproval(departmentName, outcome.department_activity)
          : 'Marked as not approved. The person who recorded it can see your note.'
      );
      setRejectingId(null);
      setReviewNote('');
    } catch (err: unknown) {
      // Rule 27 — the database's own refusal, including the self-approval
      // guard's sentence, is shown rather than swallowed.
      setActionError(err instanceof Error ? err.message : 'The decision could not be saved.');
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base">Community Engagements</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Work {departmentName} did for the community that carried no invoice. Only approved
            entries keep the department out of dormancy.
          </p>
        </div>
        {canCreate && (
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Record an engagement
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {canView && !canCreate && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              You can read this register but not add to it. Recording needs{' '}
              <code className="text-xs">solutions.societal.submit</code> — ask your Solutions Hub
              administrator.
            </AlertDescription>
          </Alert>
        )}

        {!canView && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>You can record community work here, not browse it</AlertTitle>
            <AlertDescription>
              This panel shows your own entries only, never anyone else&apos;s. Browsing the whole
              register needs <code className="text-xs">solutions.societal.view</code>, which your
              role does not hold, on purpose. What you record waits for a head of department to
              approve it, and only an approved entry counts towards the department&apos;s activity.
              {canApprove
                ? ' Your approve permission has nothing to act on here for the same reason.'
                : ''}
            </AlertDescription>
          </Alert>
        )}

        {actionError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>That did not go through</AlertTitle>
            <AlertDescription>{actionError}</AlertDescription>
          </Alert>
        )}

        {/*
          Gated on `canView`, not on the array being non-empty. Without `view`
          this list is what RLS let through for one person, and totalling it into
          "Approved · Approved hours · People reached" would present one
          submitter's slice as the department's figure — the same fake zero this
          feature exists to stop, wearing a different number.
        */}
        {canView && engagements.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border bg-card p-3 shadow-sm dark:shadow-none">
              <div className="flex items-center gap-2 mb-1">
                <HandHeart className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Approved
                </span>
              </div>
              <p className="text-2xl font-bold text-foreground">{approved.length}</p>
            </div>
            <div className="rounded-xl border bg-card p-3 shadow-sm dark:shadow-none">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Approved hours
                </span>
              </div>
              <p className="text-2xl font-bold text-foreground">{formatHours(approvedHours)}</p>
            </div>
            <div className="rounded-xl border bg-card p-3 shadow-sm dark:shadow-none">
              <div className="flex items-center gap-2 mb-1">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  People reached
                </span>
              </div>
              <p className="text-2xl font-bold text-foreground">
                {approvedBeneficiaries.toLocaleString('en-IN')}
              </p>
            </div>
          </div>
        )}

        {pending.length > 0 && canApprove && (
          <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30">
            <Clock className="h-4 w-4 text-amber-700 dark:text-amber-400" />
            <AlertTitle className="text-amber-800 dark:text-amber-300">
              {pending.length} entr{pending.length === 1 ? 'y is' : 'ies are'} waiting for you
            </AlertTitle>
            <AlertDescription className="text-amber-700 dark:text-amber-400">
              Nothing counts towards this department&apos;s activity until it is approved.
            </AlertDescription>
          </Alert>
        )}

        {engagements.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center">
            <HandHeart className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            {canView ? (
              <>
                <p className="text-sm font-medium text-foreground">Nothing recorded yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  This register is empty for {departmentName}. If work has been done — a camp, a
                  free clinic, a school programme — record it here so it counts. An empty register
                  can also mean the entries belong to an institution your role cannot see.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-foreground">
                  You have not recorded anything here yet
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  This panel lists your own entries for {departmentName} — a camp, a free clinic, a
                  school programme. Entries recorded by other people are not shown, because
                  browsing the whole register needs{' '}
                  <code className="text-xs">solutions.societal.view</code>.
                </p>
              </>
            )}
            {canCreate && (
              <Button className="mt-4" size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Record the first one
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {engagements.map((engagement) => (
              <div key={engagement.id} className="py-3 space-y-2">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{engagement.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(engagement.engagement_date)} &bull;{' '}
                      {formatHours(engagement.hours_spent)} hour
                      {engagement.hours_spent === 1 ? '' : 's'} &bull;{' '}
                      {engagement.beneficiaries_count.toLocaleString('en-IN')} reached
                      {engagement.recorded_by_name ? ` • by ${engagement.recorded_by_name}` : ''}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-medium shrink-0 ${STATUS_CLASSES[engagement.approval_status]}`}
                  >
                    {ENGAGEMENT_STATUS_LABELS[engagement.approval_status]}
                  </span>
                </div>

                {engagement.description && (
                  <p className="text-sm text-muted-foreground">{engagement.description}</p>
                )}

                {engagement.solution_title && (
                  <p className="text-xs text-muted-foreground">
                    Linked solution: {engagement.solution_title}
                  </p>
                )}

                {engagement.sdg_goals.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {engagement.sdg_goals.map((code) => (
                      <Badge
                        key={code}
                        variant="outline"
                        className="text-xs font-normal"
                        title={describeSdgGoal(code)}
                      >
                        {shortSdgLabel(code)}
                      </Badge>
                    ))}
                  </div>
                )}

                {engagement.review_note && (
                  <p className="text-xs text-muted-foreground">
                    Reviewer&apos;s note: {engagement.review_note}
                    {engagement.approved_by_name ? ` — ${engagement.approved_by_name}` : ''}
                  </p>
                )}

                {engagement.approval_status === 'pending' && canApprove && (
                  <div className="space-y-2">
                    {rejectingId === engagement.id ? (
                      <div className="space-y-2">
                        <Textarea
                          value={reviewNote}
                          onChange={(e) => setReviewNote(e.target.value)}
                          rows={2}
                          placeholder="Say why it was not approved, so it can be corrected."
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={decide.isPending || !reviewNote.trim()}
                            onClick={() => runDecision(engagement.id, 'rejected', reviewNote)}
                          >
                            Confirm not approved
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={decide.isPending}
                            onClick={() => setRejectingId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={decide.isPending}
                          onClick={() => runDecision(engagement.id, 'approved')}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={decide.isPending}
                          onClick={() => startReject(engagement.id)}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Not approved
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {engagement.approval_status === 'pending' && !canApprove && (
                  <p className="text-xs text-muted-foreground">
                    A head of department has to approve this before it counts. You cannot approve
                    your own entry.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {canCreate && (
        <RecordEngagementDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          departmentId={departmentId}
          institutionId={institutionId}
        />
      )}
    </Card>
  );
}
