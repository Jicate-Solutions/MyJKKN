'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import type { HostelWarden, WardenDesignation } from '@/types/campus-living';
import { HostelWardenRowActions } from './row-actions';

export type HostelWardenWithRefs = HostelWarden & {
  hostel_blocks?: { name?: string | null; code?: string | null } | null;
  staff_name?: string | null;
};

const designationVariant: Record<
  WardenDesignation,
  'default' | 'secondary' | 'destructive' | 'outline' | 'success'
> = {
  chief_warden: 'default',
  warden: 'secondary',
  deputy_warden: 'outline',
  floor_supervisor: 'outline',
  night_watcher: 'outline',
};

const designationLabel: Record<WardenDesignation, string> = {
  chief_warden: 'Chief Warden',
  warden: 'Warden',
  deputy_warden: 'Deputy Warden',
  floor_supervisor: 'Floor Supervisor',
  night_watcher: 'Night Watcher',
};

interface ColumnArgs {
  institutionMap: Map<string, string>;
  staffMap: Map<string, { full_name: string | null; email: string | null }>;
  isSuperAdmin: boolean;
}

export function createColumns({
  institutionMap,
  staffMap,
  isSuperAdmin,
}: ColumnArgs): ColumnDef<HostelWardenWithRefs>[] {
  const cols: ColumnDef<HostelWardenWithRefs>[] = [
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
    },
    {
      accessorKey: 'staff_id',
      header: 'Name',
      cell: ({ row }) => {
        const staff = staffMap.get(row.original.staff_id);
        return (
          <div className='flex flex-col'>
            <span className='font-medium'>
              {staff?.full_name ?? <span className='text-muted-foreground font-mono text-xs'>{row.original.staff_id}</span>}
            </span>
            {staff?.email && (
              <span className='text-xs text-muted-foreground'>{staff.email}</span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'designation',
      header: 'Designation',
      cell: ({ row }) => {
        const d = row.original.designation;
        return (
          <Badge variant={designationVariant[d]}>{designationLabel[d]}</Badge>
        );
      },
    },
    {
      accessorKey: 'block_id',
      header: 'Block',
      cell: ({ row }) => {
        const block = row.original.hostel_blocks;
        if (!block?.name) return <span className='text-muted-foreground'>—</span>;
        return (
          <div className='flex flex-col'>
            <span>{block.name}</span>
            {block.code && (
              <span className='text-xs text-muted-foreground font-mono'>{block.code}</span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'phone',
      header: 'Phone',
      cell: ({ row }) => (
        <span className='font-mono text-xs'>{row.original.phone}</span>
      ),
    },
    {
      accessorKey: 'shift',
      header: 'Shift',
      cell: ({ row }) => {
        const s = row.original.shift;
        if (!s) return <span className='text-muted-foreground'>—</span>;
        return (
          <Badge variant='outline' className='capitalize'>
            {s.replace('_', ' ')}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'is_active',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? 'success' : 'secondary'}>
          {row.original.is_active ? 'Active' : 'Relieved'}
        </Badge>
      ),
    },
    {
      id: 'actions',
      cell: ({ row }) => <HostelWardenRowActions warden={row.original} />,
      enableSorting: false,
      enableHiding: false,
    },
  ];

  if (isSuperAdmin) {
    cols.splice(6, 0, {
      accessorKey: 'institution_id',
      header: 'Institution',
      cell: ({ row }) => (
        <span className='text-xs text-muted-foreground'>
          {institutionMap.get(row.original.institution_id) ?? row.original.institution_id}
        </span>
      ),
    });
  }

  return cols;
}
