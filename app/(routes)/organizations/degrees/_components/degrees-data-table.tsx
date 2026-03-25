'use client';

import { DataTable } from '@/components/data-table/data-table';
import { columns } from './columns';
import type { DegreesSearchParams } from './data-table-schema';
import { Button } from '@/components/ui/button';
import { Plus, TrashIcon, Loader2, Upload, Download, ChevronDown, FileSpreadsheet, FileText, FileJson } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { Degree } from '@/types/organizations';
import { usePermissions } from '@/hooks/use-permissions';
import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { ImportDialog } from './import-dialog';
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

interface DegreesDataTableProps {
  search: DegreesSearchParams;
}

export function DegreesDataTable({ search }: DegreesDataTableProps) {
  const router = useRouter();
  const { canAccess, isSuperAdmin } = usePermissions();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState<Degree[]>([]);
  const [deleteResetFn, setDeleteResetFn] = useState<(() => void) | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const canCreate =
    isSuperAdmin || canAccess('organizations.degrees', 'create');

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
      // Map the DataTable parameters to our DegreeService parameters
      const filters = {
        page: params.page,
        limit: params.limit,
        search: params.search || undefined,
        sortBy: params.sort_by || undefined,
        sortOrder: (params.sort_order as 'asc' | 'desc') || undefined,
        institution_id: search.institution_id,
        degree_type: search.degree_type,
        status: search.status
      };

      const { data, metadata } = await DegreeService.getDegrees(filters);

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
      console.error('Error fetching degrees:', error);
      throw error;
    }
  };

  const handleBulkDelete = async (
    selectedRows: Degree[],
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
        selectedForDelete.map((degree: Degree) =>
          DegreeService.deleteDegree(degree.id)
        )
      );

      const successful = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      if (successful > 0) {
        toast.success(
          `Successfully deleted ${successful} degree${
            successful > 1 ? 's' : ''
          }`
        );
      }

      if (failed > 0) {
        toast.error(
          `Failed to delete ${failed} degree${failed > 1 ? 's' : ''}`
        );
      }

      if (deleteResetFn) {
        deleteResetFn();
      }

      // Refresh the table - trigger re-fetch
      setRefreshTrigger(prev => prev + 1);
      router.refresh();

      setShowDeleteDialog(false);
      setSelectedForDelete([]);
      setDeleteResetFn(null);
    } catch (error) {
      console.error('Error deleting degrees:', error);
      toast.error('An error occurred while deleting degrees');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleImportComplete = () => {
    setRefreshTrigger(prev => prev + 1);
    router.refresh();
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await fetch('/api/organizations/degrees/template');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `degrees-template-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Template download error:', error);
      toast.error('Failed to download template');
    }
  };

  const handleExportExcel = async () => {
    try {
      const response = await fetch('/api/organizations/degrees/export?format=xlsx');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `degrees-export-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('Degrees exported successfully');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export degrees');
    }
  };

  const handleExportCSV = async () => {
    try {
      const response = await fetch('/api/organizations/degrees/export?format=csv');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `degrees-export-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('Degrees exported successfully');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export degrees');
    }
  };

  const handleExportJSON = async () => {
    try {
      const response = await fetch('/api/organizations/degrees/export?format=json');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `degrees-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('Degrees exported successfully');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export degrees');
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
        <>
          <Button
            onClick={() => router.push('/organizations/degrees/new')}
            size='sm'
            className='h-8'
          >
            <Plus className='mr-2 h-4 w-4' />
            Add Degree
          </Button>

          <Button
            variant='outline'
            size='sm'
            className='h-8'
            onClick={() => setImportOpen(true)}
          >
            <Upload className='mr-2 h-4 w-4' />
            Import
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='outline' size='sm' className='h-8'>
                <Download className='mr-2 h-4 w-4' />
                Export
                <ChevronDown className='ml-2 h-4 w-4' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem onClick={handleExportExcel}>
                <FileSpreadsheet className='mr-2 h-4 w-4' />
                Export as Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportCSV}>
                <FileText className='mr-2 h-4 w-4' />
                Export as CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportJSON}>
                <FileJson className='mr-2 h-4 w-4' />
                Export as JSON
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleDownloadTemplate}>
                <Download className='mr-2 h-4 w-4' />
                Download Template
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}

      {props.selectedRows.length > 0 && (
        <Button
          onClick={() =>
            handleBulkDelete(
              props.selectedRows as Degree[],
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
        key={refreshTrigger}
        fetchDataFn={fetchData}
        getColumns={() => columns as any}
        exportConfig={{
          entityName: 'degrees',
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
                ? `Delete ${selectedForDelete.length} Degrees`
                : `Delete Degree: ${selectedForDelete[0]?.degree_name}`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              degree{selectedForDelete.length > 1 ? 's' : ''} and all related
              data.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* List degrees to be deleted */}
          {selectedForDelete.length > 0 && (
            <div className='my-4 p-3 bg-muted rounded-lg'>
              <div className='text-sm font-medium mb-2'>
                Degree{selectedForDelete.length > 1 ? 's' : ''} to be deleted:
              </div>
              <div className='space-y-1 max-h-32 overflow-y-auto'>
                {selectedForDelete.map((degree) => (
                  <div key={degree.id} className='text-sm'>
                    • {degree.degree_name} ({degree.degree_type})
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
                    ? `${selectedForDelete.length} Degrees`
                    : 'Degree'
                }`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import Dialog */}
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImportComplete={handleImportComplete}
      />
    </>
  );
}
