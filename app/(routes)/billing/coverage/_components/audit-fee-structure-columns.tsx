'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { LifecycleStatusBadge } from '@/components/learners/lifecycle-status-badge';
import type { LifecycleStatus } from '@/types/learner-profile';
import { formatCurrency } from '@/lib/utils';
import { Eye, FilePlus2 } from 'lucide-react';
import {
  NO_STRUCTURE_REASON_LABELS,
  type FeeStructureAuditLearnerRow
} from '@/types/billing-coverage';

// One row per LEARNER. Sortable ids MUST be in the RPC's whitelist:
// full_name, institution_name, worst_issue, problems.

export const ISSUE_STYLE: Record<string, string> = {
  missing_bill: 'border-transparent bg-red-600 text-white hover:bg-red-700',
  amount_mismatch: 'border-transparent bg-orange-500 text-white hover:bg-orange-600',
  other_structure: 'border-transparent bg-amber-500 text-white hover:bg-amber-600',
  not_linked: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300',
  split_missing: 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-300',
  no_structure: 'border-transparent bg-violet-600 text-white hover:bg-violet-700',
  other_module: 'border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
  ok: 'border-transparent bg-emerald-600 text-white hover:bg-emerald-700'
};

const rs = (n: number) => formatCurrency(n, { showDecimals: false });

/** Every non-zero problem as its own compact badge, worst first. */
function ProblemBadges({ r }: { r: FeeStructureAuditLearnerRow }) {
  if (r.no_structure) {
    return (
      <div className='space-y-0.5 whitespace-normal'>
        <Badge className={ISSUE_STYLE.no_structure}>No structure matched</Badge>
        {r.no_structure_reason && (
          <div className='text-[11px] text-muted-foreground'>
            {NO_STRUCTURE_REASON_LABELS[r.no_structure_reason]}
          </div>
        )}
      </div>
    );
  }
  const parts: [string, number, string][] = [
    ['missing_bill', r.missing_bill, 'missing'],
    ['amount_mismatch', r.amount_mismatch, 'amount differs'],
    ['other_structure', r.other_structure, 'other structure'],
    ['not_linked', r.not_linked, 'not linked'],
    ['split_missing', r.split_missing, 'no instalments'],
    ['other_module', r.other_module, 'hostel/mess/transport']
  ];
  const shown = parts.filter(([, n]) => n > 0);
  if (shown.length === 0) return <Badge className={ISSUE_STYLE.ok}>All match</Badge>;
  return (
    <div className='flex flex-wrap gap-1 whitespace-normal'>
      {shown.map(([k, n, label]) => (
        <Badge key={k} className={`${ISSUE_STYLE[k]} text-[11px]`}>
          {n} {label}
        </Badge>
      ))}
    </div>
  );
}

export function getFeeStructureAuditColumns(opts: {
  canGenerate: boolean;
  onView: (row: FeeStructureAuditLearnerRow) => void;
  onGenerate: (learnerIds: string[]) => void;
}): ColumnDef<FeeStructureAuditLearnerRow>[] {
  const cols: ColumnDef<FeeStructureAuditLearnerRow>[] = [
    {
      id: 'full_name',
      accessorKey: 'full_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Learner' />,
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className='space-y-0.5 whitespace-normal'>
            <button
              type='button'
              onClick={() => opts.onView(r)}
              className='text-left font-medium text-primary hover:underline'
              title='View audit details'
            >
              {r.full_name}
            </button>
            <div className='flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground'>
              <span className='font-mono'>{r.roll_number || 'No roll no.'}</span>
              <LifecycleStatusBadge status={r.lifecycle_status as LifecycleStatus} />
            </div>
          </div>
        );
      },
      size: 240
    },
    {
      id: 'institution_name',
      accessorKey: 'institution_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Institution / Program' />,
      cell: ({ row }) => (
        <div className='space-y-0.5 whitespace-normal'>
          <div className='text-sm'>{row.original.institution_name ?? '—'}</div>
          <div className='text-xs text-muted-foreground'>
            {row.original.program_name ?? '—'}
            {row.original.admission_year ? ` · ${row.original.admission_year}` : ''}
          </div>
        </div>
      ),
      size: 260
    },
    {
      id: 'structure_name',
      header: 'Fee Structure',
      cell: ({ row }) => (
        <div className='whitespace-normal text-sm'>
          {row.original.structure_name ?? <span className='text-muted-foreground'>—</span>}
        </div>
      ),
      enableSorting: false,
      size: 220
    },
    {
      id: 'items',
      header: () => <div className='text-center'>Items OK</div>,
      cell: ({ row }) =>
        row.original.no_structure ? (
          <div className='text-center text-muted-foreground'>—</div>
        ) : (
          <div className='text-center tabular-nums'>
            {row.original.ok} / {row.original.items}
          </div>
        ),
      enableSorting: false,
      size: 90
    },
    {
      id: 'worst_issue',
      accessorKey: 'worst_issue',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Problems' />,
      cell: ({ row }) => <ProblemBadges r={row.original} />,
      size: 240
    },
    {
      id: 'amounts',
      header: () => <div className='text-right'>Structure / Billed</div>,
      cell: ({ row }) => {
        const r = row.original;
        if (r.no_structure) return <div className='text-right text-muted-foreground'>—</div>;
        const differs = Math.abs(r.expected_total - r.billed_total) > 1;
        return (
          <div className='text-right text-sm tabular-nums'>
            <div>{rs(r.expected_total)}</div>
            <div className={differs ? 'font-semibold text-orange-600 dark:text-orange-400' : 'text-muted-foreground'}>
              {rs(r.billed_total)}
            </div>
            {r.missing_amount > 0 && (
              <div className='text-[11px] text-red-600 dark:text-red-400'>{rs(r.missing_amount)} not billed</div>
            )}
          </div>
        );
      },
      enableSorting: false,
      size: 150
    },
    {
      id: 'actions',
      header: 'Action',
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className='flex flex-col gap-1'>
            <Button size='sm' variant='outline' className='h-7 text-xs' onClick={() => opts.onView(r)}>
              <Eye className='mr-1 h-3.5 w-3.5' />
              Details
            </Button>
            {opts.canGenerate && r.missing_bill > 0 && (
              <Button size='sm' className='h-7 text-xs' onClick={() => opts.onGenerate([r.learner_id])}>
                <FilePlus2 className='mr-1 h-3.5 w-3.5' />
                Generate {r.missing_bill}
              </Button>
            )}
          </div>
        );
      },
      enableSorting: false,
      size: 130
    }
  ];

  if (!opts.canGenerate) return cols;
  return [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
          aria-label='Select all'
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(v) => row.toggleSelected(!!v)}
          aria-label='Select row'
        />
      ),
      enableSorting: false,
      size: 44,
      minSize: 44,
      maxSize: 44
    },
    ...cols
  ];
}
