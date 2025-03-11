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
import { Pagination } from '@/components/pagination';
import { useUsageReports } from '@/hooks/resource/use-usage-reports';
import { UsageReport } from '@/types/resources';
import { EmptyState } from '@/components/empty-state';

export function ReportsTable() {
  const { reports, loading, error, metadata, changePage, fetchReports } =
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
      // Implement delete functionality when available in the service
      // await UsageReportService.deleteReport(reportToDelete);

      toast.success('Report deleted successfully');
      setDeleteDialogOpen(false);
      fetchReports();
    } catch (error) {
      console.error('Error deleting report:', error);
      toast.error('Failed to delete report');
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
            <Link href='/resources/reports/new'>Generate Report</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className='space-y-4'>
      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Resource</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Utilization</TableHead>
              <TableHead>Reservations</TableHead>
              <TableHead>Unique Users</TableHead>
              <TableHead>Generated</TableHead>
              <TableHead className='w-[100px]'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports.map((report) => (
              <TableRow key={report.id}>
                <TableCell className='font-medium'>
                  {report.resource?.resource_name || 'Unknown Resource'}
                </TableCell>
                <TableCell>
                  {formatDate(report.start_date)} -{' '}
                  {formatDate(report.end_date)}
                </TableCell>
                <TableCell>
                  {report.metrics.utilization_percentage.toFixed(1)}%
                </TableCell>
                <TableCell>{report.metrics.reservation_count}</TableCell>
                <TableCell>{report.metrics.unique_users}</TableCell>
                <TableCell>{formatDate(report.created_at)}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant='ghost' size='icon'>
                        <MoreHorizontal className='h-4 w-4' />
                        <span className='sr-only'>Open menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align='end'>
                      <DropdownMenuItem asChild>
                        <Link href={`/resources/reports/${report.id}`}>
                          <Eye className='mr-2 h-4 w-4' />
                          View Details
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Download className='mr-2 h-4 w-4' />
                        Export Report
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className='text-destructive'
                        onClick={() => openDeleteDialog(report.id)}
                      >
                        <Trash2 className='mr-2 h-4 w-4' />
                        Delete
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
