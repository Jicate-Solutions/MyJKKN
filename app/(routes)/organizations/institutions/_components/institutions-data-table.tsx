'use client';

import { DataTable } from '@/components/data-table/data-table';
import { columns } from './columns';
import type { InstitutionsSearchParams } from './data-table-schema';
import { Button } from '@/components/ui/button';
import { Plus, TrashIcon, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { Institution } from '@/types/organizations';
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
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

interface InstitutionsDataTableProps {
  search: InstitutionsSearchParams;
}

export function InstitutionsDataTable({ search }: InstitutionsDataTableProps) {
  const router = useRouter();
  const { canAccess, isSuperAdmin } = usePermissions();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState<Institution[]>([]);
  const [deleteResetFn, setDeleteResetFn] = useState<(() => void) | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [relatedDataCount, setRelatedDataCount] = useState<{
    degrees: number;
    programs: number;
    students: number;
    staff: number;
    bills: number;
  } | null>(null);

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
      const filters = {
        page: params.page,
        limit: params.limit,
        search: params.search || undefined,
        sortBy: params.sort_by || undefined,
        sortOrder: (params.sort_order as 'asc' | 'desc') || undefined,
        isActive:
          search.status === 'active'
            ? true
            : search.status === 'inactive'
            ? false
            : undefined
      };

      const { data, metadata } = await OrganizationService.getInstitutions(
        filters
      );

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
      console.error('Error fetching institutions:', error);
      throw error;
    }
  };

  const checkRelatedData = async (institutionIds: string[]) => {
    try {
      // Only check for the first institution if multiple selected
      // For bulk operations, we'll just show a general warning
      if (institutionIds.length > 0) {
        const counts = await OrganizationService.getInstitutionRelatedDataCount(institutionIds[0]);
        setRelatedDataCount({
          degrees: counts.degrees,
          programs: counts.programs,
          students: counts.students,
          staff: counts.staff,
          bills: counts.bills
        });
      }
    } catch (error) {
      console.error('Error checking related data:', error);
      // Set default counts on error
      setRelatedDataCount({
        degrees: 0,
        programs: 0,
        students: 0,
        staff: 0,
        bills: 0
      });
    }
  };

  const handleBulkDelete = async (
    selectedRows: Institution[],
    resetSelection: () => void
  ) => {
    if (selectedRows.length === 0) return;

    setSelectedForDelete(selectedRows);
    setDeleteResetFn(() => resetSelection);
    
    // Check for related data
    const institutionIds = selectedRows.map(inst => inst.id);
    await checkRelatedData(institutionIds);
    
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (selectedForDelete.length === 0) return;

    setIsDeleting(true);
    try {
      const results = await Promise.allSettled(
        selectedForDelete.map((institution: Institution) =>
          OrganizationService.deleteInstitutionWithCascade(institution.id)
        )
      );

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      if (successful > 0) {
        toast.success(`Successfully deleted ${successful} institution${successful > 1 ? 's' : ''} and all related data`);
      }
      
      if (failed > 0) {
        toast.error(`Failed to delete ${failed} institution${failed > 1 ? 's' : ''}`);
      }

      if (deleteResetFn) {
        deleteResetFn();
      }
      
      // Refresh the table
      router.refresh();
      
      setShowDeleteDialog(false);
      setSelectedForDelete([]);
      setDeleteResetFn(null);
      setRelatedDataCount(null);
    } catch (error) {
      console.error('Error deleting institutions:', error);
      toast.error('An error occurred while deleting institutions');
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
          onClick={() => router.push('/organizations/institutions/new')}
          size='sm'
          className='h-8'
        >
          <Plus className='mr-2 h-4 w-4' />
          Add Institution
        </Button>
      )}

      {props.selectedRows.length > 0 && (
        <Button
          onClick={() =>
            handleBulkDelete(
              props.selectedRows as Institution[],
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
          entityName: 'institutions',
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
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selectedForDelete.length > 1
                ? `Delete ${selectedForDelete.length} Institutions`
                : `Delete Institution: ${selectedForDelete[0]?.name}`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the institution{selectedForDelete.length > 1 ? 's' : ''} and all related data.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* Show related data counts */}
          {relatedDataCount && (relatedDataCount.degrees > 0 || relatedDataCount.programs > 0 || 
            relatedDataCount.students > 0 || relatedDataCount.staff > 0 || relatedDataCount.bills > 0) && (
            <div className="my-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
              <div className="text-sm font-medium text-destructive mb-2">
                Warning: The following related data will also be deleted:
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {relatedDataCount.degrees > 0 && (
                  <div>• {relatedDataCount.degrees} Degree{relatedDataCount.degrees !== 1 ? 's' : ''}</div>
                )}
                {relatedDataCount.programs > 0 && (
                  <div>• {relatedDataCount.programs} Program{relatedDataCount.programs !== 1 ? 's' : ''}</div>
                )}
                {relatedDataCount.students > 0 && (
                  <div>• {relatedDataCount.students} Student{relatedDataCount.students !== 1 ? 's' : ''}</div>
                )}
                {relatedDataCount.staff > 0 && (
                  <div>• {relatedDataCount.staff} Staff Member{relatedDataCount.staff !== 1 ? 's' : ''}</div>
                )}
                {relatedDataCount.bills > 0 && (
                  <div>• {relatedDataCount.bills} Bill{relatedDataCount.bills !== 1 ? 's' : ''}</div>
                )}
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                All associated academic years, departments, courses, sections, timetables, and other related records will also be permanently deleted.
              </div>
            </div>
          )}

          {/* List institutions to be deleted */}
          {selectedForDelete.length > 0 && (
            <div className="my-4 p-3 bg-muted rounded-lg">
              <div className="text-sm font-medium mb-2">
                Institution{selectedForDelete.length > 1 ? 's' : ''} to be deleted:
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {selectedForDelete.map((inst) => (
                  <div key={inst.id} className="text-sm">
                    • {inst.name} ({inst.counselling_code})
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
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                `Delete ${selectedForDelete.length > 1 ? `${selectedForDelete.length} Institutions` : 'Institution'}`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
