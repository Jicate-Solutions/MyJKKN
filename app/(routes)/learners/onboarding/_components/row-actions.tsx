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
 *
 * Permissions: requires learners.onboarding.edit (or super admin).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import type { Row } from '@tanstack/react-table';
import { DotsHorizontalIcon } from '@radix-ui/react-icons';
import { Eye, FileEdit, Zap, UserCheck, Loader2 } from 'lucide-react';
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
import type { OnboardingProfileRow } from '@/types/learner-onboarding';
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
