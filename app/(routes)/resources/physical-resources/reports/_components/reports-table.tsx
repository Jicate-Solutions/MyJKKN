'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  Eye,
  Download,
  MoreHorizontal,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'react-hot-toast';

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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { Pagination } from '@/components/pagination';
import { useUsageReports } from '@/hooks/resource/physical/use-usage-reports';
import { UsageReport } from '@/types/resources';
import { EmptyState } from '@/components/empty-state';
import { ExportDropdown } from './export-dropdown';

export function ReportsTable() {
  const { reports, loading, error, metadata, changePage, fetchReports, deleteReport } =
    useUsageReports();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [reportToDelete, setReportToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const openDeleteDialog = (id: string) => {
    setReportToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!reportToDelete) return;

    try {
      setDeleting(true);
      const success = await deleteReport(reportToDelete);
      
      if (success) {
        toast.success('Report deleted successfully');
        setDeleteDialogOpen(false);
        fetchReports();
      } else {
        toast.error('Failed to delete report. You may not have the necessary permissions.');
      }
    } catch (error) {
      console.error('Error deleting report:', error);
      toast.error('Failed to delete report. You may not have the necessary permissions.');
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (date: string) => {
    return format(new Date(date), 'MMM d, yyyy');
  };

  if (loading && reports.length === 0) {
    return (
      <div className='flex h-[400px] items-center justify-center'>
        <div className='text-center'>
          <div className='animate-spin h-8 w-8 border-t-2 border-primary rounded-full mx-auto mb-4'></div>
          <p className='text-muted-foreground'>Loading reports...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='flex h-[400px] items-center justify-center'>
        <div className='text-center text-destructive'>
          <p>Error loading reports: {error}</p>
          <Button
            variant='outline'
            className='mt-4'
            onClick={() => fetchReports()}
          >
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <EmptyState
        title='No reports found'
        description='No usage reports match your current filters or none have been generated yet.'
        action={
          <Button asChild>
            <Link href='/resources/physical-resources/reports/new'>Generate Report</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className='space-y-4'>
      <div className='rounded-md border overflow-auto'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className='w-[50px]'>S.No</TableHead>
              <TableHead>Resource</TableHead>
              <TableHead className='hidden md:table-cell'>Period</TableHead>
              <TableHead>Utilization</TableHead>
              <TableHead className='hidden sm:table-cell'>
                Reservations
              </TableHead>
              <TableHead className='hidden lg:table-cell'>
                Unique Users
              </TableHead>
              <TableHead className='hidden md:table-cell'>Generated</TableHead>
              <TableHead className='w-[80px] text-right'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports.map((report, index) => (
              <TableRow key={report.id}>
                <TableCell>{index + 1}</TableCell>
                <TableCell className='font-medium'>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          {report.resource?.resource_name || 'Unknown Resource'}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className='sm:hidden'>
                        <div className='space-y-1 text-xs'>
                          <p>
                            <strong>Reservations:</strong>{' '}
                            {report.metrics.reservation_count}
                          </p>
                          <p>
                            <strong>Unique Users:</strong>{' '}
                            {report.metrics.unique_users}
                          </p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>
                <TableCell className='hidden md:table-cell'>
                  {formatDate(report.start_date)} -{' '}
                  {formatDate(report.end_date)}
                </TableCell>
                <TableCell>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className='md:hidden inline-block'>
                          {report.metrics.utilization_percentage.toFixed(1)}%
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className='md:hidden'>
                        <div className='space-y-1 text-xs'>
                          <p>
                            <strong>Period:</strong>{' '}
                            {formatDate(report.start_date)} -{' '}
                            {formatDate(report.end_date)}
                          </p>
                          <p>
                            <strong>Generated:</strong>{' '}
                            {formatDate(report.created_at)}
                          </p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <span className='hidden md:inline-block'>
                    {report.metrics.utilization_percentage.toFixed(1)}%
                  </span>
                </TableCell>
                <TableCell className='hidden sm:table-cell'>
                  {report.metrics.reservation_count}
                </TableCell>
                <TableCell className='hidden lg:table-cell'>
                  {report.metrics.unique_users}
                </TableCell>
                <TableCell className='hidden md:table-cell'>
                  {formatDate(report.created_at)}
                </TableCell>
                <TableCell className='text-right p-2'>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant='ghost' size='icon' className='h-8 w-8'>
                        <MoreHorizontal className='h-4 w-4' />
                        <span className='sr-only'>Open menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align='end'
                      side='left'
                      className='w-[160px]'
                    >
                      <DropdownMenuItem asChild className='cursor-pointer'>
                        <Link
                          href={`/resources/physical-resources/reports/${report.id}`}
                          className='flex w-full items-center'
                        >
                          <Eye className='mr-2 h-4 w-4' />
                          <span>View Details</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <div
                          className='w-full flex items-center cursor-pointer'
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExportDropdown
                            reports={reports}
                            singleReport={report}
                            variant='ghost'
                            size='icon'
                          />
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className='text-destructive cursor-pointer'
                        onClick={() => openDeleteDialog(report.id)}
                      >
                        <Trash2 className='mr-2 h-4 w-4' />
                        <span>Delete</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Pagination
        currentPage={metadata.page}
        totalPages={metadata.totalPages}
        onPageChange={changePage}
      />

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2'>
              <AlertTriangle className='h-5 w-5 text-destructive' />
              Delete Report
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this report? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant='destructive'
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
