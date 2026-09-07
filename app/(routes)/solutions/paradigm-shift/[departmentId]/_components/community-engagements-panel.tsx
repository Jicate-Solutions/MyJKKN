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
import {
  useCommunityEngagements,
  useDecideCommunityEngagement,
  type CommunityEngagement,
} from '@/hooks/solutions/use-community-engagements';
import {
  ENGAGEMENT_STATUS_LABELS,
  EngagementRegisterMissingError,
  describeSdgGoal,
  shortSdgLabel,
  type EngagementApprovalStatus,
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

export function CommunityEngagementsPanel({
  departmentId,
  institutionId,
  departmentName,
}: CommunityEngagementsPanelProps) {
  const { can, isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const { data, isLoading, error } = useCommunityEngagements(departmentId);
  const decide = useDecideCommunityEngagement();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const canView = isSuperAdmin || can('solutions.societal.view');
  // The INSERT policy accepts EITHER key, so the button must too — gating on
  // `record` alone would hide the form from every faculty member the submit key
  // was created for.
  const canRecord =
    isSuperAdmin || can('solutions.societal.record') || can('solutions.societal.submit');
  const canApprove = isSuperAdmin || can('solutions.societal.approve');

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

  // Rule 27 — a reader without the view key is told so by name, not shown an
  // empty list that reads as "this department has done nothing".
  if (!canView) {
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
              Viewing recorded community work needs the{' '}
              <code className="text-xs">solutions.societal.view</code> permission. Ask your
              Solutions Hub administrator to grant it for your role.
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

  const engagements: CommunityEngagement[] = data ?? [];
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
      await decide.mutateAsync({ engagementId, decision, reviewNote: note ?? null });
      toast.success(
        decision === 'approved'
          ? 'Approved. This department now counts as active on non-revenue work.'
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
        {canRecord && (
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Record an engagement
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {!canRecord && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              You can read this register but not add to it. Recording needs{' '}
              <code className="text-xs">solutions.societal.submit</code> — ask your Solutions Hub
              administrator.
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

        {engagements.length > 0 && (
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
            <p className="text-sm font-medium text-foreground">Nothing recorded yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              This register is empty for {departmentName}. If work has been done — a camp, a free
              clinic, a school programme — record it here so it counts. An empty register can also
              mean the entries belong to an institution your role cannot see.
            </p>
            {canRecord && (
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

      {canRecord && (
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
