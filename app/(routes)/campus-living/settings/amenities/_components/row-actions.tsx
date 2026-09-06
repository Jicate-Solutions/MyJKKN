'use client';

import { useAmenities } from '@/hooks/campus-living/use-amenities';
import { CrudRowActions } from '@/components/shared/crud-master/crud-row-actions';
import { AmenityFormDialog } from './amenity-form-dialog';
import type { Amenity } from '@/types/amenities';

interface AmenityRowActionsProps {
  amenity: Amenity;
}

function AmenityEditDialogAdapter({
  open,
  onOpenChange,
  mode,
  entity,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'edit';
  entity: Amenity;
}) {
  return (
    <AmenityFormDialog
      open={open}
      onOpenChange={onOpenChange}
      mode={mode}
      amenity={entity}
    />
  );
}

function AmenityDetails({ entity }: { entity: Amenity }) {
  return (
    <div className='grid grid-cols-2 gap-2 text-sm'>
      <div className='text-muted-foreground'>Name:</div>
      <div className='font-medium'>{entity.name}</div>

      <div className='text-muted-foreground'>Code:</div>
      <div className='font-mono text-xs'>{entity.code}</div>

      <div className='text-muted-foreground'>Icon:</div>
      <div>{entity.icon || '—'}</div>

      <div className='text-muted-foreground'>Description:</div>
      <div>{entity.description || '—'}</div>

      <div className='text-muted-foreground'>Sort Order:</div>
      <div>{entity.sort_order}</div>

      <div className='text-muted-foreground'>Status:</div>
      <div>{entity.is_active ? 'Active' : 'Inactive'}</div>
    </div>
  );
}

export function AmenityRowActions({ amenity }: AmenityRowActionsProps) {
  const { deleteAmenity } = useAmenities();

  return (
    <CrudRowActions<Amenity>
      entity={amenity}
      entityLabel='amenity'
      entityDisplayName={(e) => e.name}
      onDelete={deleteAmenity}
      EditDialog={AmenityEditDialogAdapter}
      ViewDetailsRenderer={AmenityDetails}
    />
  );
}
