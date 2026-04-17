'use client';

import { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckCircle, Save, Loader2, Pencil } from 'lucide-react';

export interface ProgramRow {
  id: string;
  program_name: string;
  degree_name: string;
  department_name: string;
  default_intake: number;
  intake_history_id: string | null;
  sanctioned_intake: number;
  dirty: boolean;
  saving: boolean;
}

interface ColumnFactoryOptions {
  onUpdate: (id: string, value: number) => void;
  onSave: (row: ProgramRow) => void;
  onEdit: (row: ProgramRow) => void;
}

function StatusBadge({ row }: { row: ProgramRow }) {
  if (row.dirty) {
    return (
      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 text-xs">
        Unsaved
      </Badge>
    );
  }
  if (row.intake_history_id) {
    return (
      <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs flex items-center gap-1 w-fit">
        <CheckCircle className="h-3 w-3" />
        Configured
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs text-muted-foreground">
      Using default
    </Badge>
  );
}

export function createSeatConfigColumns({
  onUpdate,
  onSave,
  onEdit,
}: ColumnFactoryOptions): ColumnDef<ProgramRow>[] {
  return [
    {
      accessorKey: 'degree_name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Degree" />
      ),
      cell: ({ row }) => (
        <span className="text-xs">{row.getValue('degree_name')}</span>
      ),
    },
    {
      accessorKey: 'department_name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Department" />
      ),
      cell: ({ row }) => (
        <span className="text-xs">{row.getValue('department_name')}</span>
      ),
    },
    {
      accessorKey: 'program_name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Program" />
      ),
      cell: ({ row }) => (
        <span className="text-xs font-medium">{row.getValue('program_name')}</span>
      ),
    },
    {
      accessorKey: 'default_intake',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Default" />
      ),
      cell: ({ row }) => {
        const val = row.getValue<number>('default_intake');
        return (
          <span className="text-xs text-muted-foreground text-right block">
            {val > 0 ? val : '—'}
          </span>
        );
      },
    },
    {
      accessorKey: 'sanctioned_intake',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Seats (this year)" />
      ),
      cell: ({ row }) => {
        const data = row.original;
        return (
          <div className="flex items-center gap-1 justify-end">
            <Input
              type="number"
              min={0}
              max={9999}
              value={data.sanctioned_intake}
              onChange={(e) => onUpdate(data.id, Number(e.target.value) || 0)}
              onKeyDown={(e) => { if (e.key === 'Enter') onSave(data); }}
              className="h-7 w-20 text-right text-xs"
              disabled={data.saving}
            />
            {data.dirty && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 w-7 p-0"
                onClick={() => onSave(data)}
                disabled={data.saving}
                title="Save this row"
              >
                {data.saving
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <Save className="h-3 w-3" />}
              </Button>
            )}
          </div>
        );
      },
    },
    {
      id: 'status',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => <StatusBadge row={row.original} />,
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={() => onEdit(row.original)}
          title="Edit seats"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      ),
    },
  ];
}
