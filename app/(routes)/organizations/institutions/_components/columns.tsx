'use client';

import { ColumnDef, Row } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Institution } from '@/types/organizations';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { usePermissions } from '@/hooks/use-permissions';
import { Building2 } from 'lucide-react';
import { DataTableRowActions } from './row-actions';

const CounsellingCodeCell = ({ row }: { row: Row<Institution> }) => {
  const institution = row.original;
  const { canAccess, isSuperAdmin } = usePermissions();
  const canView =
    isSuperAdmin || canAccess('organizations.institutions', 'view');

  return canView ? (
    <Link
      href={`/organizations/institutions/${institution.id}`}
      className='flex items-center hover:text-primary font-medium'
    >
      <Building2 className='mr-2 h-4 w-4' />
      {institution.counselling_code}
    </Link>
  ) : (
    <div className='flex items-center font-medium'>
      <Building2 className='mr-2 h-4 w-4' />
      {institution.counselling_code}
    </div>
  );
};

export const columns: ColumnDef<Institution>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value: boolean) =>
          table.toggleAllPageRowsSelected(!!value)
        }
        aria-label='Select all'
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value: boolean) => row.toggleSelected(!!value)}
        aria-label='Select row'
      />
    ),
    enableSorting: false,
    enableHiding: false
  },
  {
    accessorKey: 'counselling_code',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Code' />
    ),
    cell: ({ row }) => <CounsellingCodeCell row={row} />
  },
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Name' />
    ),
    cell: ({ row }) => {
      return (
        <Link
          href={`/organizations/institutions/${row.original.id}`}
          className='font-medium hover:text-primary hover:underline'
        >
          {row.original.name}
        </Link>
      );
    }
  },
  {
    accessorKey: 'email',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Contact' />
    ),
    cell: ({ row }) => {
      const institution = row.original;
      return (
        <div className='flex flex-col'>
          <span className='text-sm'>{institution.email}</span>
          <span className='text-sm text-muted-foreground'>
            {institution.phone}
          </span>
        </div>
      );
    }
  },
  {
    accessorKey: 'is_active',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Status' />
    ),
    cell: ({ row }) => {
      const isActive = row.getValue('is_active') as boolean;
      return (
        <Badge variant={isActive ? 'default' : 'secondary'}>
          {isActive ? 'Active' : 'Inactive'}
        </Badge>
      );
    }
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Created At' />
    ),
    cell: ({ row }) => {
      const date = new Date(row.getValue('created_at'));
      return date.toLocaleDateString();
    }
  },
  {
    id: 'actions',
    cell: ({ row }) => <DataTableRowActions row={row} />
  }
];
