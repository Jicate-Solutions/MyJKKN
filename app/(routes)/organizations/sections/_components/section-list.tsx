'use client';

import { useMemo, useCallback, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { MoreVertical, Edit, Trash2, Eye, Plus } from 'lucide-react';
import { Section } from '@/types/organizations';
import { SectionService } from '@/lib/services/organization/section-service';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { DataTable, PermissionColumnDef } from '@/components/ui/data-table';
import { toast } from 'react-hot-toast';

interface SectionListProps {
  sections: Section[];
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
}

export function SectionList({
  sections,
  metadata,
  onPageChange,
  onPageSizeChange,
  onRefresh,
  paginationLoading
}: SectionListProps) {
  const { canAccess, isSuperAdmin } = usePermissions();

  // State for confirmation dialogs
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    type: 'single' | 'bulk';
    section?: Section;
    sections?: Section[];
    isDeleting: boolean;
  }>({
    isOpen: false,
    type: 'single',
    isDeleting: false
  });

  const canViewSections =
    isSuperAdmin || canAccess('organizations.sections', 'view');
  const canEditSections =
    isSuperAdmin || canAccess('organizations.sections', 'edit');
  const canDeleteSections =
    isSuperAdmin || canAccess('organizations.sections', 'delete');

  // Handle bulk delete confirmation
  const handleBulkDeleteConfirm = async (selectedRows: Section[]) => {
    setDeleteConfirmation({
      isOpen: true,
      type: 'bulk',
      sections: selectedRows,
      isDeleting: false
    });
  };

  // Handle single delete confirmation
  const handleSingleDeleteConfirm = (section: Section) => {
    setDeleteConfirmation({
      isOpen: true,
      type: 'single',
      section: section,
      isDeleting: false
    });
  };

  // Execute the actual delete operation
  const executeDelete = async () => {
    if (!deleteConfirmation.section && !deleteConfirmation.sections) return;

    try {
      setDeleteConfirmation((prev) => ({ ...prev, isDeleting: true }));

      if (deleteConfirmation.type === 'bulk' && deleteConfirmation.sections) {
        // Process bulk deletions sequentially
        for (const section of deleteConfirmation.sections) {
          await SectionService.deleteSection(section.id);
        }
        toast.success(
          `${deleteConfirmation.sections.length} sections deleted successfully`
        );
      } else if (
        deleteConfirmation.type === 'single' &&
        deleteConfirmation.section
      ) {
        // Process single deletion
        await SectionService.deleteSection(deleteConfirmation.section.id);
        toast.success('Section deleted successfully');
      }

      // Close dialog and refresh data
      setDeleteConfirmation({
        isOpen: false,
        type: 'single',
        isDeleting: false
      });
      onRefresh();
    } catch (error) {
      console.error('Error deleting section(s):', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete section(s)'
      );
      setDeleteConfirmation((prev) => ({ ...prev, isDeleting: false }));
    }
  };

  // Cancel delete operation
  const cancelDelete = () => {
    if (deleteConfirmation.isDeleting) return; // Prevent closing while deleting
    setDeleteConfirmation({
      isOpen: false,
      type: 'single',
      isDeleting: false
    });
  };

  // Format date helper
  const formatDate = (date: string) => {
    return format(new Date(date), 'MMM d, yyyy');
  };

  // Define columns for the data table
  const columns: PermissionColumnDef<Section, any>[] = useMemo(
    () => [
      {
        id: 'section_info',
        header: 'Section',
        cell: ({ row }) => {
          const section = row.original;
          return canViewSections ? (
            <Link
              href={`/organizations/sections/${section.id}`}
              className='flex items-center hover:text-primary font-medium'
            >
              {section.section_name}
            </Link>
          ) : (
            <div className='font-medium'>{section.section_name}</div>
          );
        }
      },
      {
        id: 'institution',
        header: 'Institution',
        cell: ({ row }) => {
          const section = row.original;
          return (
            <div className='flex flex-col'>
              <span className='font-medium'>
                {section.institution?.name || 'N/A'}
              </span>
              {section.institution?.counselling_code && (
                <span className='text-sm text-muted-foreground'>
                  {section.institution.counselling_code}
                </span>
              )}
            </div>
          );
        }
      },

      {
        id: 'program',
        header: 'Program',
        cell: ({ row }) => {
          const section = row.original;
          return (
            <div className='text-sm'>
              {section.program?.program_name || 'N/A'}
            </div>
          );
        }
      },
      {
        id: 'semester',
        header: 'Semester',
        cell: ({ row }) => {
          const section = row.original;
          return (
            <div className='flex flex-col'>
              <span className='text-sm font-medium'>
                {section.semester?.semester_name || 'N/A'}
              </span>
              {section.semester?.semester_code && (
                <span className='text-xs text-muted-foreground'>
                  {section.semester.semester_code}
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
          const section = row.original;

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
                  asChild={canViewSections}
                  disabled={!canViewSections}
                  style={{ opacity: canViewSections ? 1 : 0.5 }}
                >
                  {canViewSections ? (
                    <Link
                      href={`/organizations/sections/${section.id}`}
                      className='cursor-pointer'
                    >
                      <Eye className='mr-2 h-4 w-4' />
                      View
                    </Link>
                  ) : (
                    <div>
                      <Eye className='mr-2 h-4 w-4' />
                      View
                    </div>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  asChild={canEditSections}
                  disabled={!canEditSections}
                  style={{ opacity: canEditSections ? 1 : 0.5 }}
                >
                  {canEditSections ? (
                    <Link
                      href={`/organizations/sections/${section.id}/edit`}
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
                    canDeleteSections
                      ? () => handleSingleDeleteConfirm(section)
                      : undefined
                  }
                  disabled={!canDeleteSections}
                  className={
                    canDeleteSections
                      ? 'text-destructive focus:text-destructive cursor-pointer'
                      : 'cursor-pointer'
                  }
                  style={{ opacity: canDeleteSections ? 1 : 0.5 }}
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
      canViewSections,
      canEditSections,
      canDeleteSections,
      handleSingleDeleteConfirm
    ]
  );

  // Create table tools (action buttons)
  const tableTools = (
    <div className='flex flex-col sm:flex-row gap-2'>
      {canEditSections ? (
        <Button className='w-full sm:w-auto' asChild>
          <Link href='/organizations/sections/new'>
            <Plus className='mr-2 h-4 w-4' />
            Create Section
          </Link>
        </Button>
      ) : (
        <Button
          className='w-full sm:w-auto opacity-50'
          disabled
          variant='outline'
        >
          <Plus className='mr-2 h-4 w-4' />
          Create Section
        </Button>
      )}
    </div>
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={sections}
        searchPlaceholder='Search sections...'
        filterColumn='section_info'
        permissions={{
          module: 'organizations.sections',
          actions: {
            view: true,
            delete: true
          },
          showPermissionError: true
        }}
        tableTools={tableTools}
        onDeleteSelected={
          canDeleteSections ? handleBulkDeleteConfirm : undefined
        }
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteConfirmation.isOpen}
        onOpenChange={() => !deleteConfirmation.isDeleting && cancelDelete()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteConfirmation.type === 'bulk'
                ? 'Delete Sections'
                : 'Delete Section'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirmation.type === 'bulk' ? (
                <>
                  Are you sure you want to delete{' '}
                  <strong>{deleteConfirmation.sections?.length}</strong>{' '}
                  selected section(s)? This action cannot be undone and will
                  permanently remove the section(s) from the system.
                </>
              ) : (
                <>
                  Are you sure you want to delete the section{' '}
                  <strong>
                    &ldquo;{deleteConfirmation.section?.section_name}&rdquo;
                  </strong>
                  ? This action cannot be undone and will permanently remove the
                  section from the system.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteConfirmation.isDeleting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={executeDelete}
              disabled={deleteConfirmation.isDeleting}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {deleteConfirmation.isDeleting ? (
                <>
                  <div className='mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent'></div>
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
