'use client';

import { useAdmissionPackages } from '@/hooks/campus-living/use-admission-packages';
import { CrudRowActions } from '@/components/shared/crud-master/crud-row-actions';
import { PackageFormDialog } from './package-form-dialog';
import type { AdmissionPackage } from '@/types/admission-packages';

const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

function PackageEditDialogAdapter({
  open,
  onOpenChange,
  mode,
  entity,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'edit';
  entity: AdmissionPackage;
}) {
  return (
    <PackageFormDialog
      open={open}
      onOpenChange={onOpenChange}
      mode={mode}
      pkg={entity}
      institutionId={entity.institution_id}
    />
  );
}

function PackageDetails({ entity }: { entity: AdmissionPackage }) {
  return (
    <div className='grid grid-cols-2 gap-2 text-sm'>
      <div className='text-muted-foreground'>Name:</div>
      <div className='font-medium'>{entity.name}</div>

      <div className='text-muted-foreground'>Price:</div>
      <div>{inr(entity.total_price_inr)}</div>

      <div className='text-muted-foreground'>Room (Classic):</div>
      <div>{entity.room_category_name || '—'}</div>

      <div className='text-muted-foreground'>Hostel Year:</div>
      <div>{entity.hostel_year_name || 'All years'}</div>

      <div className='text-muted-foreground'>Status:</div>
      <div>{entity.is_active ? 'Active' : 'Inactive'}</div>
    </div>
  );
}

export function PackageRowActions({ pkg }: { pkg: AdmissionPackage }) {
  const { deletePackage } = useAdmissionPackages();

  return (
    <CrudRowActions<AdmissionPackage>
      entity={pkg}
      entityLabel='package'
      entityDisplayName={(e) => e.name}
      onDelete={deletePackage}
      EditDialog={PackageEditDialogAdapter}
      ViewDetailsRenderer={PackageDetails}
    />
  );
}
