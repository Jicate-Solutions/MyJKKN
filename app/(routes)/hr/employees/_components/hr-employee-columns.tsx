'use client';

// Column definitions for the HR Employee Directory advanced DataTable.
// Created: 2026-08-28, replacing a hand-rolled <table> that had no sorting,
// no column visibility, no resizing and a two-button pager.
//
// EVERY COLUMN CARRIES AN EXPLICIT size. The advanced DataTable renders each
// body cell as `px-4 py-2 truncate max-w-0` and sizes the column from
// header.getSize(), whose TanStack default is 150px — so any cell wider than
// its column is silently clipped. Same rule as the leave approvals table; see
// hr/leave/_components/approval-queue-columns.tsx for the incident that
// established it.

import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';

import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import type { HRPersonView } from '@/types/hr';

/** Muted em dash, so an empty cell reads as "nothing recorded" not "broken". */
const orDash = (v: string | null | undefined) =>
  v ? v : <span className="text-muted-foreground">—</span>;

export function getHREmployeeColumns(): ColumnDef<HRPersonView>[] {
  return [
    {
      accessorKey: 'employee_code',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Code" />,
      cell: ({ row }) => (
        <Link
          href={`/hr/employees/${row.original.id}`}
          className="font-mono text-xs underline-offset-2 hover:underline"
        >
          {row.original.employee_code ?? '—'}
        </Link>
      ),
      size: 120,
      minSize: 90,
    },
    {
      id: 'name',
      accessorFn: (r) => `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim(),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      cell: ({ row }) => {
        const name = `${row.original.first_name ?? ''} ${row.original.last_name ?? ''}`.trim();
        return (
          <Link
            href={`/hr/employees/${row.original.id}`}
            className="font-medium underline-offset-4 hover:underline"
            title={name}
          >
            {name || 'Unnamed'}
          </Link>
        );
      },
      size: 200,
      minSize: 140,
      enableHiding: false,
    },
    {
      accessorKey: 'email',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Email" />,
      cell: ({ row }) => (
        <span title={row.original.email ?? ''}>{orDash(row.original.email)}</span>
      ),
      size: 220,
      minSize: 150,
    },
    {
      accessorKey: 'phone',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Phone" />,
      cell: ({ row }) => <span className="tabular-nums">{orDash(row.original.phone)}</span>,
      size: 140,
      minSize: 110,
    },
    {
      accessorKey: 'biometric_code',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Biometric Code" />,
      cell: ({ row }) => (
        <span className="font-mono text-xs">{orDash(row.original.biometric_code)}</span>
      ),
      size: 140,
      minSize: 110,
    },
    {
      // The institution whose machine they punch on — not their own
      // institution, which the Work Institution column already shows.
      accessorKey: 'biometric_machine_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Biometric Machine" />,
      cell: ({ row }) => (
        <span className="text-muted-foreground" title={row.original.biometric_machine_name ?? ''}>
          {orDash(row.original.biometric_machine_name)}
        </span>
      ),
      size: 200,
      minSize: 140,
    },
    {
      accessorKey: 'organization_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="HR Organization" />,
      cell: ({ row }) => (
        <span className="text-muted-foreground" title={row.original.organization_name ?? ''}>
          {orDash(row.original.organization_name)}
        </span>
      ),
      size: 190,
      minSize: 130,
    },
    {
      accessorKey: 'institution_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Work Institution" />,
      cell: ({ row }) => (
        <span className="text-muted-foreground" title={row.original.institution_name ?? ''}>
          {orDash(row.original.institution_name)}
        </span>
      ),
      size: 210,
      minSize: 140,
    },
    {
      // The Role Management role(s), not the designation — a person can hold
      // several, comma-joined by the service, so the cell truncates and keeps
      // the full list on hover.
      accessorKey: 'role_names',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Role" />,
      cell: ({ row }) => (
        <span title={row.original.role_names ?? ''}>{orDash(row.original.role_names)}</span>
      ),
      size: 200,
      minSize: 130,
    },
    
    {
      accessorKey: 'is_active',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) =>
        row.original.is_active ? (
          <Badge variant="outline" className="border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400">
            Active
          </Badge>
        ) : (
          <Badge variant="outline" className="bg-muted text-muted-foreground">
            Inactive
          </Badge>
        ),
      size: 110,
      minSize: 90,
    },
  ];
}
