'use client';

import { DataTable } from '@/components/data-table/data-table';
import { columns } from './columns';
import type { SectionsSearchParams } from './data-table-schema';
import { Button } from '@/components/ui/button';
import { Plus, TrashIcon, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { SectionService } from '@/lib/services/organization/section-service';
import { Section } from '@/types/organizations';
import { usePermissions } from '@/hooks/use-permissions';
import { useState } from 'react';
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
import toast from 'react-hot-toast';

interface SectionsDataTableProps {
  search: SectionsSearchParams;
}

export function SectionsDataTable({ search }: SectionsDataTableProps) {
  const router = useRouter();
  const { canAccess, isSuperAdmin } = usePermissions();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState<Section[]>([]);
  const [deleteResetFn, setDeleteResetFn] = useState<(() => void) | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const canCreate =
    isSuperAdmin || canAccess('organizations.institutions', 'create');

  const fetchData = async (params: {
    page: number;
    limit: number;
    search: string;
    from_date: string;
    to_date: string;
    sort_by: string;
    sort_order: string;
  }) => {
    try {
      // Map the DataTable parameters to our SectionService parameters
      const filters = {
        page: params.page,
        limit: params.limit,
        search: params.search || undefined,
        sortBy: params.sort_by || undefined,
        sortOrder: (params.sort_order as 'asc' | 'desc') || undefined,
        institution_id: search.institution_id,
        program_id: search.program_id,
        semester_id: search.semester_id,
        status: search.status
      };

      const { data, metadata } = await SectionService.getSections(filters);

      return {
        success: true,
        data: data || [],
        pagination: {
          page: params.page,
          limit: params.limit,
          total_pages: metadata?.totalPages ?? 0,
          total_items: metadata?.total ?? 0
        }
      };
    } catch (error) {
      console.error('Error fetching sections:', error);
      throw error;
    }
  };

  const handleBulkDelete = async (
    selectedRows: Section[],
    resetSelection: () => void
  ) => {
    if (selectedRows.length === 0) return;

    setSelectedForDelete(selectedRows);
    setDeleteResetFn(() => resetSelection);
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (selectedForDelete.length === 0) return;

    setIsDeleting(true);
    try {
      const results = await Promise.allSettled(
        selectedForDelete.map((section: Section) =>
          SectionService.deleteSection(section.id)
        )
      );

      const successful = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      if (successful > 0) {
        toast.success(
          `Successfully deleted ${successful} section${
            successful > 1 ? 's' : ''
          }`
        );
      }

      if (failed > 0) {
        toast.error(
          `Failed to delete ${failed} section${failed > 1 ? 's' : ''}`
        );
      }

      if (deleteResetFn) {
        deleteResetFn();
      }

      // Refresh the table
      router.refresh();

      setShowDeleteDialog(false);
      setSelectedForDelete([]);
      setDeleteResetFn(null);
    } catch (error) {
      console.error('Error deleting sections:', error);
      toast.error('An error occurred while deleting sections');
    } finally {
      setIsDeleting(false);
    }
  };

  const renderCustomToolbar = (props: {
    selectedRows: any[];
    allSelectedIds: (string | number)[];
    totalSelectedCount: number;
    resetSelection: () => void;
  }) => (
    <div className='flex items-center gap-2'>
      {canCreate && (
        <Button
          onClick={() => router.push('/organizations/sections/new')}
          size='sm'
          className='h-8'
        >
          <Plus className='mr-2 h-4 w-4' />
          Add Section
        </Button>
      )}

      {props.selectedRows.length > 0 && (
        <Button
          onClick={() =>
            handleBulkDelete(
              props.selectedRows as Section[],
              props.resetSelection
            )
          }
          variant='destructive'
          size='sm'
          className='h-8'
        >
          <TrashIcon className='mr-2 h-4 w-4' />
          Delete Selected ({props.selectedRows.length})
        </Button>
      )}
    </div>
  );

  return (
    <>
      <DataTable
        fetchDataFn={fetchData}
        getColumns={() => columns as any}
        exportConfig={{
          entityName: 'sections',
          columnMapping: {},
          columnWidths: [],
          headers: []
        }}
        idField='id'
        config={{
          enableUrlState: true,
          enableDateFilter: false,
          enableExport: false,
          enableRowSelection: true
        }}
        renderToolbarContent={renderCustomToolbar}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selectedForDelete.length > 1
                ? `Delete ${selectedForDelete.length} Sections`
                : `Delete Section: ${selectedForDelete[0]?.section_name}`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              section{selectedForDelete.length > 1 ? 's' : ''} and all related
              data.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* List sections to be deleted */}
          {selectedForDelete.length > 0 && (
            <div className='my-4 p-3 bg-muted rounded-lg'>
              <div className='text-sm font-medium mb-2'>
                Section{selectedForDelete.length > 1 ? 's' : ''} to be deleted:
              </div>
              <div className='space-y-1 max-h-32 overflow-y-auto'>
                {selectedForDelete.map((section) => (
                  <div key={section.id} className='text-sm'>
                    • {section.section_name}
                  </div>
                ))}
              </div>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isDeleting}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isDeleting ? (
                <>
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  Deleting...
                </>
              ) : (
                `Delete ${
                  selectedForDelete.length > 1
                    ? `${selectedForDelete.length} Sections`
                    : 'Section'
                }`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
