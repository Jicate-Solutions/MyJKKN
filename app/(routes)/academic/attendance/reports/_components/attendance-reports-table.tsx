'use client';

import { useState } from 'react';
import { DataTable } from '@/components/ui/data-table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, Download, Eye, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { attendanceReportColumns } from './attendance-reports-columns';
import {
  useAttendanceReports,
  useExportAttendanceReport,
  type AttendanceReportFilters
} from '@/hooks/academic/use-attendance-analytics';
import type { AttendanceReportRecord } from '@/lib/services/academic/attendance-analytics-service';

interface AttendanceReportsTableProps {
  filters: AttendanceReportFilters;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onSortChange: (sort_by: string, sort_order: 'asc' | 'desc') => void;
}

export function AttendanceReportsTable({
  filters,
  onPageChange,
  onPageSizeChange,
  onSortChange
}: AttendanceReportsTableProps) {
  const [selectedRows, setSelectedRows] = useState<AttendanceReportRecord[]>([]);
  const [selectedCount, setSelectedCount] = useState(0);

  const {
    data: reports,
    isLoading,
    error,
    refetch,
    isFetching
  } = useAttendanceReports(filters);

  // Ensure reports is always an array with proper typing
  const reportData: AttendanceReportRecord[] = Array.isArray(reports) ? reports : [];

  const exportMutation = useExportAttendanceReport();

  // Get total count from the first record (they all have the same total_count)
  const totalCount = reportData.length > 0 ? reportData[0].total_count : 0;
  const currentPage = filters.page || 1;
  const pageSize = filters.limit || 10;
  const totalPages = Math.ceil(totalCount / pageSize);

  const handleRefresh = () => {
    refetch();
  };

  const handleExportAll = () => {
    exportMutation.mutate(filters);
  };

  const handleExportSelected = async () => {
    try {
      if (selectedRows.length === 0) {
        // Export all with current filters
        exportMutation.mutate(filters);
      } else {
        // Export selected records only by passing the IDs
        const selectedIds = selectedRows.map(row => row.id);
        const exportFilters = {
          ...filters,
          selected_ids: selectedIds
        };
        
        exportMutation.mutate(exportFilters as AttendanceReportFilters);
      }
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  const handleBulkAction = async (rows: AttendanceReportRecord[]) => {
    // Update selected rows state
    setSelectedRows(rows);
    setSelectedCount(rows.length);
    
    // Handle bulk view by opening tabs
    if (rows.length > 0) {
      // Limit to 5 tabs to avoid overwhelming the browser
      if (rows.length > 5) {
        alert('Opening more than 5 reports at once may be blocked by your browser. Please select fewer reports.');
        return;
      }
      
      // Open first tab immediately (usually not blocked)
      const firstWindow = window.open(
        `/academic/attendance/reports/${rows[0].id}`,
        '_blank'
      );
      
      // Open remaining tabs with small delay
      rows.slice(1).forEach((row, index) => {
        setTimeout(() => {
          window.open(`/academic/attendance/reports/${row.id}`, '_blank');
        }, (index + 1) * 100);
      });
      
      // Check if first window was blocked
      if (!firstWindow || firstWindow.closed) {
        alert('Popup blocker prevented opening reports. Please allow popups for this site.');
      }
    }
  };

  if (error) {
    return (
      <Card>
        <CardContent className='pt-6'>
          <Alert variant='destructive'>
            <AlertCircle className='h-4 w-4' />
            <AlertDescription>
              Failed to load attendance reports. Please try again.
              <Button
                variant='outline'
                size='sm'
                onClick={handleRefresh}
                className='ml-2'
              >
                <RefreshCw className='h-4 w-4 mr-1' />
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className='flex items-center justify-between'>
            <Skeleton className='h-6 w-48' />
            <Skeleton className='h-9 w-32' />
          </div>
        </CardHeader>
        <CardContent>
          <div className='space-y-3'>
            {/* Table Header */}
            <div className='flex items-center space-x-4 border-b pb-2'>
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className='h-4 w-24' />
              ))}
            </div>

            {/* Table Rows */}
            {Array.from({ length: pageSize }).map((_, index) => (
              <div key={index} className='flex items-center space-x-4 py-2'>
                {Array.from({ length: 6 }).map((_, cellIndex) => (
                  <Skeleton key={cellIndex} className='h-4 w-24' />
                ))}
              </div>
            ))}
          </div>

          {/* Pagination Loading */}
          <div className='flex items-center justify-between pt-4'>
            <Skeleton className='h-4 w-32' />
            <div className='flex items-center space-x-2'>
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className='h-8 w-8' />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className='flex items-center justify-between'>
          <div className='space-y-1'>
            <CardTitle className='text-lg font-medium'>
              Attendance Reports
              {isFetching && (
                <RefreshCw className='ml-2 h-4 w-4 inline animate-spin' />
              )}
            </CardTitle>
            <div className='flex items-center gap-2'>
              <Badge variant='secondary'>
                {totalCount} total record{totalCount !== 1 ? 's' : ''}
              </Badge>
              {selectedCount > 0 && (
                <Badge variant='outline'>{selectedCount} selected</Badge>
              )}
            </div>
          </div>

          <div className='flex items-center gap-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={handleExportAll}
              disabled={exportMutation.isPending}
            >
              <Download className='h-4 w-4 mr-1' />
              {exportMutation.isPending ? 'Exporting...' : 'Export All'}
            </Button>
            <Button
              variant='outline'
              size='sm'
              onClick={handleRefresh}
              disabled={isFetching}
            >
              <RefreshCw className='h-4 w-4 mr-1' />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <DataTable
          columns={attendanceReportColumns}
          data={reportData}
          searchPlaceholder='Search reports...'
          onBulkAction={handleBulkAction}
          bulkActionConfig={{
            label: 'View Selected',
            icon: Eye,
            variant: 'outline',
            confirmTitle: undefined // No confirmation needed
          }}
          serverSidePagination={{
            currentPage: currentPage,
            totalPages: totalPages,
            pageSize: pageSize,
            totalItems: totalCount,
            hasNextPage: currentPage < totalPages,
            hasPreviousPage: currentPage > 1,
            onPageChange: onPageChange,
            onPageSizeChange: onPageSizeChange,
            isLoading: isFetching
          }}
          tableTools={
            selectedCount > 0 ? (
              <Button
                variant='outline'
                size='sm'
                onClick={handleExportSelected}
                disabled={exportMutation.isPending}
              >
                <Download className='h-4 w-4 mr-1' />
                Export {selectedCount} Selected
              </Button>
            ) : null
          }
        />

        {/* Summary Statistics */}
        {reportData.length > 0 && (
          <div className='mt-4 p-4 bg-muted/30 rounded-lg'>
            <h4 className='font-medium mb-2'>Current Page Summary</h4>
            <div className='grid grid-cols-2 md:grid-cols-4 gap-4 text-sm'>
              <div>
                <span className='text-muted-foreground'>Total Students:</span>
                <div className='font-medium'>
                  {reportData.reduce(
                    (sum, report) => sum + report.total_students,
                    0
                  )}
                </div>
              </div>
              <div>
                <span className='text-muted-foreground'>Total Present:</span>
                <div className='font-medium'>
                  {reportData.reduce(
                    (sum, report) => sum + report.present_count,
                    0
                  )}
                </div>
              </div>
              <div>
                <span className='text-muted-foreground'>Total Absent:</span>
                <div className='font-medium'>
                  {reportData.reduce(
                    (sum, report) => sum + report.absent_count,
                    0
                  )}
                </div>
              </div>
              <div>
                <span className='text-muted-foreground'>Avg Attendance:</span>
                <div className='font-medium'>
                  {reportData.length > 0
                    ? (
                        reportData.reduce(
                          (sum, report) => sum + report.attendance_percentage,
                          0
                        ) / reportData.length
                      ).toFixed(1)
                    : '0'}
                  %
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
