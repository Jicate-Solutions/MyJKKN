'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  flexRender,
  getCoreRowModel,
  useReactTable
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, RefreshCw } from 'lucide-react';
import { useLeaves } from '@/hooks/academic/use-leaves';
import { usePermissions } from '@/hooks/use-permissions';
import { columns } from './columns';
import type { LeavesSearchParams } from './data-table-schema';

interface LeavesDataTableProps {
  search: LeavesSearchParams;
}

export function LeavesDataTable({ search }: LeavesDataTableProps) {
  const router = useRouter();
  const { canAccess, isSuperAdmin, userProfile } = usePermissions();

  // For super admin, use selected institution from search; for others, use their own institution
  const effectiveInstitutionId = isSuperAdmin
    ? search.institution_id
    : userProfile?.institution_id ?? undefined;

  const {
    leaves,
    loading,
    error,
    metadata,
    fetchLeaves
  } = useLeaves({
    search: search.search,
    status: search.status,
    scope_level: search.scope_level,
    leave_type_id: search.leave_type_id,
    institution_id: effectiveInstitutionId,
    start_date: search.start_date,
    end_date: search.end_date,
    page: search.page,
    limit: search.pageSize
  });

  const canCreate = canAccess('academic.leaves', 'create');

  const table = useReactTable({
    data: leaves,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: metadata.totalPages
  });

  useEffect(() => {
    fetchLeaves({
      search: search.search,
      status: search.status,
      scope_level: search.scope_level,
      leave_type_id: search.leave_type_id,
      institution_id: effectiveInstitutionId,
      start_date: search.start_date,
      end_date: search.end_date,
      page: search.page,
      limit: search.pageSize
    });
  }, [search, effectiveInstitutionId, fetchLeaves]);

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams();
    Object.entries(search).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        params.set(key, String(value));
      }
    });
    params.set('page', String(newPage));
    router.push(`/academic/leaves?${params.toString()}`);
  };

  if (error) {
    return (
      <div className='text-center py-8'>
        <p className='text-destructive'>{error}</p>
        <Button variant='outline' onClick={() => fetchLeaves()} className='mt-4'>
          <RefreshCw className='h-4 w-4 mr-2' />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      {/* Toolbar */}
      <div className='flex items-center justify-between'>
        <div className='text-sm text-muted-foreground'>
          {metadata.total} leave{metadata.total !== 1 ? 's' : ''} found
        </div>
        <div className='flex items-center gap-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => fetchLeaves()}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {canCreate && (
            <Button
              size='sm'
              onClick={() => router.push('/academic/leaves/new')}
            >
              <Plus className='h-4 w-4 mr-2' />
              Add Leave
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {columns.map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className='h-8 w-full' />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows?.length ? (
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
                  No leaves found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className='flex items-center justify-between'>
        <div className='text-sm text-muted-foreground'>
          Page {metadata.page} of {metadata.totalPages || 1}
        </div>
        <div className='flex items-center gap-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => handlePageChange(metadata.page - 1)}
            disabled={metadata.page <= 1 || loading}
          >
            Previous
          </Button>
          <Button
            variant='outline'
            size='sm'
            onClick={() => handlePageChange(metadata.page + 1)}
            disabled={metadata.page >= metadata.totalPages || loading}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
