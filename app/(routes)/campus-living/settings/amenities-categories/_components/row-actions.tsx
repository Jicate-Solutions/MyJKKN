'use client';

import { useAmenitiesCategories } from '@/hooks/campus-living/use-amenities-categories';
import { CrudRowActions } from '@/components/shared/crud-master/crud-row-actions';
import { AmenitiesCategoryFormDialog } from './amenities-category-form-dialog';
import type { AmenitiesCategory } from '@/types/amenities-categories';

interface AmenitiesCategoryRowActionsProps {
  category: AmenitiesCategory;
}

function AmenitiesCategoryEditDialogAdapter({
  open,
  onOpenChange,
  mode,
  entity,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'edit';
  entity: AmenitiesCategory;
}) {
  return (
    <AmenitiesCategoryFormDialog
      open={open}
      onOpenChange={onOpenChange}
      mode={mode}
      category={entity}
    />
  );
}

function AmenitiesCategoryDetails({ entity }: { entity: AmenitiesCategory }) {
  return (
    <div className='grid grid-cols-2 gap-2 text-sm'>
      <div className='text-muted-foreground'>Name:</div>
      <div className='font-medium'>{entity.name}</div>

      <div className='text-muted-foreground'>Description:</div>
      <div>{entity.description || '—'}</div>

      <div className='text-muted-foreground'>Sort Order:</div>
      <div>{entity.sort_order}</div>

      <div className='text-muted-foreground'>Status:</div>
      <div>{entity.is_active ? 'Active' : 'Inactive'}</div>
    </div>
  );
}

export function AmenitiesCategoryRowActions({
  category,
}: AmenitiesCategoryRowActionsProps) {
  const { deleteAmenitiesCategory } = useAmenitiesCategories();

  return (
    <CrudRowActions<AmenitiesCategory>
      entity={category}
      entityLabel='amenities category'
      entityDisplayName={(e) => e.name}
      onDelete={deleteAmenitiesCategory}
      EditDialog={AmenitiesCategoryEditDialogAdapter}
      ViewDetailsRenderer={AmenitiesCategoryDetails}
    />
  );
}
