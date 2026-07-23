'use client';

import { CrudRowActions } from '@/components/shared/crud-master/crud-row-actions';
import { useDeleteHostelWarden } from '@/hooks/campus-living/use-hostel-wardens';
import { WardenFormDialog } from './warden-form-dialog';
import type { HostelWardenWithRefs } from './columns';
import type { HostelWarden } from '@/types/campus-living';

interface HostelWardenRowActionsProps {
  warden: HostelWardenWithRefs;
}

const designationLabel: Record<string, string> = {
  chief_warden: 'Chief Warden',
  warden: 'Warden',
  deputy_warden: 'Deputy Warden',
  floor_supervisor: 'Floor Supervisor',
  night_watcher: 'Night Watcher',
};

function WardenEditDialogAdapter({
  open,
  onOpenChange,
  mode,
  entity,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'edit';
  entity: HostelWarden;
}) {
  return (
    <WardenFormDialog
      open={open}
      onOpenChange={onOpenChange}
      mode={mode}
      warden={entity}
    />
  );
}

function WardenDetails({ entity }: { entity: HostelWardenWithRefs }) {
  return (
    <div className='grid grid-cols-2 gap-2 text-sm'>
      <div className='text-muted-foreground'>Designation:</div>
      <div>{designationLabel[entity.designation] ?? entity.designation}</div>

      <div className='text-muted-foreground'>Phone:</div>
      <div className='font-mono text-xs'>{entity.phone}</div>

      <div className='text-muted-foreground'>Block:</div>
      <div>
        {entity.hostel_blocks?.name ? (
          <div className='flex flex-col'>
            <span>{entity.hostel_blocks.name}</span>
            {entity.hostel_blocks.code && (
              <span className='font-mono text-xs text-muted-foreground'>
                {entity.hostel_blocks.code}
              </span>
            )}
          </div>
        ) : (
          <span className='text-muted-foreground'>Unassigned</span>
        )}
      </div>

      <div className='text-muted-foreground'>Shift:</div>
      <div className='capitalize'>{entity.shift ? entity.shift.replace('_', ' ') : '—'}</div>

      <div className='text-muted-foreground'>Floors:</div>
      <div>
        {entity.assigned_floors && entity.assigned_floors.length > 0
          ? entity.assigned_floors.join(', ')
          : '—'}
      </div>

      <div className='text-muted-foreground'>Residential:</div>
      <div>{entity.is_residential ? 'Yes' : 'No'}</div>

      <div className='text-muted-foreground'>Status:</div>
      <div>{entity.is_active ? 'Active' : 'Relieved'}</div>

      <div className='text-muted-foreground'>Assigned at:</div>
      <div className='font-mono text-xs'>
        {new Date(entity.assigned_at).toLocaleString()}
      </div>

      {entity.relieved_at && (
        <>
          <div className='text-muted-foreground'>Relieved at:</div>
          <div className='font-mono text-xs'>
            {new Date(entity.relieved_at).toLocaleString()}
          </div>
        </>
      )}
    </div>
  );
}

export function HostelWardenRowActions({ warden }: HostelWardenRowActionsProps) {
  const deleteMut = useDeleteHostelWarden();

  return (
    <CrudRowActions<HostelWardenWithRefs>
      entity={warden}
      entityLabel='warden'
      entityDisplayName={(e) => e.staff_name ?? e.staff_id}
      onDelete={async (id) => {
        await deleteMut.mutateAsync(id);
      }}
      EditDialog={WardenEditDialogAdapter}
      ViewDetailsRenderer={WardenDetails}
      deleteImpactHint='Removing a warden cuts their access to block operations. Prefer relieving (setting Inactive) to preserve audit history.'
    />
  );
}
