'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import type {
  ProgramRoomEligibilityRow,
  ProgramMessEligibilityRow,
} from '@/types/program-eligibility';
import { RoomEligibilityRowActions, MessEligibilityRowActions } from './row-actions';

// Shared cell: scope label — "(All programs — default)" when program_id is null.
function ScopeCell({ programName }: { programName: string | null }) {
  if (!programName) {
    return (
      <Badge variant='secondary' className='font-normal'>
        All programs — default
      </Badge>
    );
  }
  return <span className='font-medium'>{programName}</span>;
}

export const createRoomColumns = (): ColumnDef<ProgramRoomEligibilityRow>[] => [
  {
    accessorKey: 'institution_name',
    header: 'Institution',
    cell: ({ row }) => (
      <span className='text-sm font-medium'>
        {row.original.institution_name || '—'}
      </span>
    ),
  },
  {
    accessorKey: 'program_name',
    header: 'Scope',
    cell: ({ row }) => <ScopeCell programName={row.original.program_name} />,
  },
  {
    accessorKey: 'room_category_name',
    header: 'Room Category',
    cell: ({ row }) => (
      <span className='text-sm'>{row.original.room_category_name || '—'}</span>
    ),
  },
  {
    accessorKey: 'is_active',
    header: 'Status',
    cell: ({ row }) => (
      <Badge variant={row.original.is_active ? 'default' : 'outline'}>
        {row.original.is_active ? 'Allowed' : 'Disabled'}
      </Badge>
    ),
  },
  {
    accessorKey: 'effective_from',
    header: 'Effective From',
    cell: ({ row }) => (
      <span className='text-muted-foreground text-sm'>
        {row.original.effective_from || '—'}
      </span>
    ),
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => <RoomEligibilityRowActions row={row.original} />,
  },
];

export const createMessColumns = (): ColumnDef<ProgramMessEligibilityRow>[] => [
  {
    accessorKey: 'institution_name',
    header: 'Institution',
    cell: ({ row }) => (
      <span className='text-sm font-medium'>
        {row.original.institution_name || '—'}
      </span>
    ),
  },
  {
    accessorKey: 'program_name',
    header: 'Scope',
    cell: ({ row }) => <ScopeCell programName={row.original.program_name} />,
  },
  {
    accessorKey: 'mess_category_name',
    header: 'Mess Category',
    cell: ({ row }) => (
      <span className='text-sm'>{row.original.mess_category_name || '—'}</span>
    ),
  },
  {
    accessorKey: 'is_monthly_mess_allowed',
    header: 'Monthly Mess',
    cell: ({ row }) => (
      <Switch checked={row.original.is_monthly_mess_allowed} disabled aria-readonly />
    ),
  },
  {
    accessorKey: 'is_active',
    header: 'Status',
    cell: ({ row }) => (
      <Badge variant={row.original.is_active ? 'default' : 'outline'}>
        {row.original.is_active ? 'Allowed' : 'Disabled'}
      </Badge>
    ),
  },
  {
    accessorKey: 'effective_from',
    header: 'Effective From',
    cell: ({ row }) => (
      <span className='text-muted-foreground text-sm'>
        {row.original.effective_from || '—'}
      </span>
    ),
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => <MessEligibilityRowActions row={row.original} />,
  },
];
