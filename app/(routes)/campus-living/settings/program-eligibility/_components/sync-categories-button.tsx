'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { usePermissions } from '@/hooks/use-permissions';
import { useSyncLearnerCategories } from '@/hooks/campus-living/use-program-eligibility';

/**
 * Applies the fee-condition (Category Eligibility) rules to learner profiles:
 * for every active hosteler who already has an academic bill, it resolves the
 * room + mess category from the matching fee band and writes them onto
 * learners_profiles. Allocated learners keep their physical room's category;
 * existing values are overwritten when the band changes, never wiped to NULL.
 * Idempotent — safe to re-run after generating bills or editing rules.
 */
export function SyncCategoriesButton() {
  const { isSuperAdmin, can } = usePermissions();
  const sync = useSyncLearnerCategories();
  const [open, setOpen] = useState(false);

  // Mirror the RPC's own campus_living.settings.edit gate so the button only
  // shows for users who can actually run it.
  if (!isSuperAdmin && !can('campus_living.settings.edit')) return null;

  const handleConfirm = async () => {
    if (sync.isPending) return; // guard the mutateAsync/commit race (double-click)
    try {
      const { scanned, updated } = await sync.mutateAsync(null);
      toast.success(
        `Synced fee-condition categories — updated ${updated} of ${scanned} bill student${
          scanned === 1 ? '' : 's'
        }.`
      );
      setOpen(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to sync learner categories.'
      );
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant='outline' disabled={sync.isPending}>
          <RefreshCw
            className={`h-4 w-4 mr-2 ${sync.isPending ? 'animate-spin' : ''}`}
          />
          Sync to Learner Profiles
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Apply fee conditions to learner profiles?</AlertDialogTitle>
          <AlertDialogDescription>
            For every active hosteler who already has an academic bill, this resolves
            the room and mess category from the matching fee band and writes them onto
            the learner profile. Allocated learners keep their assigned room&apos;s
            category. Learners whose fee matches no band are left unchanged. You can
            re-run this any time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={sync.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault(); // keep the dialog open until the RPC resolves
              handleConfirm();
            }}
            disabled={sync.isPending}
          >
            {sync.isPending ? 'Syncing…' : 'Sync now'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
