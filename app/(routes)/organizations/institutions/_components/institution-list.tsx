// app/(routes)/organizations/institutions/_components/institution-list.tsx

'use client';

import { useMemo, useCallback } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { MoreVertical, Edit, Trash2, Building2 } from 'lucide-react';
import { Institution } from '@/types/organizations';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { usePermissions } from '@/hooks/use-permissions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { DataTable, PermissionColumnDef } from '@/components/ui/data-table';
import { toast } from 'react-hot-toast';
import { Plus } from 'lucide-react';

interface InstitutionListProps {
  institutions: Institution[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  onRefresh: () => void;
  paginationLoading?: boolean;
  onSearch?: (query: string) => void;
}

export function InstitutionList({
  institutions,
  metadata,
  onPageChange,
  onPageSizeChange,
  onRefresh,
  paginationLoading,
  onSearch
}: InstitutionListProps) {
  const { canAccess, isSuperAdmin } = usePermissions();

  const canViewInstitutions =
    isSuperAdmin || canAccess('organizations.institutions', 'view');
  const canEditInstitutions =
    isSuperAdmin || canAccess('organizations.institutions', 'edit');
  const canDeleteInstitutions =
    isSuperAdmin || canAccess('organizations.institutions', 'delete');

  // Handle bulk delete
  const handleBulkDelete = async (selectedRows: Institution[]) => {
    try {
      // Process deletions sequentially to handle potential storage cleanup properly
      for (const institution of selectedRows) {
        await OrganizationService.deleteInstitution(institution.id);
      }

      toast.success(`${selectedRows.length} institutions deleted successfully`);
      onRefresh();
    } catch (error) {
      console.error('Error deleting institutions:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete institutions'
      );
      throw error; // Re-throw to let DataTable handle the error state
    }
  };

  // Handle single delete
  const handleSingleDelete = useCallback(
    async (institution: Institution) => {
      try {
        await OrganizationService.deleteInstitution(institution.id);
        toast.success('Institution deleted successfully');
        onRefresh();
      } catch (error) {
        console.error('Error deleting institution:', error);
        toast.error(
          error instanceof Error
            ? error.message
            : 'Failed to delete institution'
        );
      }
    },
    [onRefresh]
  );

  // Format date helper
  const formatDate = (date: string) => {
    return format(new Date(date), 'MMM d, yyyy');
  };

  // Define columns for the data table
  const columns: PermissionColumnDef<Institution, any>[] = useMemo(
    () => [
      {
        id: 'counselling_code',
        accessorKey: 'counselling_code',
        header: 'Code',
        cell: ({ row }) => {
          const institution = row.original;
          return canViewInstitutions ? (
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
        }
      },
      {
        id: 'name',
        accessorKey: 'name',
        header: 'Institution Name',
        cell: ({ row }) => {
          return <span className='font-medium'>{row.getValue('name')}</span>;
        }
      },
      {
        id: 'contact',
        header: 'Contact',
        cell: ({ row }) => {
          const institution = row.original;
          return (
            <div className='flex flex-col'>
              {institution.email && (
                <span className='text-sm text-muted-foreground'>
                  {institution.email}
                </span>
              )}
              {institution.phone && (
                <span className='text-sm text-muted-foreground'>
                  {institution.phone}
                </span>
              )}
            </div>
          );
        }
      },

      {
        id: 'is_active',
        accessorKey: 'is_active',
        header: 'Status',
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
        id: 'created_at',
        accessorKey: 'created_at',
        header: 'Created',
        cell: ({ row }) => {
          return formatDate(row.getValue('created_at'));
        }
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
          const institution = row.original;

          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant='ghost' className='h-8 w-8 p-0'>
                  <span className='sr-only'>Open menu</span>
                  <MoreVertical className='h-4 w-4' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem
                  asChild={canViewInstitutions}
                  disabled={!canViewInstitutions}
                  style={{ opacity: canViewInstitutions ? 1 : 0.5 }}
                >
                  {canViewInstitutions ? (
                    <Link
                      href={`/organizations/institutions/${institution.id}`}
                      className='cursor-pointer'
                    >
                      <Building2 className='mr-2 h-4 w-4' />
                      View
                    </Link>
                  ) : (
                    <div>
                      <Building2 className='mr-2 h-4 w-4' />
                      View
                    </div>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  asChild={canEditInstitutions}
                  disabled={!canEditInstitutions}
                  style={{ opacity: canEditInstitutions ? 1 : 0.5 }}
                >
                  {canEditInstitutions ? (
                    <Link
                      href={`/organizations/institutions/${institution.id}/edit`}
                      className='cursor-pointer'
                    >
                      <Edit className='mr-2 h-4 w-4' />
                      Edit
                    </Link>
                  ) : (
                    <div className='flex items-center gap-2'>
                      <Edit className='mr-2 h-4 w-4' />
                      Edit
                    </div>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={
                    canDeleteInstitutions
                      ? () => handleSingleDelete(institution)
                      : undefined
                  }
                  disabled={!canDeleteInstitutions}
                  className={
                    canDeleteInstitutions
                      ? 'text-destructive focus:text-destructive cursor-pointer'
                      : 'cursor-pointer'
                  }
                  style={{ opacity: canDeleteInstitutions ? 1 : 0.5 }}
                >
                  <Trash2 className='mr-2 h-4 w-4' />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
        enableSorting: false,
        enableHiding: false
      }
    ],
    [
      canViewInstitutions,
      canEditInstitutions,
      canDeleteInstitutions,
      handleSingleDelete
    ]
  );

  // Create table tools (action buttons)
  const tableTools = (
    <div className='flex flex-col sm:flex-row gap-2'>
      {canEditInstitutions ? (
        <Button className='w-full sm:w-auto' asChild>
          <Link href='/organizations/institutions/new'>
            <Plus className='mr-2 h-4 w-4' />
            Add Institution
          </Link>
        </Button>
      ) : (
        <Button
          className='w-full sm:w-auto opacity-50'
          disabled
          variant='outline'
        >
          <Plus className='mr-2 h-4 w-4' />
          Add Institution
        </Button>
      )}
    </div>
  );

  return (
    <DataTable
      columns={columns}
      data={institutions}
      searchPlaceholder='Search institutions...'
      onSearch={onSearch}
      permissions={{
        module: 'organizations.institutions',
        actions: {
          view: true,
          delete: true
        },
        showPermissionError: true
      }}
      tableTools={tableTools}
      onDeleteSelected={canDeleteInstitutions ? handleBulkDelete : undefined}
      getRowId={(row) => row.id}
      onRefresh={onRefresh}
      showRefresh={true}
      serverSidePagination={{
        currentPage: metadata.page,
        totalPages: metadata.totalPages,
        pageSize: metadata.limit,
        totalItems: metadata.total,
        hasNextPage: metadata.page < metadata.totalPages,
        hasPreviousPage: metadata.page > 1,
        onPageChange: onPageChange,
        onPageSizeChange: onPageSizeChange,
        isLoading: paginationLoading
      }}
    />
  );
}
