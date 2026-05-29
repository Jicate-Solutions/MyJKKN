'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2, Eye } from 'lucide-react';
import type { LearnerHostelite } from '@/types/campus-living';

function fullName(l: LearnerHostelite): string {
  const parts = [l.first_name, l.last_name].filter(Boolean).map((s) => s!.trim());
  return parts.join(' ') || '(unnamed)';
}

function hostelBadge(type: LearnerHostelite['hostel_type']) {
  if (!type) return <Badge variant='outline'>Not set</Badge>;
  const label = type === 'AC HOSTEL' ? 'AC' : 'Non-AC';
  const variant = type === 'AC HOSTEL' ? 'default' : 'secondary';
  return <Badge variant={variant}>{label}</Badge>;
}

export interface LearnerColumnHandlers {
  canEdit: boolean;
  isSuperAdmin: boolean;
  instName: (id: string) => string;
  onView: (learner: LearnerHostelite) => void;
  onEdit: (learner: LearnerHostelite) => void;
  onRemove: (learner: LearnerHostelite) => void;
}

export function getLearnerColumns(
  h: LearnerColumnHandlers,
): ColumnDef<LearnerHostelite>[] {
  const cols: ColumnDef<LearnerHostelite>[] = [
    {
      accessorKey: 'roll_number',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Roll' />,
      cell: ({ row }) => (
        <span className='font-mono text-xs'>{row.original.roll_number ?? '—'}</span>
      ),
      size: 120,
    },
    {
      accessorKey: 'first_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Name' />,
      cell: ({ row }) => (
        <button
          type='button'
          onClick={() => h.onView(row.original)}
          className='font-medium text-primary hover:underline text-left'
        >
          {fullName(row.original)}
        </button>
      ),
      size: 200,
    },
    {
      id: 'email',
      accessorFn: (r) => r.student_email ?? r.college_email ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Email' />,
      cell: ({ row }) => (
        <span className='text-xs text-muted-foreground'>
          {row.original.student_email ?? row.original.college_email ?? '—'}
        </span>
      ),
      enableSorting: false,
      size: 240,
    },
    {
      accessorKey: 'hostel_type',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Hostel' />,
      cell: ({ row }) => hostelBadge(row.original.hostel_type),
      enableSorting: false,
      size: 110,
    },
    {
      accessorKey: 'program_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Program' />,
      cell: ({ row }) => (
        <span className='text-sm'>{row.original.program_name ?? 'Not specified'}</span>
      ),
      size: 180,
    },
    {
      accessorKey: 'current_block_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Block' />,
      cell: ({ row }) => {
        const name = row.original.current_block_name;
        if (!name) return <Badge variant='outline'>Unassigned</Badge>;
        const code = row.original.current_block_code;
        return <span className='text-sm'>{name}{code ? ` (${code})` : ''}</span>;
      },
      size: 160,
    },
  ];

  if (h.isSuperAdmin) {
    cols.push({
      id: 'institution',
      accessorFn: (r) => r.institution_id,
      header: ({ column }) => <DataTableColumnHeader column={column} title='Institution' />,
      cell: ({ row }) => (
        <span className='text-xs text-muted-foreground'>
          {h.instName(row.original.institution_id)}
        </span>
      ),
      enableSorting: false,
      size: 200,
    });
  }

  cols.push(
    {
      accessorKey: 'gender',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Gender' />,
      cell: ({ row }) => (
        <span className='text-xs capitalize'>{row.original.gender?.toLowerCase() ?? '—'}</span>
      ),
      size: 90,
    },
    {
      id: 'actions',
      header: () => <span className='sr-only'>Actions</span>,
      cell: ({ row }) => (
        <div className='flex justify-end gap-1'>
          <Button variant='ghost' size='sm' onClick={() => h.onView(row.original)} title='View details'>
            <Eye className='h-4 w-4' />
          </Button>
          {h.canEdit && (
            <Button variant='ghost' size='sm' onClick={() => h.onEdit(row.original)} title='Edit hostel details'>
              <Pencil className='h-4 w-4' />
            </Button>
          )}
          <Button
            variant='ghost'
            size='sm'
            onClick={() => h.onRemove(row.original)}
            title='Remove from hostel (mark as day scholar)'
          >
            <Trash2 className='h-4 w-4 text-destructive' />
          </Button>
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
      size: 120,
    },
  );

  return cols;
}
