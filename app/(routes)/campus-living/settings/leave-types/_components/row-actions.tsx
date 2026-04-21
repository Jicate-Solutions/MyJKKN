'use client';

// Campus-living hostel leave-type row actions.
// Thin wrapper around <CrudRowActions>. is_system delete-block is handled
// automatically by CrudRowActions' default canDelete.

import { useHostelLeaveTypes } from '@/hooks/campus-living/use-hostel-leave-types';
import { CrudRowActions } from '@/components/shared/crud-master/crud-row-actions';
import { HostelLeaveTypeFormDialog } from './hostel-leave-type-form-dialog';
import type { HostelLeaveType } from '@/types/hostel-leave-types';

interface HostelLeaveTypeRowActionsProps {
  leaveType: HostelLeaveType;
}

function HostelLeaveTypeEditDialogAdapter({
  open,
  onOpenChange,
  mode,
  entity
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'edit';
  entity: HostelLeaveType;
}) {
  return (
    <HostelLeaveTypeFormDialog
      open={open}
      onOpenChange={onOpenChange}
      mode={mode}
      leaveType={entity}
    />
  );
}

function HostelLeaveTypeDetails({ entity }: { entity: HostelLeaveType }) {
  return (
    <>
      <div className='grid grid-cols-2 gap-2 text-sm'>
        <div className='text-muted-foreground'>Code:</div>
        <div className='font-mono'>{entity.leave_type_code}</div>

        <div className='text-muted-foreground'>Color:</div>
        <div className='flex items-center gap-2'>
          <span
            className='w-4 h-4 rounded border'
            style={{ backgroundColor: entity.color_code }}
          />
          <span className='font-mono text-xs'>{entity.color_code}</span>
        </div>

        <div className='text-muted-foreground'>Default Max Days:</div>
        <div>
          {entity.default_max_duration_days == null
            ? 'No limit'
            : `${entity.default_max_duration_days} days`}
        </div>

        <div className='text-muted-foreground'>Advance Notice:</div>
        <div>
          {entity.advance_notice_hours == null
            ? '—'
            : `${entity.advance_notice_hours} hours`}
        </div>

        <div className='text-muted-foreground'>Parent Consent:</div>
        <div>{entity.requires_parent_consent ? 'Required' : 'Not required'}</div>

        <div className='text-muted-foreground'>Chief Warden Approval:</div>
        <div>{entity.requires_chief_warden ? 'Required' : 'Not required'}</div>

        <div className='text-muted-foreground'>Attachment:</div>
        <div>{entity.requires_attachment ? 'Required' : 'Not required'}</div>

        <div className='text-muted-foreground'>Status:</div>
        <div>{entity.is_active ? 'Active' : 'Inactive'}</div>

        <div className='text-muted-foreground'>System Default:</div>
        <div>{entity.is_system ? 'Yes (cannot delete)' : 'No'}</div>
      </div>

      {entity.description && (
        <div className='pt-2 border-t'>
          <div className='text-muted-foreground text-sm mb-1'>Description:</div>
          <p className='text-sm'>{entity.description}</p>
        </div>
      )}
    </>
  );
}

export function HostelLeaveTypeRowActions({
  leaveType
}: HostelLeaveTypeRowActionsProps) {
  const { deleteHostelLeaveType } = useHostelLeaveTypes();

  return (
    <CrudRowActions<HostelLeaveType>
      entity={leaveType}
      entityLabel='hostel leave type'
      entityDisplayName={(e) => e.leave_type_name}
      onDelete={deleteHostelLeaveType}
      EditDialog={HostelLeaveTypeEditDialogAdapter}
      ViewDetailsRenderer={HostelLeaveTypeDetails}
      deleteImpactHint='Existing leave requests using this type will not be affected (leave_type_id will remain set).'
    />
  );
}
