'use client';

// Columns for campus-living hostel leave types data-table.
// Bespoke (not extracted) — campus-living shows 4 flag badges (parent consent,
// chief warden, attachment, system) that academic's columns don't have.

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Building2, Shield, Paperclip, UserCheck, Lock } from 'lucide-react';
import type { HostelLeaveType } from '@/types/hostel-leave-types';
import { HostelLeaveTypeRowActions } from './row-actions';

interface ColumnsConfig {
  institutionMap: Map<string, string>;
  isSuperAdmin: boolean;
}

export const createColumns = ({
  institutionMap,
  isSuperAdmin
}: ColumnsConfig): ColumnDef<HostelLeaveType>[] => {
  const columns: ColumnDef<HostelLeaveType>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected()
              ? true
              : table.getIsSomePageRowsSelected()
              ? 'indeterminate'
              : false
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
          disabled={row.original.is_system}
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
          {row.original.is_system && (
            <Lock
              className='h-3 w-3 text-muted-foreground'
              aria-label='System default — cannot be deleted'
            />
          )}
        </div>
      )
    },
    {
      accessorKey: 'default_max_duration_days',
      header: 'Max Days',
      cell: ({ row }) => {
        const days = row.original.default_max_duration_days;
        return (
          <Badge variant='outline'>
            {days == null ? 'No limit' : `${days} ${days === 1 ? 'day' : 'days'}`}
          </Badge>
        );
      }
    }
  ];

  if (isSuperAdmin) {
    columns.push({
      accessorKey: 'institution_id',
      header: 'Institution',
      cell: ({ row }) => {
        const name = institutionMap.get(row.original.institution_id);
        return (
          <div className='flex items-center gap-2'>
            <Building2 className='h-4 w-4 text-muted-foreground flex-shrink-0' />
            <span className='text-sm truncate max-w-[200px]' title={name}>
              {name || 'Unknown'}
            </span>
          </div>
        );
      }
    });
  }

  columns.push(
    {
      id: 'approval_flags',
      header: 'Requires',
      cell: ({ row }) => {
        const flags: { icon: typeof Shield; label: string; on: boolean }[] = [
          { icon: UserCheck, label: 'Parent consent', on: row.original.requires_parent_consent },
          { icon: Shield, label: 'Chief warden approval', on: row.original.requires_chief_warden },
          { icon: Paperclip, label: 'Attachment', on: row.original.requires_attachment }
        ];
        return (
          <div className='flex items-center gap-1.5'>
            {flags
              .filter((f) => f.on)
              .map((f) => {
                const Icon = f.icon;
                return (
                  <span
                    key={f.label}
                    title={f.label}
                    className='inline-flex items-center justify-center w-6 h-6 rounded border bg-muted'
                  >
                    <Icon className='h-3 w-3 text-muted-foreground' />
                  </span>
                );
              })}
            {flags.every((f) => !f.on) && (
              <span className='text-xs text-muted-foreground'>—</span>
            )}
          </div>
        );
      }
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
      cell: ({ row }) => <HostelLeaveTypeRowActions leaveType={row.original} />
    }
  );

  return columns;
};
