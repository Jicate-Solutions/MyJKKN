'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import type { HostelResidentWithProfile, HostelResidentType } from '@/types/hostel-residents';
import { HostelResidentRowActions } from './row-actions';

const typeVariant: Record<
  HostelResidentType,
  'default' | 'secondary' | 'destructive' | 'outline' | 'success'
> = {
  learner: 'default',
  staff: 'secondary',
  international: 'outline',
  married: 'outline',
  visitor: 'outline',
  other: 'outline',
};

interface ColumnArgs {
  institutionMap: Map<string, string>;
  isSuperAdmin: boolean;
}

export function createColumns({
  institutionMap,
  isSuperAdmin,
}: ColumnArgs): ColumnDef<HostelResidentWithProfile>[] {
  const cols: ColumnDef<HostelResidentWithProfile>[] = [
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
      accessorKey: 'profile',
      header: 'Name',
      cell: ({ row }) => {
        const profile = row.original.profile;
        return (
          <div className='flex flex-col'>
            <span className='font-medium'>
              {profile?.full_name ?? <span className='text-muted-foreground'>—</span>}
            </span>
            {profile?.email && (
              <span className='text-xs text-muted-foreground'>{profile.email}</span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'resident_type',
      header: 'Type',
      cell: ({ row }) => {
        const t = row.original.resident_type;
        return (
          <Badge variant={typeVariant[t]} className='capitalize'>
            {t}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'id_proof_type',
      header: 'ID Proof',
      cell: ({ row }) => {
        const type = row.original.id_proof_type;
        const num = row.original.id_proof_number;
        if (!type && !num) return <span className='text-muted-foreground'>—</span>;
        return (
          <div className='flex flex-col'>
            {type && <span className='text-xs'>{type}</span>}
            {num && <span className='font-mono text-xs'>{num}</span>}
          </div>
        );
      },
    },
    {
      accessorKey: 'is_active',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? 'success' : 'secondary'}>
          {row.original.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      id: 'actions',
      cell: ({ row }) => <HostelResidentRowActions resident={row.original} />,
      enableSorting: false,
      enableHiding: false,
    },
  ];

  // Institution column only for super_admin (cross-institution view)
  if (isSuperAdmin) {
    cols.splice(4, 0, {
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
