'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye } from 'lucide-react';
import type { MarketingLeadDatabase } from '@/types/admission';

// ─── Helpers ────────────────────────────────────────────────────────────────

function getGenderBadgeClass(gender: string | null): string {
  if (!gender) return 'bg-gray-100 text-gray-600';
  switch (gender) {
    case 'Male':
      return 'bg-blue-100 text-blue-800';
    case 'Female':
      return 'bg-pink-100 text-pink-800';
    default:
      return 'bg-purple-100 text-purple-800';
  }
}

// ─── Column Definitions ─────────────────────────────────────────────────────

const baseColumns: ColumnDef<MarketingLeadDatabase>[] = [
  // Select
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value: boolean) =>
          table.toggleAllPageRowsSelected(!!value)
        }
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value: boolean) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
    size: 40,
  },

  // Student Name — placeholder, replaced in getColumns with clickable version
  {
    accessorKey: 'student_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Student Name" />
    ),
    cell: ({ row }) => (
      <div className="font-medium min-w-[150px]">
        {row.getValue('student_name')}
      </div>
    ),
    size: 180,
  },

  // Father Name
  {
    accessorKey: 'father_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Father Name" />
    ),
    cell: ({ row }) => (
      <span className="text-sm">{row.getValue('father_name') || '—'}</span>
    ),
    size: 160,
  },

  // Gender
  {
    accessorKey: 'gender',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Gender" />
    ),
    cell: ({ row }) => {
      const gender = row.getValue('gender') as string | null;
      return gender ? (
        <Badge className={getGenderBadgeClass(gender)}>{gender}</Badge>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
    size: 100,
  },

  // Mobile Number
  {
    accessorKey: 'mobile_number',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Mobile" />
    ),
    cell: ({ row }) => (
      <span className="text-sm font-mono">
        {row.getValue('mobile_number') || '—'}
      </span>
    ),
    size: 130,
  },

  // District
  {
    accessorKey: 'district',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="District" />
    ),
    cell: ({ row }) => (
      <span className="text-sm">{row.getValue('district') || '—'}</span>
    ),
    size: 140,
  },

  // Sub District
  {
    accessorKey: 'sub_district',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Sub District" />
    ),
    cell: ({ row }) => (
      <span className="text-sm">{row.getValue('sub_district') || '—'}</span>
    ),
    size: 140,
  },

  // Community
  {
    accessorKey: 'community',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Community" />
    ),
    cell: ({ row }) => (
      <span className="text-sm">{row.getValue('community') || '—'}</span>
    ),
    size: 120,
  },

  // Group Detail
  {
    accessorKey: 'group_detail',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Group" />
    ),
    cell: ({ row }) => (
      <span className="text-sm">{row.getValue('group_detail') || '—'}</span>
    ),
    size: 120,
  },

  // School Name
  {
    accessorKey: 'school_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="School Name" />
    ),
    cell: ({ row }) => (
      <div className="text-sm max-w-[200px] truncate" title={row.getValue('school_name') as string}>
        {row.getValue('school_name') || '—'}
      </div>
    ),
    size: 200,
  },

  // Pincode
  {
    accessorKey: 'pincode',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Pincode" />
    ),
    cell: ({ row }) => (
      <span className="text-sm font-mono">{row.getValue('pincode') || '—'}</span>
    ),
    size: 90,
  },
];

// ─── Export with Actions ────────────────────────────────────────────────────

export const getColumns = (
  onViewLead: (lead: MarketingLeadDatabase) => void
): ColumnDef<MarketingLeadDatabase>[] => {
  // Override student_name column to make it clickable
  const columns = baseColumns.map((col) => {
    if ('accessorKey' in col && col.accessorKey === 'student_name') {
      return {
        ...col,
        cell: ({ row }: { row: any }) => {
          const lead = row.original as MarketingLeadDatabase;
          return (
            <button
              className="font-medium min-w-[150px] text-left text-primary hover:underline cursor-pointer"
              onClick={() => onViewLead(lead)}
            >
              {row.getValue('student_name')}
            </button>
          );
        },
      };
    }
    return col;
  });

  return [
    ...columns,
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const lead = row.original;
        return (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onViewLead(lead)}
            title="View details"
          >
            <Eye className="h-4 w-4" />
          </Button>
        );
      },
      enableSorting: false,
      enableHiding: false,
      size: 60,
    },
  ];
};
