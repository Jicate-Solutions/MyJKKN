'use client';

import { useMessCategories } from '@/hooks/campus-living/use-mess-categories';
import { CrudRowActions } from '@/components/shared/crud-master/crud-row-actions';
import { MessCategoryFormDialog } from './mess-category-form-dialog';
import { Badge } from '@/components/ui/badge';
import type { MessCategory } from '@/types/mess-categories';
import { MESS_CATEGORY_TYPE_LABELS } from '@/types/mess-categories';

interface MessCategoryRowActionsProps {
  category: MessCategory;
}

function MessCategoryEditDialogAdapter({
  open,
  onOpenChange,
  mode,
  entity,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'edit';
  entity: MessCategory;
}) {
  return (
    <MessCategoryFormDialog
      open={open}
      onOpenChange={onOpenChange}
      mode={mode}
      category={entity}
    />
  );
}

function MessCategoryDetails({ entity }: { entity: MessCategory }) {
  return (
    <div className='grid grid-cols-2 gap-2 text-sm'>
      <div className='text-muted-foreground'>Name:</div>
      <div className='font-medium'>{entity.name}</div>

      <div className='text-muted-foreground'>Description:</div>
      <div>{entity.description || '—'}</div>

      <div className='text-muted-foreground'>Type:</div>
      <div>
        <Badge variant='outline'>
          {MESS_CATEGORY_TYPE_LABELS[entity.type] ?? entity.type}
        </Badge>
      </div>

      <div className='text-muted-foreground'>Sort Order:</div>
      <div>{entity.sort_order}</div>

      <div className='text-muted-foreground'>Status:</div>
      <div>{entity.is_active ? 'Active' : 'Inactive'}</div>
    </div>
  );
}

export function MessCategoryRowActions({
  category,
}: MessCategoryRowActionsProps) {
  const { deleteMessCategory } = useMessCategories();

  return (
    <CrudRowActions<MessCategory>
      entity={category}
      entityLabel='mess category'
      entityDisplayName={(e) => e.name}
      onDelete={deleteMessCategory}
      EditDialog={MessCategoryEditDialogAdapter}
      ViewDetailsRenderer={MessCategoryDetails}
    />
  );
}
