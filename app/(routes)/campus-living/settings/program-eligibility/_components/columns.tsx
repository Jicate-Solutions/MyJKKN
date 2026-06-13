'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import type { ProgramEligibilityRow } from '@/types/program-eligibility';
import { EligibilityRowActions } from './row-actions';
import { formatFeeBand } from './format';

function FeeBandCell({ min, max }: { min: number | null; max: number | null }) {
  return <span className='text-sm tabular-nums'>{formatFeeBand(min, max)}</span>;
}
function QuotaCell({ name }: { name: string | null }) {
  return name
    ? <span className='text-sm'>{name}</span>
    : <Badge variant='secondary' className='font-normal'>Any quota</Badge>;
}
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

export const createEligibilityColumns = (): ColumnDef<ProgramEligibilityRow>[] => [
  {
    accessorKey: 'institution_name',
    header: 'Institution',
    cell: ({ row }) => (
      <span className='text-sm font-medium'>{row.original.institution_name || '—'}</span>
    ),
  },
  {
    accessorKey: 'program_name',
    header: 'Scope',
    cell: ({ row }) => <ScopeCell programName={row.original.program_name} />,
  },
  {
    accessorKey: 'quota_name',
    header: 'Quota',
    cell: ({ row }) => <QuotaCell name={row.original.quota_name} />,
  },
  {
    id: 'fee_band',
    header: 'Fee Band',
    cell: ({ row }) => <FeeBandCell min={row.original.fee_min} max={row.original.fee_max} />,
  },
  {
    accessorKey: 'hostel_type',
    header: 'Hostel Type',
    cell: ({ row }) => {
      const t = row.original.hostel_type;
      if (!t) return <span className='text-muted-foreground text-sm'>—</span>;
      const label = t === 'boys' ? 'Boys' : t === 'girls' ? 'Girls' : t === 'both' ? 'Both' : t;
      return (
        <Badge variant={t === 'both' ? 'secondary' : 'outline'} className='font-normal'>
          {label}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'room_category_name',
    header: 'Room Category',
    cell: ({ row }) => (
      <span className='text-sm'>{row.original.room_category_name || '—'}</span>
    ),
  },
  {
    accessorKey: 'mess_category_name',
    header: 'Mess Category',
    cell: ({ row }) => (
      <span className='text-sm'>{row.original.mess_category_name || '—'}</span>
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
    id: 'actions',
    header: '',
    cell: ({ row }) => <EligibilityRowActions row={row.original} />,
  },
];
