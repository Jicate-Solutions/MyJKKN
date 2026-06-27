'use client';

import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { JOB_STATUS_LABELS, type HRRecruitmentJob } from '@/types/hr-recruitment';

import { ROLE_CATEGORY_LABELS } from './labels';

interface JobColumnHelpers {
  institutionNameById: ReadonlyMap<string, string>;
  departmentNameById: ReadonlyMap<string, string>;
  onEdit: (row: HRRecruitmentJob) => void;
  onDelete: (row: HRRecruitmentJob) => void;
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  open: 'default',
  draft: 'secondary',
  on_hold: 'outline',
  closed: 'secondary',
  filled: 'secondary',
};

export function getJobColumns({
  institutionNameById,
  departmentNameById,
  onEdit,
  onDelete,
}: JobColumnHelpers): ColumnDef<HRRecruitmentJob>[] {
  return [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label='Select all'
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label='Select row'
        />
      ),
      enableSorting: false,
      enableHiding: false,
      size: 40,
      minSize: 40,
      maxSize: 40,
    },
    {
      accessorKey: 'title',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Job title' />
      ),
      cell: ({ row }) => (
        <Link
          href={`/hr/recruitment/jobs/${row.original.id}`}
          className='font-medium hover:underline hover:text-primary transition-colors'
        >
          {row.original.title}
        </Link>
      ),
      size: 260,
      minSize: 180,
      maxSize: 380,
    },
    {
      accessorKey: 'role_category',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Role category' />
      ),
      cell: ({ row }) => (
        <span className='text-sm'>
          {ROLE_CATEGORY_LABELS[row.original.role_category] ??
            row.original.role_category}
        </span>
      ),
      size: 160,
      minSize: 120,
      maxSize: 200,
    },
    {
      id: 'institution',
      header: 'Institution',
      cell: ({ row }) => (
        <span className='text-sm'>
          {institutionNameById.get(row.original.institution_id ?? '') ?? '—'}
        </span>
      ),
      enableSorting: false,
      size: 200,
      minSize: 140,
      maxSize: 300,
    },
    {
      id: 'department',
      header: 'Department',
      cell: ({ row }) => (
        <span className='text-sm text-muted-foreground'>
          {departmentNameById.get(row.original.department_id ?? '') ?? '—'}
        </span>
      ),
      enableSorting: false,
      size: 180,
      minSize: 120,
      maxSize: 260,
    },
    {
      accessorKey: 'status',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Status' />
      ),
      cell: ({ row }) => {
        const status = row.original.status;
        return (
          <Badge variant={STATUS_VARIANT[status] ?? 'secondary'}>
            {JOB_STATUS_LABELS[status] ?? status}
          </Badge>
        );
      },
      size: 110,
      minSize: 90,
      maxSize: 140,
    },
    {
      accessorKey: 'positions_filled',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Filled' />
      ),
      cell: ({ row }) => (
        <span className='text-xs tabular-nums'>
          {row.original.positions_filled} / {row.original.positions_open}
        </span>
      ),
      size: 90,
      minSize: 70,
      maxSize: 120,
    },
    {
      accessorKey: 'posted_at',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Posted' />
      ),
      cell: ({ row }) => {
        const posted = row.original.posted_at;
        const date = posted ?? row.original.created_at;
        if (!date) return <span className='text-xs text-muted-foreground'>—</span>;
        return (
          <span className='text-xs text-muted-foreground'>
            {new Date(date).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
            {!posted && (
              <span className='ml-1 italic opacity-70'>(created)</span>
            )}
          </span>
        );
      },
      size: 140,
      minSize: 110,
      maxSize: 170,
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className='flex justify-end'>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant='ghost'
                className='flex h-8 w-8 p-0 data-[state=open]:bg-muted'
              >
                <MoreHorizontal className='h-4 w-4' />
                <span className='sr-only'>Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-[160px]'>
              <DropdownMenuItem asChild>
                <Link href={`/hr/recruitment/jobs/${row.original.id}`}>
                  <Eye className='mr-2 h-4 w-4' />
                  View details
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEdit(row.original)}>
                <Pencil className='mr-2 h-4 w-4' />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDelete(row.original)}
                className='text-destructive focus:text-destructive'
              >
                <Trash2 className='mr-2 h-4 w-4' />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
      size: 70,
      minSize: 60,
      maxSize: 90,
    },
  ];
}
