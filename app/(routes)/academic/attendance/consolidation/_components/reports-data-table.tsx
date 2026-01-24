'use client';

import { useCallback, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { DataTable } from '@/components/data-table/data-table';
import type { DataFetchParams, DataFetchResult } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
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
import {
  useConsolidationReports,
  useDeleteConsolidationReport,
  useRegenerateConsolidationReport,
  useBulkDeleteConsolidationReports,
} from '@/hooks/academic/use-attendance-consolidation';
import { usePermissions } from '@/hooks/use-permissions';
import type { AttendanceConsolidationReport } from '@/types/attendance';
import { getColumns } from './columns';

interface ReportsDataTableProps {
  institutionId: string | null;
  onCreateClick: () => void;
  refreshTrigger?: number;
}

export function ReportsDataTable({ institutionId, onCreateClick, refreshTrigger: externalRefreshTrigger }: ReportsDataTableProps) {
  const [deleteReportId, setDeleteReportId] = useState<string | null>(null);
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});
  const [internalRefreshTrigger, setInternalRefreshTrigger] = useState(0);

  const { isSuperAdmin } = usePermissions();
  const deleteReport = useDeleteConsolidationReport();
  const regenerateReport = useRegenerateConsolidationReport();
  const bulkDelete = useBulkDeleteConsolidationReports();

  // Fetch data function for DataTable
  const fetchData = useCallback(
    async (params: DataFetchParams): Promise<DataFetchResult<AttendanceConsolidationReport>> => {
      try {
        // Import the service dynamically to avoid SSR issues
        const { AttendanceConsolidationService } = await import(
          '@/lib/services/academic/attendance-consolidation-service'
        );

        // Build filters
        const filters: any = {
          page: params.page,
          limit: params.limit,
        };

        // Only add institution filter if provided
        // Super admin can view all by not providing institutionId
        if (institutionId) {
          filters.institutionId = institutionId;
        }

        // Add status filter if provided in params
        if (params.sort_by === 'status') {
          // This would come from table state
        }

        // Fetch from service
        const response = await AttendanceConsolidationService.listReports(filters);

        if (!response) {
          return {
            success: false,
            data: [],
            pagination: {
              page: params.page,
              limit: params.limit,
              total_pages: 0,
              total_items: 0,
            },
          };
        }

        return {
          success: true,
          data: response.data,
          pagination: {
            page: response.metadata.page,
            limit: response.metadata.limit,
            total_pages: response.metadata.totalPages,
            total_items: response.metadata.total,
          },
        };
      } catch (error) {
        console.error('[academic/attendance-consolidation] Failed to fetch reports', error);
        return {
          success: false,
          data: [],
          pagination: {
            page: 1,
            limit: params.limit,
            total_pages: 0,
            total_items: 0,
          },
        };
      }
    },
    [institutionId]
  );

  const handleDelete = async () => {
    if (deleteReportId) {
      await deleteReport.mutateAsync(deleteReportId);
      setDeleteReportId(null);
      setInternalRefreshTrigger((prev) => prev + 1);
    }
  };

  const handleRegenerate = async (report: AttendanceConsolidationReport) => {
    await regenerateReport.mutateAsync(report);
    setInternalRefreshTrigger((prev) => prev + 1);
  };

  const handleBulkDelete = async () => {
    const reportIds = Object.keys(selectedRows).filter((key) => selectedRows[key]);
    if (reportIds.length > 0) {
      await bulkDelete.mutateAsync(reportIds);
      setSelectedRows({});
      setInternalRefreshTrigger((prev) => prev + 1);
    }
  };

  const selectedCount = Object.values(selectedRows).filter(Boolean).length;

  const renderCustomToolbar = () => (
    <div className="flex items-center gap-2">
      <Button onClick={onCreateClick}>
        <Plus className="mr-2 h-4 w-4" />
        Generate New Report
      </Button>

      {selectedCount > 0 && (
        <Button
          variant="destructive"
          size="sm"
          onClick={handleBulkDelete}
          disabled={bulkDelete.isPending}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete ({selectedCount})
        </Button>
      )}
    </div>
  );

  const columns = getColumns({
    onDelete: setDeleteReportId,
    onRegenerate: handleRegenerate,
    isDeleting: deleteReport.isPending,
    isRegenerating: regenerateReport.isPending,
    isSuperAdmin,
  });

  return (
    <>
      <DataTable
        key={`${internalRefreshTrigger}-${externalRefreshTrigger || 0}`}
        fetchDataFn={fetchData as any}
        getColumns={() => columns as any}
        idField="id"
        config={{
          enableUrlState: true,
          enableDateFilter: false,
          enableExport: true,
          enableRowSelection: true,
        }}
        exportConfig={{
          entityName: 'consolidation-reports',
          headers: [
            'Report Name',
            'Description',
            'Status',
            'Format',
            'Group By',
            'Date From',
            'Date To',
            'Total Students',
            'Avg Attendance',
            'Groups',
            'Generated At',
          ],
          columnMapping: {
            reportName: 'Report Name',
            reportDescription: 'Description',
            status: 'Status',
            format: 'Format',
            groupBy: 'Group By',
            dateFrom: 'Date From',
            dateTo: 'Date To',
            totalStudents: 'Total Students',
            avgAttendance: 'Avg Attendance',
            groups: 'Groups',
            createdAt: 'Generated At',
          },
          columnWidths: [
            { wch: 25 }, // Report Name
            { wch: 30 }, // Description
            { wch: 12 }, // Status
            { wch: 10 }, // Format
            { wch: 15 }, // Group By
            { wch: 12 }, // Date From
            { wch: 12 }, // Date To
            { wch: 15 }, // Total Students
            { wch: 15 }, // Avg Attendance
            { wch: 10 }, // Groups
            { wch: 20 }, // Generated At
          ],
        }}
        renderToolbarContent={renderCustomToolbar}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteReportId} onOpenChange={() => setDeleteReportId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Report</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this report? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
