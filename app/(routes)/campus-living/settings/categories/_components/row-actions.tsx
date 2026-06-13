'use client';

import { useState } from 'react';
import { useHostelCategories } from '@/hooks/campus-living/use-hostel-categories';
import { CrudRowActions } from '@/components/shared/crud-master/crud-row-actions';
import { HostelCategoryFormDialog } from './hostel-category-form-dialog';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { HostelCategory } from '@/types/hostel-categories';
import { HOSTEL_CATEGORY_TYPE_LABELS, ALLOCATION_MODE_LABELS } from '@/types/hostel-categories';

interface HostelCategoryRowActionsProps {
  category: HostelCategory;
}

function HostelCategoryEditDialogAdapter({
  open,
  onOpenChange,
  mode,
  entity,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'edit';
  entity: HostelCategory;
}) {
  return (
    <HostelCategoryFormDialog
      open={open}
      onOpenChange={onOpenChange}
      mode={mode}
      category={entity}
    />
  );
}

function HostelCategoryDetails({ entity }: { entity: HostelCategory }) {
  return (
    <div className='grid grid-cols-2 gap-2 text-sm'>
      <div className='text-muted-foreground'>Name:</div>
      <div className='font-medium'>{entity.name}</div>

      <div className='text-muted-foreground'>Description:</div>
      <div>{entity.description || '—'}</div>

      <div className='text-muted-foreground'>Type:</div>
      <div>
        <Badge variant='outline'>
          {HOSTEL_CATEGORY_TYPE_LABELS[entity.type as keyof typeof HOSTEL_CATEGORY_TYPE_LABELS] ?? entity.type}
        </Badge>
      </div>

      <div className='text-muted-foreground'>Allocation Mode:</div>
      <div>
        <Badge variant={entity.allocation_mode === 'auto' ? 'default' : 'outline'}>
          {ALLOCATION_MODE_LABELS[entity.allocation_mode] ?? entity.allocation_mode}
        </Badge>
      </div>

      <div className='text-muted-foreground'>Upgrade Threshold:</div>
      <div>
        {entity.upgrade_threshold_pct != null
          ? `${entity.upgrade_threshold_pct}% of academic bills paid`
          : 'No gate'}
      </div>

      <div className='text-muted-foreground'>Waitlist Hold Days:</div>
      <div>
        {entity.upgrade_hold_days != null
          ? `${entity.upgrade_hold_days} ${entity.upgrade_hold_days === 1 ? 'day' : 'days'}`
          : '—'}
      </div>

      <div className='text-muted-foreground'>Sort Order:</div>
      <div>{entity.sort_order}</div>

      <div className='text-muted-foreground'>Status:</div>
      <div>{entity.is_active ? 'Active' : 'Inactive'}</div>

      <div className='text-muted-foreground'>Created:</div>
      <div>{entity.created_at ? new Date(entity.created_at).toLocaleString() : '—'}</div>

      <div className='text-muted-foreground'>Updated:</div>
      <div>{entity.updated_at ? new Date(entity.updated_at).toLocaleString() : '—'}</div>
    </div>
  );
}

/** Category name rendered as a clickable link that opens the same details
 *  modal as the row's "View Details" action (with Edit chaining). */
export function HostelCategoryNameCell({ category }: { category: HostelCategory }) {
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);

  return (
    <>
      <button
        type='button'
        onClick={() => setShowViewDialog(true)}
        className='font-medium text-left hover:underline'
      >
        {category.name}
      </button>

      <AlertDialog open={showViewDialog} onOpenChange={setShowViewDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{category.name}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className='space-y-3 text-left'>
                <HostelCategoryDetails entity={category} />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowViewDialog(false);
                setShowEditDialog(true);
              }}
            >
              Edit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <HostelCategoryFormDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        mode='edit'
        category={category}
      />
    </>
  );
}

export function HostelCategoryRowActions({
  category,
}: HostelCategoryRowActionsProps) {
  const { deleteHostelCategory } = useHostelCategories();

  return (
    <CrudRowActions<HostelCategory>
      entity={category}
      entityLabel='hostel category'
      entityDisplayName={(e) => e.name}
      onDelete={deleteHostelCategory}
      EditDialog={HostelCategoryEditDialogAdapter}
      ViewDetailsRenderer={HostelCategoryDetails}
      deleteImpactHint='Blocks associated with this category will keep their existing category_id reference.'
    />
  );
}
