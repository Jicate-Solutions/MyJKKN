'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Eye, MoreHorizontal, Pencil, Power, Trash2 } from 'lucide-react';

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
import {
  MONTHLY_SALARY_BAND_LABELS,
  ROLE_CATEGORY_LABELS,
  type HRApprovalFlow,
  type MonthlySalaryBand,
  type RoleCategory,
} from '@/types/hr-recruitment';

interface FlowColumnHelpers {
  orgNameById: ReadonlyMap<string, string>;
  roleNameByKey: ReadonlyMap<string, string>;
  onView: (row: HRApprovalFlow) => void;
  onEdit: (row: HRApprovalFlow) => void;
  onToggle: (row: HRApprovalFlow) => void;
  onDelete: (row: HRApprovalFlow) => void;
}

const conditionsOf = (f: HRApprovalFlow) =>
  (f.conditions as Record<string, string> | null) ?? {};

export function getFlowColumns({
  orgNameById,
  roleNameByKey,
  onView,
  onEdit,
  onToggle,
  onDelete,
}: FlowColumnHelpers): ColumnDef<HRApprovalFlow>[] {
  const stepsPreview = (f: HRApprovalFlow) =>
    (f.steps ?? [])
      .map(
        (s) =>
          s.approver_name ??
          roleNameByKey.get((s.approver_role ?? '').toLowerCase()) ??
          s.approver_role,
      )
      .join(' → ');

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
      accessorKey: 'flow_name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Workflow' />
      ),
      cell: ({ row }) => (
        <button
          type='button'
          className='cursor-pointer text-left font-medium hover:underline'
          onClick={() => onView(row.original)}
        >
          {row.original.flow_name}
        </button>
      ),
      size: 240,
      minSize: 160,
      maxSize: 360,
    },
    {
      id: 'role_category',
      // Sorting is server-side (fetchDataFn); the accessor only enables the
      // header sort toggle.
      accessorFn: (f) => conditionsOf(f).role_category ?? '',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Role category' />
      ),
      cell: ({ row }) => {
        const cond = conditionsOf(row.original);
        const cat = cond.role_category;
        const band = cond.monthly_salary_band;
        return (
          <span className='inline-flex items-center gap-1.5 flex-wrap text-sm'>
            {cat ? (ROLE_CATEGORY_LABELS[cat as RoleCategory] ?? cat) : '—'}
            {band && (
              <Badge variant='outline' className='text-[10px]'>
                {MONTHLY_SALARY_BAND_LABELS[band as MonthlySalaryBand] ?? band}
              </Badge>
            )}
          </span>
        );
      },
      size: 200,
      minSize: 140,
      maxSize: 280,
    },
    {
      id: 'organization',
      accessorFn: (f) => orgNameById.get(f.hr_organization_id) ?? '',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Organization' />
      ),
      cell: ({ row }) => (
        <span className='text-sm'>
          {orgNameById.get(row.original.hr_organization_id) ??
            row.original.hr_organization_id}
        </span>
      ),
      size: 200,
      minSize: 140,
      maxSize: 300,
    },
    {
      id: 'chain',
      header: 'Approval chain',
      cell: ({ row }) => {
        const count = (row.original.steps ?? []).length;
        const preview = stepsPreview(row.original);
        return (
          <span
            className='block truncate text-sm text-muted-foreground'
            title={preview}
          >
            <Badge variant='outline' className='text-[10px] mr-1.5 tabular-nums'>
              {count} step{count === 1 ? '' : 's'}
            </Badge>
            {preview}
          </span>
        );
      },
      enableSorting: false,
      size: 300,
      minSize: 180,
      maxSize: 460,
    },
    {
      id: 'is_active',
      accessorKey: 'is_active',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Status' />
      ),
      cell: ({ row }) => (
        <Badge
          variant={row.original.is_active ? 'default' : 'secondary'}
          className='text-[10px]'
        >
          {row.original.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
      size: 100,
      minSize: 80,
      maxSize: 130,
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const cond = conditionsOf(row.original);
        // The editor only manages band-less category templates; banded or
        // condition-less rows are legacy and view-only here.
        const editable = !!cond.role_category && !cond.monthly_salary_band;
        return (
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
              <DropdownMenuContent align='end' className='w-[180px]'>
                <DropdownMenuItem onClick={() => onView(row.original)}>
                  <Eye className='mr-2 h-4 w-4' />
                  View details
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!editable}
                  onClick={() => onEdit(row.original)}
                >
                  <Pencil className='mr-2 h-4 w-4' />
                  {editable ? 'Edit' : 'Edit (legacy flow)'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onToggle(row.original)}>
                  <Power className='mr-2 h-4 w-4' />
                  {row.original.is_active ? 'Deactivate' : 'Activate'}
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
        );
      },
      enableSorting: false,
      enableHiding: false,
      size: 70,
      minSize: 60,
      maxSize: 90,
    },
  ];
}
