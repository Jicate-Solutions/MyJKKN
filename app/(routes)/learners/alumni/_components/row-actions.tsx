'use client';

import { Row } from '@tanstack/react-table';
import { MoreHorizontal, Eye, FileEdit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { useRouter } from 'next/navigation';
import { usePermissions } from '@/hooks/use-permissions';
import type { LearnerProfile } from '@/types/learner-profile';

interface DataTableRowActionsProps {
  row: Row<LearnerProfile>;
}

export function DataTableRowActions({ row }: DataTableRowActionsProps) {
  const router = useRouter();
  const { canAccess, isSuperAdmin } = usePermissions();
  const learner = row.original;

  const canView = isSuperAdmin || canAccess('learners', 'view');
  const canEdit = isSuperAdmin || canAccess('learners', 'edit');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          className='flex h-8 w-8 p-0 data-[state=open]:bg-muted'
        >
          <MoreHorizontal className='h-4 w-4' />
          <span className='sr-only'>Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-[160px]'>
        {canView && (
          <DropdownMenuItem
            onClick={() => router.push(`/learners/alumni/${learner.id}`)}
          >
            <Eye className='mr-2 h-4 w-4' />
            View Details
          </DropdownMenuItem>
        )}

        {canEdit && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => router.push(`/learners/alumni/${learner.id}/edit`)}
            >
              <FileEdit className='mr-2 h-4 w-4' />
              Edit
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
