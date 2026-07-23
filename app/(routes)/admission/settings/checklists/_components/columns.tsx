'use client';

// TanStack columns for the Programme Checklists table.
//
// NOTE: The project's <DataTable/> auto-prepends its OWN `select` column
// (data-table.tsx:430-474) whenever bulk-action props are passed. We must
// NOT define one here too — that produced the React "two children with the
// same key, 'select'" warning. The select column below is intentionally
// absent; the DataTable adds it.

import { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { DotsHorizontalIcon } from '@radix-ui/react-icons';
import { Eye, Pencil, Trash2, Archive, ArchiveRestore } from 'lucide-react';

export interface ChecklistRow {
  id: string;
  scope_type: 'institution' | 'degree' | 'department' | 'program';
  scope_id: string;
  scope_label: string | null;
  name: string;
  description: string | null;
  applies_to_lifecycle: string[];
  is_active: boolean;
  items_count: number;
  created_at: string;
}

const SCOPE_LABEL: Record<ChecklistRow['scope_type'], string> = {
  institution: 'Institution',
  degree: 'Degree',
  department: 'Department',
  program: 'Programme',
};

interface BuildColumnsOptions {
  onView: (row: ChecklistRow) => void;
  onEdit: (row: ChecklistRow) => void;
  onDelete: (row: ChecklistRow) => void;
}

export function buildChecklistColumns({
  onView,
  onEdit,
  onDelete,
}: BuildColumnsOptions): ColumnDef<ChecklistRow>[] {
  return [
    {
      accessorKey: 'scope_type',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Scope" />,
      cell: ({ row }) => (
        <Badge variant="outline" className="capitalize">
          {SCOPE_LABEL[row.original.scope_type]}
        </Badge>
      ),
      size: 110,
      filterFn: (row, _id, value) => {
        if (!Array.isArray(value) || value.length === 0) return true;
        return value.includes(row.original.scope_type);
      },
    },
    {
      accessorKey: 'scope_label',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Target" />,
      cell: ({ row }) => (
        <div className="text-sm">
          {row.original.scope_label ?? (
            <span className="text-muted-foreground italic">Unknown</span>
          )}
        </div>
      ),
      size: 200,
    },
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => onView(row.original)}
          className="font-medium text-primary hover:underline text-left"
        >
          {row.original.name}
        </button>
      ),
      size: 220,
    },
    {
      accessorKey: 'items_count',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Items" />,
      cell: ({ row }) => (
        <div className="text-center text-sm font-mono">{row.original.items_count}</div>
      ),
      size: 70,
    },
    {
      accessorKey: 'applies_to_lifecycle',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Lifecycle" />,
      cell: ({ row }) => (
        <div className="flex gap-1 flex-wrap">
          {row.original.applies_to_lifecycle.map((lc) => (
            <Badge key={lc} variant="outline" className="text-xs capitalize">
              {lc}
            </Badge>
          ))}
        </div>
      ),
      enableSorting: false,
      size: 180,
    },
    {
      accessorKey: 'is_active',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) =>
        row.original.is_active ? (
          <Badge variant="outline" className="border-emerald-500 text-emerald-700">
            Active
          </Badge>
        ) : (
          <Badge variant="outline" className="border-muted-foreground text-muted-foreground">
            Archived
          </Badge>
        ),
      size: 100,
      filterFn: (row, _id, value) => {
        if (!Array.isArray(value) || value.length === 0) return true;
        return value.includes(row.original.is_active ? 'active' : 'archived');
      },
    },
    {
      id: 'actions',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Actions" />,
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
      size: 60,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <DotsHorizontalIcon className="h-4 w-4" />
              <span className="sr-only">Open actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onView(row.original)}>
              <Eye className="h-4 w-4 mr-2" /> View
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(row.original)}>
              <Pencil className="h-4 w-4 mr-2" /> Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(row.original)}
              className="text-destructive focus:text-destructive"
            >
              {row.original.is_active ? (
                <>
                  <Archive className="h-4 w-4 mr-2" /> Archive / Delete
                </>
              ) : (
                <>
                  <ArchiveRestore className="h-4 w-4 mr-2" /> Delete
                </>
              )}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];
}
