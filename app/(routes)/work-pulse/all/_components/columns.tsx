'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import { Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminPulseEntry } from '@/types/work-pulse';

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  administrator: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  principal: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  hod: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
  faculty: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  staff: 'bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300',
};

export function getPulseColumns(
  onView: (entry: AdminPulseEntry) => void
): ColumnDef<AdminPulseEntry>[] {
  return [
    // Select
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(value: boolean) => table.toggleAllPageRowsSelected(!!value)}
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
    // User
    {
      accessorKey: 'profiles.full_name',
      id: 'user',
      header: ({ column }) => <DataTableColumnHeader column={column} title="User" />,
      cell: ({ row }) => {
        const entry = row.original;
        return (
          <div className="min-w-[160px]">
            <p className="font-medium text-sm truncate">
              {entry.profiles?.full_name || 'Unknown'}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              {entry.profiles?.email || ''}
            </p>
          </div>
        );
      },
    },
    // Role
    {
      accessorKey: 'role',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Role" />,
      cell: ({ row }) => {
        const role = row.original.role;
        return (
          <Badge className={`text-[10px] capitalize whitespace-nowrap ${ROLE_COLORS[role] || 'bg-gray-100 text-gray-700'}`}>
            {role.replace(/_/g, ' ')}
          </Badge>
        );
      },
      size: 100,
    },
    // Department
    {
      id: 'department',
      accessorFn: (row) => row.departments?.department_name || '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Department" />,
      cell: ({ row }) => {
        const dept = row.original.departments?.department_name;
        return (
          <span className="text-xs text-muted-foreground truncate max-w-[140px] block">
            {dept || '—'}
          </span>
        );
      },
      size: 140,
    },
    // Institution
    {
      id: 'institution',
      accessorFn: (row) => row.institutions?.name || '',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Institution" />,
      cell: ({ row }) => {
        const inst = row.original.institutions?.name;
        return (
          <span className="text-xs text-muted-foreground truncate max-w-[150px] block">
            {inst || '—'}
          </span>
        );
      },
      size: 150,
    },
    // Week Of
    {
      accessorKey: 'week_of',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Week Of" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {new Date(row.original.week_of).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: '2-digit',
          })}
        </span>
      ),
      size: 95,
    },
    // Talent Waste
    {
      accessorKey: 'talent_waste_category',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Talent Waste" />,
      cell: ({ row }) => {
        const entry = row.original;
        return (
          <div className="max-w-[220px]">
            <Badge variant="secondary" className="text-[10px] mb-1 whitespace-nowrap">
              {entry.talent_waste_category}
            </Badge>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {entry.talent_waste_description}
            </p>
          </div>
        );
      },
    },
    // Repetition
    {
      accessorKey: 'repetition_category',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Repetitive Task" />,
      cell: ({ row }) => {
        const entry = row.original;
        return (
          <div className="max-w-[220px]">
            <Badge variant="secondary" className="text-[10px] mb-1 whitespace-nowrap">
              {entry.repetition_category}
            </Badge>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {entry.repetition_description}
            </p>
          </div>
        );
      },
    },
    // Actions
    {
      id: 'actions',
      header: () => <span className="text-xs">Action</span>,
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={(e) => {
            e.stopPropagation();
            onView(row.original);
          }}
        >
          <Eye className="h-4 w-4" />
        </Button>
      ),
      enableSorting: false,
      enableHiding: false,
      size: 60,
    },
  ];
}
