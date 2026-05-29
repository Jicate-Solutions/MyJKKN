'use client';

import { useBillableAmenities } from '@/hooks/campus-living/use-billable-amenities';
import { CrudRowActions } from '@/components/shared/crud-master/crud-row-actions';
import { BillableAmenityFormDialog } from './billable-amenity-form-dialog';
import type {
  BillableAmenity,
  FeeCalculationType,
} from '@/types/billable-amenities';

interface BillableAmenityRowActionsProps {
  billableAmenity: BillableAmenity;
}

const FEE_TYPE_LABEL: Record<FeeCalculationType, string> = {
  ac_per_room_active_share: 'AC (per-room active share)',
  per_resident_flat: 'Flat (per resident)',
  per_room_flat: 'Flat (per room)',
};

function BillableAmenityEditDialogAdapter({
  open,
  onOpenChange,
  mode,
  entity,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'edit';
  entity: BillableAmenity;
}) {
  return (
    <BillableAmenityFormDialog
      open={open}
      onOpenChange={onOpenChange}
      mode={mode}
      billableAmenity={entity}
    />
  );
}

function BillableAmenityDetails({ entity }: { entity: BillableAmenity }) {
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

      <div className='text-muted-foreground'>Fee Type:</div>
      <div>
        {FEE_TYPE_LABEL[entity.fee_calculation_type] ??
          entity.fee_calculation_type}
      </div>

      <div className='text-muted-foreground'>Commitment (months):</div>
      <div>{entity.commitment_months}</div>

      <div className='text-muted-foreground'>Late-joiner Min:</div>
      <div>{entity.late_joiner_min_months}</div>

      <div className='text-muted-foreground'>Upfront Required:</div>
      <div>{entity.upfront_required ? 'Yes' : 'No'}</div>

      <div className='text-muted-foreground'>Refund Mode:</div>
      <div>{entity.refund_mode}</div>

      <div className='text-muted-foreground'>Sort Order:</div>
      <div>{entity.sort_order}</div>

      <div className='text-muted-foreground'>Status:</div>
      <div>{entity.is_active ? 'Active' : 'Inactive'}</div>
    </div>
  );
}

export function BillableAmenityRowActions({
  billableAmenity,
}: BillableAmenityRowActionsProps) {
  const { deleteBillableAmenity } = useBillableAmenities();

  return (
    <CrudRowActions<BillableAmenity>
      entity={billableAmenity}
      entityLabel='billable amenity'
      entityDisplayName={(e) => e.name}
      onDelete={deleteBillableAmenity}
      EditDialog={BillableAmenityEditDialogAdapter}
      ViewDetailsRenderer={BillableAmenityDetails}
    />
  );
}
