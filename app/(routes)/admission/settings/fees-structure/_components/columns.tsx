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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import Link from 'next/link';
import type { AdmissionFeeStructure } from '@/types/admission';
import { FeeStructureRowActions } from './fee-structures-row-actions';

export type FeeStructureRow = AdmissionFeeStructure & {
  institution_name: string | null;
  degree_name: string | null;
  department_name: string | null;
  programme_name: string | null;
  quota_name: string | null;
  accommodation_name: string | null;
  community_name: string | null;
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
    enableResizing: false
  },
  {
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
    // The 220px column width often clips long structure names ("BBA Honors —
    // Mgmt quota — 2025-26 cohort — Hostel A …"). We ellipsize the visible
    // cell with `truncate` and surface the full name in a Radix tooltip on
    // hover/focus, matching the per-instance TooltipProvider pattern used
    // elsewhere in the project (e.g. student-receipts-table.tsx).
    cell: ({ row }) => (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href={`/admission/settings/fees-structure/${row.original.id}`}
              className="font-medium text-primary hover:underline block max-w-full truncate"
            >
              {row.original.name}
            </Link>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-md">
            <p className="break-words">{row.original.name}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ),
    size: 420,
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
    id: 'gender',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Gender" />,
    cell: ({ row }) => row.original.gender ?? 'Any',
    size: 90,
  },
  {
    id: 'accommodation',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Accommodation" />,
    cell: ({ row }) => {
      const name = row.original.accommodation_name;
      return <Badge variant={name ? 'outline' : 'secondary'}>{name ?? 'Any'}</Badge>;
    },
    size: 130,
  },
  {
    // Classification, not a matching dimension — an unset value is a genuine
    // "not yet classified" (all pre-existing structures), so it renders as a
    // muted dash rather than the "Any" wording used by the real dimensions.
    accessorKey: 'package_type',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Package Type" />,
    cell: ({ row }) => {
      const value = row.original.package_type;
      if (value === 'package') {
        return <Badge variant="secondary">Package</Badge>;
      }
      if (value === 'non_package') {
        return <Badge variant="outline">Non-Package</Badge>;
      }
      return <span className="text-muted-foreground">—</span>;
    },
    size: 130,
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
