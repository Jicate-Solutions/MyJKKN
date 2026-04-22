'use client';

import { CrudRowActions } from '@/components/shared/crud-master/crud-row-actions';
import { useDeleteHostelResident } from '@/hooks/campus-living/use-hostel-residents';
import { ResidentFormDialog } from './resident-form-dialog';
import type { HostelResident, HostelResidentWithProfile } from '@/types/hostel-residents';

interface HostelResidentRowActionsProps {
  resident: HostelResidentWithProfile;
}

function ResidentEditDialogAdapter({
  open,
  onOpenChange,
  mode,
  entity,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'edit';
  entity: HostelResident;
}) {
  return (
    <ResidentFormDialog
      open={open}
      onOpenChange={onOpenChange}
      mode={mode}
      resident={entity}
    />
  );
}

function ResidentDetails({ entity }: { entity: HostelResident }) {
  return (
    <div className='grid grid-cols-2 gap-2 text-sm'>
      <div className='text-muted-foreground'>Profile ID:</div>
      <div className='font-mono text-xs'>{entity.profile_id}</div>

      <div className='text-muted-foreground'>Type:</div>
      <div className='capitalize'>{entity.resident_type}</div>

      <div className='text-muted-foreground'>ID Proof:</div>
      <div>
        {entity.id_proof_type || entity.id_proof_number ? (
          <div className='flex flex-col'>
            {entity.id_proof_type && <span>{entity.id_proof_type}</span>}
            {entity.id_proof_number && (
              <span className='font-mono text-xs'>{entity.id_proof_number}</span>
            )}
          </div>
        ) : (
          <span className='text-muted-foreground'>—</span>
        )}
      </div>

      <div className='text-muted-foreground'>Status:</div>
      <div>{entity.is_active ? 'Active' : 'Inactive'}</div>

      {entity.notes && (
        <>
          <div className='text-muted-foreground'>Notes:</div>
          <div>{entity.notes}</div>
        </>
      )}
    </div>
  );
}

export function HostelResidentRowActions({ resident }: HostelResidentRowActionsProps) {
  const deleteMut = useDeleteHostelResident();

  return (
    <CrudRowActions<HostelResidentWithProfile>
      entity={resident}
      entityLabel='resident'
      entityDisplayName={(e) => e.profile?.full_name ?? e.profile_id}
      onDelete={async (id) => {
        await deleteMut.mutateAsync(id);
      }}
      EditDialog={ResidentEditDialogAdapter}
      ViewDetailsRenderer={ResidentDetails}
      deleteImpactHint='Residents with active allocations cannot be hard-deleted (FK restriction). Use Deactivate instead.'
    />
  );
}
