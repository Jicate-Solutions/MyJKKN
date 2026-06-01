'use client';

import { useHostelCategories } from '@/hooks/campus-living/use-hostel-categories';
import { CrudRowActions } from '@/components/shared/crud-master/crud-row-actions';
import { HostelCategoryFormDialog } from './hostel-category-form-dialog';
import { Badge } from '@/components/ui/badge';
import type { HostelCategory } from '@/types/hostel-categories';
import { HOSTEL_CATEGORY_TYPE_LABELS } from '@/types/hostel-categories';

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

      <div className='text-muted-foreground'>Type:</div>
      <div>
        <Badge variant='outline'>
          {HOSTEL_CATEGORY_TYPE_LABELS[entity.type as keyof typeof HOSTEL_CATEGORY_TYPE_LABELS] ?? entity.type}
        </Badge>
      </div>

      <div className='text-muted-foreground'>Sort Order:</div>
      <div>{entity.sort_order}</div>

      <div className='text-muted-foreground'>Status:</div>
      <div>{entity.is_active ? 'Active' : 'Inactive'}</div>
    </div>
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
