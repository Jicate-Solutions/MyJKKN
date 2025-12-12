'use client';

import { useState } from 'react';
import { DataTable } from '@/components/data-table/data-table';
import { columns } from './columns';
import type { GraduatedSearchParams } from './data-table-schema';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { StudentService } from '@/lib/services/student/student-service';
import { Student } from '@/types/student';
import toast from 'react-hot-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { useQueryClient } from '@tanstack/react-query';
import { usePermissions } from '@/hooks/use-permissions';

interface GraduatedDataTableProps {
  search: GraduatedSearchParams;
}

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active', description: 'Reactivate students' },
  { value: 'inactive', label: 'Inactive', description: 'Mark as inactive' },
  { value: 'pending', label: 'Pending', description: 'Set to pending status' },
  { value: 'exited', label: 'Exited', description: 'Students have left the institution' },
  { value: 'graduated', label: 'Graduated', description: 'Students have completed the program' }
];

export function GraduatedDataTable({ search }: GraduatedDataTableProps) {
  const queryClient = useQueryClient();
  const { canAccess, isSuperAdmin } = usePermissions();
  const canEdit = isSuperAdmin || canAccess('students', 'edit');

  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [showProgressDialog, setShowProgressDialog] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<Student[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [resetSelectionFn, setResetSelectionFn] = useState<(() => void) | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateResults, setUpdateResults] = useState<{
    success: string[];
    failed: { id: string; error: string }[];
    total: number;
  }>({ success: [], failed: [], total: 0 });

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
        status: search.status,
        // Map the filter parameters to match StudentService expectations
        institution: search.institution_id,
        degree: search.degree_id,
        department: search.department_id,
        program: search.program_id,
        semester: search.semester_id,
        section: search.section_id,
        academic_year: search.academic_year_id
      };

      const result = await StudentService.getStudents(filters);
      const { data, metadata } = result;

      return {
        success: true,
        data: data || [],
        pagination: {
          page: metadata.page,
          limit: metadata.limit,
          total_pages: metadata.totalPages,
          total_items: metadata.total
        }
      };
    } catch (error) {
      console.error('Error fetching graduated students:', error);
      throw error;
    }
  };

  const handleBulkStatusUpdate = (
    selectedRows: Student[],
    resetSelection: () => void
  ) => {
    if (selectedRows.length === 0) return;

    setSelectedStudents(selectedRows);
    setResetSelectionFn(() => resetSelection);
    setSelectedStatus('');
    setShowStatusDialog(true);
  };

  const confirmBulkStatusUpdate = async () => {
    if (!selectedStatus || selectedStudents.length === 0) {
      toast.error('Please select a status');
      return;
    }

    setIsUpdating(true);
    setShowStatusDialog(false);
    setUpdateProgress(0);
    setUpdateResults({
      success: [],
      failed: [],
      total: selectedStudents.length
    });
    setShowProgressDialog(true);

    try {
      const result = await StudentService.bulkUpdateStudentStatus(
        selectedStudents.map((s) => s.id),
        selectedStatus as 'active' | 'inactive' | 'pending' | 'exited' | 'graduated',
        (progress, success, failed) => {
          setUpdateProgress(progress);
          setUpdateResults({
            success,
            failed,
            total: selectedStudents.length
          });
        }
      );

      if (result.success.length > 0) {
        toast.success(`Successfully updated ${result.success.length} student(s)`);

        if (result.failed.length > 0) {
          toast.error(`Failed to update ${result.failed.length} student(s)`);
        }

        // Reset selection
        if (resetSelectionFn) {
          resetSelectionFn();
        }

        // Invalidate queries to refresh data
        queryClient.invalidateQueries({ queryKey: ['students'] });
      } else {
        toast.error('No students were updated');
      }
    } catch (error) {
      console.error('Error updating students:', error);
      toast.error('Failed to update students');
    } finally {
      setIsUpdating(false);
    }
  };

  const closeProgressDialog = () => {
    setShowProgressDialog(false);
    setSelectedStudents([]);
    setResetSelectionFn(null);
  };

  const renderCustomToolbar = (props: {
    selectedRows: any[];
    allSelectedIds: (string | number)[];
    totalSelectedCount: number;
    resetSelection: () => void;
  }) => (
    <div className='flex items-center gap-2'>
      {props.selectedRows.length > 0 && canEdit && (
        <Button
          onClick={() =>
            handleBulkStatusUpdate(
              props.selectedRows as Student[],
              props.resetSelection
            )
          }
          variant='outline'
          size='sm'
          className='h-8'
        >
          <RefreshCw className='mr-2 h-4 w-4' />
          Update Status ({props.selectedRows.length})
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
          entityName: 'graduated-students',
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

      {/* Bulk Status Update Dialog */}
      <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Status for {selectedStudents.length} Student(s)</DialogTitle>
            <DialogDescription>
              Change the status for the selected students. This action can be reversed.
            </DialogDescription>
          </DialogHeader>

          <div className='space-y-4 py-4'>
            <div className='space-y-2'>
              <label className='text-sm font-medium'>New Status</label>
              <Select
                value={selectedStatus}
                onValueChange={setSelectedStatus}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select status' />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className='flex flex-col'>
                        <span>{option.label}</span>
                        <span className='text-xs text-muted-foreground'>
                          {option.description}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedStatus === 'active' && (
              <div className='rounded-md bg-blue-50 p-3 text-sm text-blue-800'>
                Reactivating these students will restore their access to the system.
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setShowStatusDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmBulkStatusUpdate}
              disabled={!selectedStatus}
            >
              Update Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Progress Dialog */}
      <Dialog open={showProgressDialog} onOpenChange={(open) => !isUpdating && setShowProgressDialog(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isUpdating ? 'Updating Students...' : 'Update Complete'}
            </DialogTitle>
          </DialogHeader>

          <div className='space-y-4 py-4'>
            <Progress value={updateProgress} className='h-2' />
            <div className='text-sm text-center text-muted-foreground'>
              {Math.round(updateProgress)}% complete
            </div>

            <div className='grid grid-cols-2 gap-4 text-sm'>
              <div className='text-center p-3 rounded-md bg-green-50'>
                <div className='text-2xl font-bold text-green-600'>
                  {updateResults.success.length}
                </div>
                <div className='text-green-600'>Successful</div>
              </div>
              <div className='text-center p-3 rounded-md bg-red-50'>
                <div className='text-2xl font-bold text-red-600'>
                  {updateResults.failed.length}
                </div>
                <div className='text-red-600'>Failed</div>
              </div>
            </div>

            {updateResults.failed.length > 0 && (
              <div className='max-h-32 overflow-y-auto text-sm'>
                <p className='font-medium text-red-600 mb-2'>Failed updates:</p>
                {updateResults.failed.map((f, i) => (
                  <div key={i} className='text-red-500 text-xs'>
                    {f.error}
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              onClick={closeProgressDialog}
              disabled={isUpdating}
            >
              {isUpdating ? 'Please wait...' : 'Close'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
