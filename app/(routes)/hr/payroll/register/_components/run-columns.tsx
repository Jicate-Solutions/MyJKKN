'use client';

/**
 * Columns for the register index — one row per generated register.
 *
 * THE RUN ROW CARRIES NO NAMES. hr_salary_register_runs stores
 * hr_organization_id and institution_id only, so the institution is resolved
 * through useHrOrgMappings().orgNameById, the same map the generate dialog uses.
 * A run whose organisation is not in that map still renders — with its id —
 * rather than vanishing, because a register that exists and cannot be named is a
 * thing to investigate, not to hide.
 *
 * MONEY IS THE THING BEING READ. Full Indian grouping, right-aligned,
 * tabular-nums; no lakh/crore compaction, because on a payroll screen the exact
 * figure is the point and "₹18.4L" is not a figure anyone can reconcile.
 *
 * A SUPERSEDED RUN IS A REAL STATE, not a deleted one: regenerating a month
 * replaces the register but the old one is still what somebody may have acted
 * on. It is muted and badged rather than dropped.
 */

import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { Download, Eye, MoreHorizontal } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { salaryRegisterExportUrl } from '@/hooks/hr/payroll/use-salary-register';
import type { HRSalaryRegisterRun } from '@/types/hr-payroll';

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const inr = (n: number) =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** Generated-at is a timestamptz; the register is read in local time. */
const stamp = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
      })
    : '—';

export interface RunColumnActions {
  /** hr_organization_id → institution name. */
  orgNameById: Map<string, string>;
}

export function getRunColumns(
  actions: RunColumnActions
): ColumnDef<HRSalaryRegisterRun>[] {
  const nameOf = (r: HRSalaryRegisterRun) =>
    actions.orgNameById.get(r.hr_organization_id) ?? r.hr_organization_id;

  return [
    {
      id: 'institution',
      accessorFn: nameOf,
      size: 460,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Institution" />,
      cell: ({ row }) => {
        const r = row.original;
        return (
          <Link
            href={`/hr/payroll/register/${r.id}`}
            className={`block truncate text-sm font-medium hover:underline${
              r.superseded_at ? ' text-muted-foreground' : ''
            }`}
          >
            {nameOf(r)}
          </Link>
        );
      },
    },
    {
      id: 'period',
      // Sortable as a number so December 2025 sits below January 2026 rather
      // than between April and February, which is what sorting the label does.
      accessorFn: (r) => r.period_year * 100 + r.period_month,
      size: 140,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Month" />,
      cell: ({ row }) => (
        <span className="truncate text-sm">
          {MONTHS[row.original.period_month - 1]} {row.original.period_year}
        </span>
      ),
    },
    {
      accessorKey: 'staff_total',
      size: 50,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Staff" />,
      cell: ({ row }) => (
        <span className="block text-right text-sm tabular-nums">
          {row.original.staff_total}
        </span>
      ),
    },
    
    
    {
      accessorKey: 'total_gross',
      size: 140,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Gross" />,
      cell: ({ row }) => (
        <span className="block text-right text-sm tabular-nums">
          {inr(row.original.total_gross)}
        </span>
      ),
    },
    {
      accessorKey: 'total_deductions',
      size: 140,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Deductions" />,
      cell: ({ row }) => (
        <span className="block text-right text-sm tabular-nums">
          {inr(row.original.total_deductions)}
        </span>
      ),
    },
    {
      accessorKey: 'total_net',
      size: 150,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Net payable" />,
      cell: ({ row }) => (
        <span className="block text-right text-sm font-semibold tabular-nums">
          {inr(row.original.total_net)}
        </span>
      ),
    },
    {
      accessorKey: 'generated_at',
      size: 130,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Generated" />,
      cell: ({ row }) => (
        <span className="truncate text-sm text-muted-foreground">
          {stamp(row.original.generated_at)}
        </span>
      ),
    },
    {
      id: 'state',
      accessorFn: (r) => (r.superseded_at ? 'Superseded' : 'In force'),
      size: 120,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) =>
        row.original.superseded_at ? (
          <Badge variant="outline" className="font-normal text-muted-foreground">
            Superseded
          </Badge>
        ) : (
          <Badge variant="secondary" className="font-normal">In force</Badge>
        ),
    },
    {
      id: 'actions',
      size: 70,
      header: 'Action',
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const r = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Open actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/hr/payroll/register/${r.id}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  View details
                </Link>
              </DropdownMenuItem>
              {/* A plain link, not a fetch: the route streams the file and names
                  it, so the browser's own download handles it. */}
              <DropdownMenuItem asChild>
                <a href={salaryRegisterExportUrl(r.id)} download>
                  <Download className="mr-2 h-4 w-4" />
                  Export workbook
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
