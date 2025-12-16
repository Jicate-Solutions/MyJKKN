'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Building2 } from 'lucide-react';
import type { LeaveType } from '@/types/leaves';
import { LeaveTypeRowActions } from './row-actions';

interface ColumnsConfig {
  institutionMap: Map<string, string>;
  isSuperAdmin: boolean;
}

export const createColumns = ({
  institutionMap,
  isSuperAdmin
}: ColumnsConfig): ColumnDef<LeaveType>[] => {
  const columns: ColumnDef<LeaveType>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label='Select all'
          className='translate-y-[2px]'
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label='Select row'
          className='translate-y-[2px]'
        />
      ),
      enableSorting: false,
      enableHiding: false
    },
    {
      accessorKey: 'leave_type_code',
      header: 'Code',
      cell: ({ row }) => (
        <span className='font-mono text-sm'>{row.original.leave_type_code}</span>
      )
    },
    {
      accessorKey: 'leave_type_name',
      header: 'Name',
      cell: ({ row }) => (
        <div className='flex items-center gap-2'>
          <span
            className='w-3 h-3 rounded-full flex-shrink-0'
            style={{ backgroundColor: row.original.color_code }}
          />
          <span className='font-medium'>{row.original.leave_type_name}</span>
        </div>
      )
    }
  ];

  // Add institution column for super admin
  if (isSuperAdmin) {
    columns.push({
      accessorKey: 'institution_id',
      header: 'Institution',
      cell: ({ row }) => {
        const institutionName = institutionMap.get(row.original.institution_id);
        return (
          <div className='flex items-center gap-2'>
            <Building2 className='h-4 w-4 text-muted-foreground flex-shrink-0' />
            <span className='text-sm truncate max-w-[200px]' title={institutionName}>
              {institutionName || 'Unknown'}
            </span>
          </div>
        );
      }
    });
  }

  // Add remaining columns
  columns.push(
    {
      accessorKey: 'requires_approval',
      header: 'Approval',
      cell: ({ row }) => (
        <Badge variant={row.original.requires_approval ? 'default' : 'secondary'}>
          {row.original.requires_approval ? 'Yes' : 'No'}
        </Badge>
      )
    },
    {
      accessorKey: 'is_active',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? 'default' : 'outline'}>
          {row.original.is_active ? 'Active' : 'Inactive'}
        </Badge>
      )
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => <LeaveTypeRowActions leaveType={row.original} />
    }
  );

  return columns;
};
