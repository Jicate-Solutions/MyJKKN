'use client';

// Academic leave-types row actions.
// Before PR-3a this was 167 LOC of dropdown + dialogs. Now a thin wrapper
// around <CrudRowActions> — all generic dropdown/dialog logic lives in
// components/shared/crud-master/. Academic-specific pieces that stay here:
//   - hook binding (useLeaveTypes.deleteLeaveType)
//   - bespoke View Details renderer (color swatch + field grid)
//   - domain EditDialog (LeaveTypeFormDialog) wrapper adapting entity→leaveType prop

import { useLeaveTypes } from '@/hooks/academic/use-leave-types';
import { CrudRowActions } from '@/components/shared/crud-master/crud-row-actions';
import { LeaveTypeFormDialog } from './leave-type-form-dialog';
import type { LeaveType } from '@/types/leaves';

interface LeaveTypeRowActionsProps {
  leaveType: LeaveType;
}

// Adapter: the shared EditDialog contract uses `entity` but
// LeaveTypeFormDialog uses `leaveType`. Thin shim preserves existing dialog
// without forcing a rename of its props.
function LeaveTypeEditDialogAdapter({
  open,
  onOpenChange,
  mode,
  entity
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'edit';
  entity: LeaveType;
}) {
  return (
    <LeaveTypeFormDialog
      open={open}
      onOpenChange={onOpenChange}
      mode={mode}
      leaveType={entity}
    />
  );
}

// Bespoke View Details body — code / color / approval / status / description.
function LeaveTypeDetails({ entity }: { entity: LeaveType }) {
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

        <div className='text-muted-foreground'>Requires Approval:</div>
        <div>{entity.requires_approval ? 'Yes' : 'No'}</div>

        <div className='text-muted-foreground'>Status:</div>
        <div>{entity.is_active ? 'Active' : 'Inactive'}</div>
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

export function LeaveTypeRowActions({ leaveType }: LeaveTypeRowActionsProps) {
  const { deleteLeaveType } = useLeaveTypes();

  return (
    <CrudRowActions<LeaveType>
      entity={leaveType}
      entityLabel='leave type'
      entityDisplayName={(e) => e.leave_type_name}
      onDelete={deleteLeaveType}
      EditDialog={LeaveTypeEditDialogAdapter}
      ViewDetailsRenderer={LeaveTypeDetails}
    />
  );
}
