'use client';

import { Badge } from '@/components/ui/badge';
import type { ColumnDef } from '@tanstack/react-table';
import type { BlockEconomicsEntry } from '@/lib/services/campus-living/block-economics-service';
import { COST_CATEGORY_LABELS, COST_KIND_LABELS, formatRupees } from './labels';
import { BlockEconomicsRowActions } from './row-actions';

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export const createColumns = (): ColumnDef<BlockEconomicsEntry>[] => [
  {
    accessorKey: 'block',
    header: 'Block',
    cell: ({ row }) => (
      <span className='font-medium'>{row.original.block?.name ?? '—'}</span>
    ),
  },
  {
    accessorKey: 'year',
    header: 'Year',
    cell: ({ row }) =>
      row.original.hostel_year_id ? (
        <span>{row.original.year?.name ?? '—'}</span>
      ) : (
        <Badge variant='outline'>One-time</Badge>
      ),
  },
  {
    accessorKey: 'cost_category',
    header: 'Category',
    cell: ({ row }) => (
      <div className='flex flex-col gap-0.5'>
        <span>{COST_CATEGORY_LABELS[row.original.cost_category]}</span>
        <span className='text-xs text-muted-foreground'>
          {COST_KIND_LABELS[row.original.cost_kind]}
        </span>
      </div>
    ),
  },
  {
    accessorKey: 'annual_amount',
    header: () => <div className='text-right'>Amount</div>,
    cell: ({ row }) => (
      <div className='text-right font-medium tabular-nums'>
        {formatRupees(row.original.annual_amount)}
      </div>
    ),
  },
  {
    accessorKey: 'notes',
    header: 'Notes',
    cell: ({ row }) => (
      <span className='text-muted-foreground text-sm line-clamp-1 max-w-[200px]'>
        {row.original.notes || '—'}
      </span>
    ),
  },
  {
    accessorKey: 'is_active',
    header: 'Status',
    cell: ({ row }) => (
      <Badge variant={row.original.is_active ? 'default' : 'outline'}>
        {row.original.is_active ? 'Active' : 'Disabled'}
      </Badge>
    ),
  },
  {
    id: 'updated',
    header: 'Updated',
    cell: ({ row }) => (
      <div className='flex flex-col gap-0.5'>
        <span className='text-sm'>{formatWhen(row.original.updated_at)}</span>
        {row.original.updater?.full_name && (
          <span className='text-xs text-muted-foreground line-clamp-1'>
            {row.original.updater.full_name}
          </span>
        )}
      </div>
    ),
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => <BlockEconomicsRowActions entry={row.original} />,
  },
];
