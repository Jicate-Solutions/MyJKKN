'use client';

// columns.tsx
// TanStack column definitions for the Fee Structures advanced DataTable.
// Matches the project's standard DataTable column shape (admission-years
// reference). Each cell is wired to the joined display names returned by
// FeeStructureService.listAllPaginated.

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import type { AdmissionFeeStructure } from '@/types/admission';
import { FeeStructureRowActions } from './fee-structures-row-actions';

export type FeeStructureRow = AdmissionFeeStructure & {
  institution_name: string | null;
  degree_name: string | null;
  department_name: string | null;
  programme_name: string | null;
  quota_name: string | null;
  community_name: string | null;
  accommodation_name: string | null;
  admission_year_name: string | null;
  item_count: number;
};

export const columns: ColumnDef<FeeStructureRow>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    size: 40,
    minSize: 40,
    maxSize: 40,
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
    cell: ({ row }) => (
      <Link
        href={`/admission/settings/fees-structure/${row.original.id}`}
        className="font-medium text-primary hover:underline"
      >
        {row.original.name}
      </Link>
    ),
    size: 220,
  },
  {
    id: 'institution',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Institution" />,
    cell: ({ row }) => row.original.institution_name ?? '—',
    size: 220,
  },
  {
    id: 'programme',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Programme" />,
    cell: ({ row }) => row.original.programme_name ?? '—',
    size: 200,
  },
  {
    id: 'admission_year',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Year" />,
    cell: ({ row }) => row.original.admission_year_name ?? '—',
    size: 130,
  },
  {
    id: 'quota',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Quota" />,
    cell: ({ row }) => row.original.quota_name ?? '—',
    size: 140,
  },
  {
    id: 'community',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Community" />,
    cell: ({ row }) => row.original.community_name ?? '—',
    size: 130,
  },
  {
    id: 'accommodation',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Accommodation" />,
    cell: ({ row }) => row.original.accommodation_name ?? '—',
    size: 150,
  },
  {
    accessorKey: 'item_count',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Items" />,
    cell: ({ row }) => (
      <span className="tabular-nums font-medium">{row.original.item_count}</span>
    ),
    size: 80,
  },
  {
    accessorKey: 'status',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => {
      const status = row.original.status;
      if (status === 'active') {
        return (
          <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700">
            Active
          </Badge>
        );
      }
      if (status === 'draft') return <Badge variant="secondary">Draft</Badge>;
      return <Badge variant="outline">Archived</Badge>;
    },
    size: 110,
  },
  {
    id: 'actions',
    header: 'Actions',
    size: 60,
    enableSorting: false,
    enableHiding: false,
    cell: ({ row, table }) => {
      // Row-actions can trigger a refetch via the DataTable meta callback
      // exposed by fee-structures-list-view.tsx (see context provider there).
      const meta = table.options.meta as { onRefetch?: () => void } | undefined;
      return (
        <FeeStructureRowActions
          structure={row.original}
          onChanged={() => meta?.onRefetch?.()}
        />
      );
    },
  },
];
