'use client';
/**
 * Row actions for the Learner Onboarding DataTable.
 *
 * Actions:
 *   - View Detail        → /learners/profiles/[id]
 *   - Complete Profile   → /learners/profiles/[id]/edit?focus=missing (full edit)
 *   - Quick Complete     → side drawer with only the missing fields
 *   - Activate Learner   → admitted + complete only; promotes to active and
 *                          provisions the login (see LearnerProfileService
 *                          .activateIfReady)
 *   - View Bills         → Awaiting Payment rows; /billing/schedule/students/[id]
 *                          in a new tab; billing.schedule.view
 *   - Re-evaluate Status → Awaiting Payment rows whose rule is met but whose
 *                          status did not move; billing.schedule.bulk_create
 *
 * Permissions: requires learners.onboarding.edit (or super admin).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import type { Row } from '@tanstack/react-table';
import { DotsHorizontalIcon } from '@radix-ui/react-icons';
import { Eye, FileEdit, Zap, UserCheck, Loader2, RefreshCw, Receipt, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { usePermissions } from '@/hooks/use-permissions';
import { useActivateLearner } from '@/hooks/use-learner-profiles';
import { OnboardingService } from '@/lib/services/billing/onboarding/onboarding-service';
import { getErrorMessage } from '@/lib/utils';
import { STUCK_REASONS, type OnboardingProfileRow } from '@/types/learner-onboarding';
import { QuickCompleteDrawer } from './quick-complete-drawer';

interface OnboardingRowActionsProps<TData> {
  row: Row<TData>;
}

export function OnboardingRowActions<TData>({ row }: OnboardingRowActionsProps<TData>) {
  const router = useRouter();
  const learner = row.original as OnboardingProfileRow;
  const { isSuperAdmin, canAccess } = usePermissions();
  const canEdit = isSuperAdmin || canAccess('learners', 'onboarding.edit' as any);

  const [quickOpen, setQuickOpen] = useState(false);
  const activateMutation = useActivateLearner();

  const hasMissingFields = learner.missing_count > 0;

  // Offered only where the rule is ALREADY met but the status did not move —
  // re-running the engine is then the whole fix. Same key the billing page's
  // Re-evaluate button uses (bulk_create: create/update are over-granted).
  const canReevaluate = isSuperAdmin || canAccess('billing.schedule', 'bulk_create');
  // Same gate as the billing students list the link lands on.
  const canViewBills = isSuperAdmin || canAccess('billing.schedule', 'view');
  const isStuck =
    !!learner.payment && STUCK_REASONS.includes(learner.payment.blocked_reason);
  const [reevaluating, setReevaluating] = useState(false);

  const handleReevaluate = async () => {
    if (reevaluating) return;
    setReevaluating(true);
    try {
      const result = await OnboardingService.reevaluateStatus(learner.id);
      if (result.updated) {
        toast.success(`Status updated to ${result.finalStatus ?? 'the next stage'}.`);
        router.refresh();
      } else if (result.threshold != null) {
        toast.error(`No change — paid ${result.paidPct ?? 0}%, the next stage needs ${result.threshold}%.`);
      } else {
        toast.error('No change — the learner has not met the criteria for the next stage.');
      }
    } catch (err) {
      toast.error(`Re-evaluation failed: ${getErrorMessage(err)}`);
    } finally {
      setReevaluating(false);
    }
  };

  const handleActivate = async () => {
    // Double-submit guard — the disabled prop alone leaves a ~16ms race window
    // between mutateAsync and the React commit.
    if (activateMutation.isPending) return;

    const name = `${learner.first_name} ${learner.last_name || ''}`.trim();
    try {
      const result = await activateMutation.mutateAsync(learner.id);

      if (!result.activated) {
        toast.error(result.message);
        return;
      }
      // Status committed but login provisioning failed — a partial success that
      // must NOT read as a clean one, or nobody will go fix the missing account.
      if (result.loginCreated) {
        toast.success(`${name} activated — login created.`);
      } else {
        toast.error(`${name} is now active, but the login was NOT created. ${result.message}`);
      }
      router.refresh();
    } catch (err) {
      console.error('[onboarding-row-actions] activation failed:', err);
      toast.error('Activation failed. Please try again.');
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="flex h-8 w-8 p-0 data-[state=open]:bg-muted">
            <DotsHorizontalIcon className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[210px]">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>

          <DropdownMenuItem onSelect={() => router.push(`/learners/profiles/${learner.id}`)}>
            <Eye className="mr-2 h-4 w-4" />
            View Detail
          </DropdownMenuItem>

          {/* Awaiting Payment rows only (the only tier that carries fee data).
              Opens in a new tab so the operator keeps their place in the queue. */}
          {learner.payment && canViewBills && (
            <DropdownMenuItem
              onSelect={() =>
                window.open(
                  `/billing/schedule/students/${learner.id}`,
                  '_blank',
                  'noopener,noreferrer'
                )
              }
            >
              <Receipt className="mr-2 h-4 w-4 text-sky-600" />
              View Bills
              <ExternalLink className="ml-auto h-3 w-3 text-muted-foreground" />
            </DropdownMenuItem>
          )}

          {isStuck && canReevaluate && (
            <DropdownMenuItem
              disabled={reevaluating}
              onSelect={(e) => {
                e.preventDefault();
                void handleReevaluate();
              }}
            >
              {reevaluating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4 text-amber-600" />
              )}
              Re-evaluate Status
            </DropdownMenuItem>
          )}

          {canEdit && (
            <>
              <DropdownMenuSeparator />

              {/* Quick Complete only makes sense while something IS missing —
                  the drawer renders one input per missing field, so on a
                  complete row it would open empty. */}
              {hasMissingFields && (
                <DropdownMenuItem onSelect={() => setQuickOpen(true)}>
                  <Zap className="mr-2 h-4 w-4 text-emerald-500" />
                  Quick Complete
                  <span className="ml-auto text-xs text-muted-foreground">
                    {learner.missing_count}/4
                  </span>
                </DropdownMenuItem>
              )}

              <DropdownMenuItem
                onSelect={() => router.push(`/learners/profiles/${learner.id}/edit?focus=missing`)}
              >
                <FileEdit className="mr-2 h-4 w-4" />
                {hasMissingFields ? 'Complete Profile (Full)' : 'Edit Profile'}
              </DropdownMenuItem>

              {/* Shown only once the row is complete. Disabled (with the reason
                  as a tooltip) rather than hidden when activation is blocked —
                  a reserved learner waiting on fees is a state the operator
                  needs explained, not concealed. */}
              {!hasMissingFields && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={!learner.can_activate || activateMutation.isPending}
                    title={learner.activation_blocked_reason}
                    onSelect={(e) => {
                      e.preventDefault();
                      void handleActivate();
                    }}
                  >
                    {activateMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <UserCheck className="mr-2 h-4 w-4 text-green-600" />
                    )}
                    Activate Learner
                  </DropdownMenuItem>
                </>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Mounted only when there is something to fill, so the drawer's
          per-missing-field effects never run against an empty field list. */}
      {hasMissingFields && (
        <QuickCompleteDrawer
          open={quickOpen}
          onOpenChange={setQuickOpen}
          learner={learner}
        />
      )}
    </>
  );
}
