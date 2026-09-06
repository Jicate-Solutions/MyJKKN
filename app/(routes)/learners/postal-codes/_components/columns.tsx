'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2 } from 'lucide-react';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import type { PostalCode } from '@/types/postal-code';

interface GetColumnsOptions {
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (postalCode: PostalCode) => void;
  onDelete: (postalCode: PostalCode) => void;
  handleRowDeselection?: ((rowId: string) => void) | null;
}

export function getColumns({
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: GetColumnsOptions): ColumnDef<PostalCode>[] {
  const columns: ColumnDef<PostalCode>[] = [
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
      size: 50,
      minSize: 50,
      maxSize: 50,
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'pincode',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Pincode' />
      ),
      size: 100,
      minSize: 90,
      cell: ({ row }) => (
        <div className='font-medium'>{row.original.pincode}</div>
      ),
    },
    {
      accessorKey: 'office_name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Office Name' />
      ),
      size: 280,
      minSize: 200,
    },
    {
      accessorKey: 'division',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Division' />
      ),
      size: 160,
      minSize: 120,
      cell: ({ row }) => row.original.division ?? '—',
    },
    {
      accessorKey: 'district',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='District' />
      ),
      size: 140,
      minSize: 110,
    },
    {
      accessorKey: 'latitude',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Latitude' />
      ),
      size: 110,
      minSize: 90,
      enableSorting: false,
      cell: ({ row }) => row.original.latitude ?? '—',
    },
    {
      accessorKey: 'longitude',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Longitude' />
      ),
      size: 110,
      minSize: 90,
      enableSorting: false,
      cell: ({ row }) => row.original.longitude ?? '—',
    },
    {
      accessorKey: 'is_active',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Status' />
      ),
      size: 100,
      minSize: 90,
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? 'success' : 'secondary'}>
          {row.original.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
  ];

  if (canEdit || canDelete) {
    columns.push({
      id: 'actions',
      header: () => <span className='sr-only'>Actions</span>,
      size: 90,
      minSize: 90,
      maxSize: 100,
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <div className='flex justify-end gap-1'>
          {canEdit && (
            <Button
              variant='ghost'
              size='icon'
              className='h-8 w-8'
              onClick={() => onEdit(row.original)}
            >
              <Pencil className='h-4 w-4' />
            </Button>
          )}
          {canDelete && (
            <Button
              variant='ghost'
              size='icon'
              className='h-8 w-8 text-destructive hover:text-destructive'
              onClick={() => onDelete(row.original)}
            >
              <Trash2 className='h-4 w-4' />
            </Button>
          )}
        </div>
      ),
    });
  }

  return columns;
}
