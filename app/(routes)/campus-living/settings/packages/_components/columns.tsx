'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import type { AdmissionPackage } from '@/types/admission-packages';
import { PackageRowActions } from './row-actions';

export const createColumns = (): ColumnDef<AdmissionPackage>[] => [
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
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'name',
    header: 'Package',
    cell: ({ row }) => <p className='font-medium'>{row.original.name}</p>,
  },
  {
    accessorKey: 'package_type',
    header: 'Type',
    cell: ({ row }) => (
      <Badge
        variant={row.original.package_type === 'package' ? 'secondary' : 'outline'}
        className='font-normal'
      >
        {row.original.package_type === 'package' ? 'Bundled Package' : 'Non-Package'}
      </Badge>
    ),
  },
  {
    id: 'programme',
    header: 'Degree / Programme',
    cell: ({ row }) => {
      const deg = row.original.degree_name;
      const prg = row.original.programme_name;
      if (!deg && !prg) return <span className='text-muted-foreground text-sm'>Any</span>;
      return (
        <div className='text-sm'>
          {deg && <p className='text-muted-foreground'>{deg}</p>}
          {prg && <p className='font-medium'>{prg}</p>}
        </div>
      );
    },
  },
  {
    accessorKey: 'admission_year_name',
    header: 'Adm. Year',
    cell: ({ row }) => (
      <span className='text-sm text-muted-foreground'>
        {row.original.admission_year_name || 'Any'}
      </span>
    ),
  },
  {
    accessorKey: 'room_category_name',
    header: 'Room',
    cell: ({ row }) => (
      <span className='text-muted-foreground text-sm'>
        {row.original.room_category_name || '—'}
      </span>
    ),
  },
  {
    accessorKey: 'mess_category_name',
    header: 'Mess',
    cell: ({ row }) => (
      <span className='text-muted-foreground text-sm'>
        {row.original.mess_category_name || '—'}
      </span>
    ),
  },
  {
    accessorKey: 'is_active',
    header: 'Status',
    cell: ({ row }) => (
      <Badge variant={row.original.is_active ? 'default' : 'outline'}>
        {row.original.is_active ? 'Active' : 'Inactive'}
      </Badge>
    ),
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => <PackageRowActions pkg={row.original} />,
  },
];
