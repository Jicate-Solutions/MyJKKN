'use client';

import { useState } from 'react';
import {
  ColumnDef,
  SortingState,
  OnChangeFn,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable
} from '@tanstack/react-table';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

interface PaginationProps {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: string;
}

interface SimpleDataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  loading?: boolean;
  pagination?: PaginationProps;
  emptyState?: EmptyStateProps;
}

export function SimpleDataTable<TData, TValue>({
  columns,
  data,
  sorting,
  onSortingChange,
  loading = false,
  pagination,
  emptyState
}: SimpleDataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting
    },
    onSortingChange,
    manualSorting: true,
    manualPagination: true
  });

  if (loading) {
    return (
      <div className='space-y-4'>
        <div className='rounded-md border'>
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      <Skeleton className='h-4 w-24' />
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={index}>
                  {columns.map((_, colIndex) => (
                    <TableCell key={colIndex}>
                      <Skeleton className='h-4 w-full' />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className='h-24 text-center'
                >
                  {emptyState ? (
                    <div className='flex flex-col items-center gap-2'>
                      <h3 className='text-lg font-semibold'>
                        {emptyState.title}
                      </h3>
                      <p className='text-muted-foreground'>
                        {emptyState.description}
                      </p>
                    </div>
                  ) : (
                    'No results.'
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {pagination && (
        <div className='flex items-center justify-between px-2'>
          <div className='text-sm text-muted-foreground'>
            Showing{' '}
            {Math.min(
              (pagination.page - 1) * pagination.pageSize + 1,
              pagination.totalCount
            )}{' '}
            to{' '}
            {Math.min(
              pagination.page * pagination.pageSize,
              pagination.totalCount
            )}{' '}
            of {pagination.totalCount} entries
          </div>
          <div className='flex items-center space-x-2'>
            <div className='flex items-center space-x-2'>
              <p className='text-sm font-medium'>Page</p>
              <div className='flex items-center space-x-1'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => pagination.onPageChange(1)}
                  disabled={pagination.page <= 1}
                >
                  <ChevronsLeft className='h-4 w-4' />
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => pagination.onPageChange(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                >
                  <ChevronLeft className='h-4 w-4' />
                </Button>
                <div className='flex items-center justify-center w-12 h-8 text-sm font-medium'>
                  {pagination.page}
                </div>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => pagination.onPageChange(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                >
                  <ChevronRight className='h-4 w-4' />
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => pagination.onPageChange(pagination.totalPages)}
                  disabled={pagination.page >= pagination.totalPages}
                >
                  <ChevronsRight className='h-4 w-4' />
                </Button>
              </div>
            </div>
            <p className='text-sm font-medium'>of {pagination.totalPages}</p>
          </div>
        </div>
      )}
    </div>
  );
}
