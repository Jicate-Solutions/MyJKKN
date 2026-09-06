'use client';

import { useHostelYears } from '@/hooks/campus-living/use-hostel-years';
import { CrudRowActions } from '@/components/shared/crud-master/crud-row-actions';
import { HostelYearFormDialog } from './hostel-year-form-dialog';
import { Badge } from '@/components/ui/badge';
import type { HostelYear } from '@/types/hostel-years';

interface HostelYearRowActionsProps {
  hostelYear: HostelYear;
}

function HostelYearEditDialogAdapter({
  open,
  onOpenChange,
  mode,
  entity,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'edit';
  entity: HostelYear;
}) {
  return (
    <HostelYearFormDialog
      open={open}
      onOpenChange={onOpenChange}
      mode={mode}
      hostelYear={entity}
    />
  );
}

function HostelYearDetails({ entity }: { entity: HostelYear }) {
  return (
    <div className='grid grid-cols-2 gap-2 text-sm'>
      <div className='text-muted-foreground'>Name:</div>
      <div className='font-medium'>{entity.name}</div>

      <div className='text-muted-foreground'>Start Date:</div>
      <div>{entity.start_date}</div>

      <div className='text-muted-foreground'>End Date:</div>
      <div>{entity.end_date}</div>

      <div className='text-muted-foreground'>Current:</div>
      <div>
        {entity.is_current ? <Badge variant='default'>Current</Badge> : 'No'}
      </div>

      <div className='text-muted-foreground'>Status:</div>
      <div>{entity.is_active ? 'Active' : 'Inactive'}</div>

      {entity.description ? (
        <>
          <div className='text-muted-foreground'>Description:</div>
          <div>{entity.description}</div>
        </>
      ) : null}
    </div>
  );
}

export function HostelYearRowActions({ hostelYear }: HostelYearRowActionsProps) {
  const { deleteHostelYear } = useHostelYears();

  return (
    <CrudRowActions<HostelYear>
      entity={hostelYear}
      entityLabel='hostel year'
      entityDisplayName={(e) => e.name}
      onDelete={deleteHostelYear}
      EditDialog={HostelYearEditDialogAdapter}
      ViewDetailsRenderer={HostelYearDetails}
      deleteImpactHint='Fee configurations using this hostel year will block deletion until reassigned.'
    />
  );
}
