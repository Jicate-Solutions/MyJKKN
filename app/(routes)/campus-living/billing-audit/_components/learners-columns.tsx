'use client';

import type { ColumnDef, HeaderContext } from '@tanstack/react-table';
import Link from 'next/link';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { cn } from '@/lib/utils';
import type { BillingAuditRow } from '@/types/campus-living-billing-audit';
import { BandStatusBadge, BillStatusBadge, FindingBadges } from './badges';
import { BillDrilldown } from './bill-drilldown';
import { formatDate, formatInr } from './format';

/** A money cell that renders null as an em-dash — "no expectation" and "no
 *  bill" are facts the reader must be able to tell from ₹0. */
function Money({ value, tone }: { value: number | null; tone?: 'good' | 'warn' | 'bad' }) {
  return (
    <span
      className={cn(
        'tabular-nums',
        value === null && 'text-muted-foreground',
        tone === 'good' && 'text-emerald-700 dark:text-emerald-400',
        tone === 'warn' && 'text-amber-700 dark:text-amber-400',
        tone === 'bad' && 'text-red-700 dark:text-red-400'
      )}
    >
      {formatInr(value)}
    </span>
  );
}

/** Actual-vs-expected pair: billed on top, expectation beneath, tinted when
 *  they disagree. */
function ActualCell({
  billed,
  expected,
  status,
  due
}: {
  billed: number | null;
  expected: number | null;
  status: BillingAuditRow['room_status'];
  due: string | null;
}) {
  const differs = billed !== null && expected !== null && billed !== expected;
  const overdue = !!due && status !== 'paid' && new Date(`${due}T00:00:00`) < new Date();
  return (
    <div className='space-y-0.5 leading-tight'>
      <div className={cn('font-medium', differs && 'text-purple-700 dark:text-purple-400')}>
        <Money value={billed} />
      </div>
      <div className='text-[11px] text-muted-foreground'>
        expected {formatInr(expected)}
      </div>
      <div className='flex items-center gap-1.5 text-[11px]'>
        <BillStatusBadge status={status} />
        {due && (
          <span className={cn('text-muted-foreground', overdue && 'font-medium text-red-700 dark:text-red-400')}>
            due {formatDate(due)}
          </span>
        )}
      </div>
    </div>
  );
}

const sortHeader =
  (title: string) =>
  ({ column }: HeaderContext<BillingAuditRow, unknown>) =>
    <DataTableColumnHeader column={column} title={title} />;

export const columns: ColumnDef<BillingAuditRow>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label='Select all'
      />
    ),
    size: 44,
    minSize: 44,
    maxSize: 44,
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label='Select row'
      />
    ),
    enableSorting: false,
    enableHiding: false,
    enableResizing: false
  },
  {
    accessorKey: 'full_name',
    id: 'full_name',
    header: sortHeader('Learner'),
    size: 260,
    minSize: 200,
    maxSize: 420,
    cell: ({ row }) => {
      const r = row.original;
      return (
        <div className='min-w-0 py-0.5'>
          <Link
            href={`/billing/schedule/students/${r.learner_id}`}
            className='block truncate font-semibold leading-tight hover:text-primary hover:underline'
            title={r.full_name || 'Unnamed'}
          >
            {r.full_name || 'Unnamed'}
          </Link>
          <div className='truncate text-xs text-muted-foreground'>
            {r.roll_number ?? r.register_number ?? 'No roll number'}
            {r.gender ? ` · ${r.gender}` : ''}
          </div>
          <div className='truncate text-[11px] text-muted-foreground'>
            {[r.institution_name?.replace(/^JKKN /, ''), r.program_name, r.year_of_study ? `Yr ${r.year_of_study}` : null]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
      );
    }
  },
  {
    accessorKey: 'block_name',
    id: 'block_name',
    header: sortHeader('Bed'),
    size: 170,
    minSize: 120,
    cell: ({ row }) => {
      const r = row.original;
      if (!r.is_allocated) return <span className='text-xs text-muted-foreground'>Not allocated</span>;
      return (
        <div className='leading-tight'>
          <div className='text-sm'>{[r.block_name, r.room_number, r.bed_number].filter(Boolean).join(' / ')}</div>
          {r.seated_category_name && (
            <div className='text-[11px] text-muted-foreground'>{r.seated_category_name}</div>
          )}
        </div>
      );
    }
  },
  {
    accessorKey: 'tagged_category_name',
    id: 'tagged_category_name',
    header: sortHeader('Billed category'),
    size: 170,
    minSize: 130,
    cell: ({ row }) => {
      const r = row.original;
      return (
        <div className='leading-tight'>
          <div className='text-sm'>{r.tagged_category_name ?? '—'}</div>
          <div className='text-[11px] text-muted-foreground'>
            {r.mess_category_name ? `Mess: ${r.mess_category_name}` : 'No mess category'}
          </div>
        </div>
      );
    }
  },
  {
    accessorKey: 'band_fee',
    id: 'band_fee',
    header: sortHeader('Fee band'),
    size: 200,
    minSize: 160,
    cell: ({ row }) => {
      const r = row.original;
      return (
        <div className='space-y-0.5 leading-tight'>
          <div className='text-sm'>
            <Money value={r.band_fee} />
          </div>
          <div className='text-[11px] text-muted-foreground'>
            entitled: {r.entitled_category_name ?? '—'}
          </div>
          <BandStatusBadge status={r.band_status} />
        </div>
      );
    }
  },
  {
    accessorKey: 'room_billed',
    id: 'room_billed',
    header: () => <span className='text-xs font-medium'>Room bill</span>,
    enableSorting: false,
    size: 180,
    minSize: 150,
    cell: ({ row }) => {
      const r = row.original;
      return (
        <ActualCell billed={r.room_billed} expected={r.expected_room_fee} status={r.room_status} due={r.room_due_date} />
      );
    }
  },
  {
    accessorKey: 'mess_billed',
    id: 'mess_billed',
    header: () => <span className='text-xs font-medium'>Mess bill</span>,
    enableSorting: false,
    size: 180,
    minSize: 150,
    cell: ({ row }) => {
      const r = row.original;
      return (
        <ActualCell billed={r.mess_billed} expected={r.expected_mess_fee} status={r.mess_status} due={r.mess_due_date} />
      );
    }
  },
  {
    accessorKey: 'upgrade_billed',
    id: 'upgrade_billed',
    header: () => <span className='text-xs font-medium'>Upgrade bill</span>,
    enableSorting: false,
    size: 180,
    minSize: 150,
    cell: ({ row }) => {
      const r = row.original;
      return (
        <ActualCell
          billed={r.upgrade_billed}
          expected={r.expected_upgrade_fee}
          status={r.upgrade_status}
          due={r.upgrade_due_date}
        />
      );
    }
  },
  {
    accessorKey: 'category_room_rate',
    id: 'category_room_rate',
    header: () => <span className='text-xs font-medium'>Category rate</span>,
    enableSorting: false,
    size: 140,
    minSize: 120,
    cell: ({ row }) => {
      const r = row.original;
      return (
        <div className='leading-tight text-xs'>
          <div>Room <Money value={r.category_room_rate} /></div>
          <div>Mess <Money value={r.category_mess_rate} /></div>
        </div>
      );
    }
  },
  {
    accessorKey: 'total_billed',
    id: 'total_billed',
    header: sortHeader('Billed'),
    size: 120,
    minSize: 100,
    cell: ({ row }) => <Money value={row.original.total_billed} />
  },
  {
    accessorKey: 'total_paid',
    id: 'total_paid',
    header: sortHeader('Paid'),
    size: 120,
    minSize: 100,
    cell: ({ row }) => <Money value={row.original.total_paid} tone='good' />
  },
  {
    accessorKey: 'total_outstanding',
    id: 'total_outstanding',
    header: sortHeader('Outstanding'),
    size: 130,
    minSize: 110,
    cell: ({ row }) => (
      <Money value={row.original.total_outstanding} tone={row.original.total_outstanding > 0 ? 'warn' : undefined} />
    )
  },
  {
    accessorKey: 'overdue_amount',
    id: 'overdue_amount',
    header: sortHeader('Overdue'),
    size: 120,
    minSize: 100,
    cell: ({ row }) => (
      <Money value={row.original.overdue_amount} tone={row.original.overdue_amount > 0 ? 'bad' : undefined} />
    )
  },
  {
    id: 'findings',
    header: () => <span className='text-xs font-medium'>Findings</span>,
    enableSorting: false,
    size: 260,
    minSize: 180,
    cell: ({ row }) => <FindingBadges findings={row.original.findings} />
  },
  {
    id: 'bills',
    header: () => <span className='text-xs font-medium'>Bills</span>,
    enableSorting: false,
    enableHiding: false,
    size: 110,
    minSize: 100,
    cell: ({ row }) => <BillDrilldown row={row.original} />
  }
];
