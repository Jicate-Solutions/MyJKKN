'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import type { ProgramEligibilityRow } from '@/types/program-eligibility';
import { EligibilityRowActions } from './row-actions';

// ₹ rupees → compact lakh label. Trims trailing zeros (400000 => "4L").
const lakh = (n: number) => `${Number((n / 100000).toFixed(2))}L`;
function FeeBandCell({ min, max }: { min: number | null; max: number | null }) {
  let label: string;
  if (min == null && max == null) label = 'Any';
  else if (min == null) label = `< ${lakh(max!)}`;
  else if (max == null) label = `≥ ${lakh(min)}`;
  else label = `${lakh(min)} – ${lakh(max)}`;
  return <span className='text-sm tabular-nums'>{label}</span>;
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
    cell: ({ row }) => <EligibilityRowActions row={row.original} />,
  },
];
