'use client';

import { useAdmissionPackages } from '@/hooks/campus-living/use-admission-packages';
import { CrudRowActions } from '@/components/shared/crud-master/crud-row-actions';
import { PackageFormDialog } from './package-form-dialog';
import type { AdmissionPackage } from '@/types/admission-packages';

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

function row(label: string, value: string | null | undefined) {
  return (
    <>
      <div className='text-muted-foreground'>{label}:</div>
      <div className='font-medium'>{value || '—'}</div>
    </>
  );
}

function PackageDetails({ entity }: { entity: AdmissionPackage }) {
  // A blank dimension is stored as NULL = "applies to all", so show "Any"
  // (not "—") to make clear the value was saved and is intentionally unscoped.
  const communities = entity.community_category_names?.length
    ? entity.community_category_names.join(', ')
    : 'Any';
  const gender =
    entity.gender === 'MALE' ? 'Male'
    : entity.gender === 'FEMALE' ? 'Female'
    : 'Any';
  return (
    <div className='grid grid-cols-2 gap-2 text-sm'>
      {row('Name', entity.name)}
      {row('Type', entity.package_type === 'package' ? 'Bundled Package' : 'Non-Package')}
      {row('Admission Year', entity.admission_year_name ?? 'Any')}
      {row('Degree', entity.degree_name ?? 'Any')}
      {row('Department', entity.department_name ?? 'Any')}
      {row('Programme', entity.programme_name ?? 'Any')}
      {row('Quota', entity.quota_name ?? 'Any')}
      {row('Gender', gender)}
      {row('Community', communities)}
      {row('Room', entity.room_category_name)}
      {row('Mess', entity.mess_category_name ?? 'None')}
      {row('Status', entity.is_active ? 'Active' : 'Inactive')}
      {row('Description', entity.description)}
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
