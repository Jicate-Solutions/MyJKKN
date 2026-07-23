'use client';
/**
 * Row actions for the Learner Onboarding DataTable.
 *
 * Actions:
 *   - View Detail        → /learners/profiles/[id]
 *   - Complete Profile   → /learners/profiles/[id]/edit?focus=missing (full edit)
 *   - Quick Complete     → opens a side drawer with only the missing fields
 *
 * Permissions: requires learners.onboarding.edit (or super admin).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Row } from '@tanstack/react-table';
import { DotsHorizontalIcon } from '@radix-ui/react-icons';
import { Eye, FileEdit, Zap } from 'lucide-react';
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
              <DropdownMenuItem onSelect={() => setQuickOpen(true)}>
                <Zap className="mr-2 h-4 w-4 text-emerald-500" />
                Quick Complete
                <span className="ml-auto text-xs text-muted-foreground">
                  {learner.missing_count}/4
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => router.push(`/learners/profiles/${learner.id}/edit?focus=missing`)}
              >
                <FileEdit className="mr-2 h-4 w-4" />
                Complete Profile (Full)
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <QuickCompleteDrawer
        open={quickOpen}
        onOpenChange={setQuickOpen}
        learner={learner}
      />
    </>
  );
}
