// app/(routes)/academic/years/_components/academic-year-list.tsx

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  MoreVertical,
  Edit,
  Trash2,
  Calendar,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Square
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { AcademicYear } from '@/types/academics';
import { AcademicYearService } from '@/lib/services/academic/academic-year-service';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

interface AcademicYearListProps {
  academicYears: AcademicYear[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  onPageChange: (page: number) => void;
  onRefresh: () => void;
}

export function AcademicYearList({
  academicYears,
  metadata,
  onPageChange,
  onRefresh
}: AcademicYearListProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [yearToDelete, setYearToDelete] = useState<AcademicYear | null>(null);
  const [selectedYears, setSelectedYears] = useState<string[]>([]);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  const handleDelete = async () => {
    if (!yearToDelete) return;

    try {
      setIsLoading(true);
      await AcademicYearService.deleteAcademicYear(yearToDelete.id);
      onRefresh();
      toast.success('Academic year deleted successfully');
    } catch (error) {
      console.error('Error deleting academic year:', error);
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to delete academic year'
      );
    } finally {
      setIsLoading(false);
      setYearToDelete(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedYears.length === 0) return;

    try {
      setIsLoading(true);

      const result = await AcademicYearService.bulkDeleteAcademicYears(
        selectedYears
      );

      if (result.success.length > 0) {
        toast.success(
          `Successfully deleted ${result.success.length} academic years`
        );
      }

      if (result.failed.length > 0) {
        toast.error(`Failed to delete ${result.failed.length} academic years`);
        console.error('Failed deletions:', result.failed);
      }

      setSelectedYears([]);
      onRefresh();
    } catch (error) {
      console.error('Error performing bulk delete:', error);
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to delete academic years'
      );
    } finally {
      setIsLoading(false);
      setShowBulkDeleteDialog(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedYears.length === academicYears.length) {
      setSelectedYears([]);
    } else {
      setSelectedYears(academicYears.map((year) => year.id));
    }
  };

  const toggleSelectYear = (id: string) => {
    if (selectedYears.includes(id)) {
      setSelectedYears(selectedYears.filter((yearId) => yearId !== id));
    } else {
      setSelectedYears([...selectedYears, id]);
    }
  };

  const formatDate = (date: string) => {
    return format(new Date(date), 'MMM d, yyyy');
  };

  return (
    <div className='space-y-4'>
      <div className='flex justify-between'>
        {selectedYears.length > 0 && (
          <Button
            variant='destructive'
            size='sm'
            onClick={() => setShowBulkDeleteDialog(true)}
            disabled={isLoading}
          >
            <Trash2 className='mr-2 h-4 w-4' />
            Delete Selected ({selectedYears.length})
          </Button>
        )}
        <Button
          variant='outline'
          size='sm'
          onClick={onRefresh}
          className={selectedYears.length > 0 ? 'ml-auto' : 'ml-auto'}
        >
          <RefreshCw className='mr-2 h-4 w-4' />
          Refresh
        </Button>
      </div>

      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className='w-12'>
                <div className='flex items-center' onClick={toggleSelectAll}>
                  {selectedYears.length === academicYears.length &&
                  academicYears.length > 0 ? (
                    <CheckSquare className='h-4 w-4 cursor-pointer' />
                  ) : (
                    <Square className='h-4 w-4 cursor-pointer' />
                  )}
                </div>
              </TableHead>
              <TableHead>Academic Year</TableHead>
              <TableHead>Institution</TableHead>
              <TableHead>Start Date</TableHead>
              <TableHead>End Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className='text-right'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {academicYears.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className='text-center text-muted-foreground h-24'
                >
                  No academic years found
                </TableCell>
              </TableRow>
            ) : (
              academicYears.map((year) => (
                <TableRow
                  key={year.id}
                  className={
                    selectedYears.includes(year.id) ? 'bg-muted/50' : ''
                  }
                >
                  <TableCell>
                    <div
                      className='flex items-center'
                      onClick={() => toggleSelectYear(year.id)}
                    >
                      {selectedYears.includes(year.id) ? (
                        <CheckSquare className='h-4 w-4 cursor-pointer' />
                      ) : (
                        <Square className='h-4 w-4 cursor-pointer' />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className='font-medium'>
                    <Link
                      href={`/academic/years/${year.id}`}
                      className='hover:text-primary'
                    >
                      {year.academic_year_name}
                    </Link>
                  </TableCell>
                  <TableCell>{year.institution?.name}</TableCell>
                  <TableCell>{formatDate(year.start_date)}</TableCell>
                  <TableCell>{formatDate(year.end_date)}</TableCell>
                  <TableCell>
                    <Badge variant={year.is_active ? 'default' : 'secondary'}>
                      {year.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(year.created_at)}</TableCell>
                  <TableCell className='text-right'>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant='ghost' className='h-8 w-8 p-0'>
                          <span className='sr-only'>Open menu</span>
                          <MoreVertical className='h-4 w-4' />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align='end'>
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem asChild>
                          <Link
                            href={`/academic/years/${year.id}`}
                            className='cursor-pointer'
                          >
                            <Calendar className='mr-2 h-4 w-4' />
                            View Details
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link
                            href={`/academic/years/${year.id}/edit`}
                            className='cursor-pointer'
                          >
                            <Edit className='mr-2 h-4 w-4' />
                            Edit Year
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setYearToDelete(year)}
                          className='text-destructive focus:text-destructive cursor-pointer'
                        >
                          <Trash2 className='mr-2 h-4 w-4' />
                          Delete Year
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {metadata.totalPages > 1 && (
        <div className='flex items-center justify-between px-2'>
          <div className='text-sm text-muted-foreground'>
            Showing {(metadata.page - 1) * metadata.limit + 1} to{' '}
            {Math.min(metadata.page * metadata.limit, metadata.total)} of{' '}
            {metadata.total} entries
          </div>

          <div className='flex items-center space-x-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => onPageChange(metadata.page - 1)}
              disabled={metadata.page <= 1}
            >
              <ChevronLeft className='h-4 w-4' />
              Previous
            </Button>
            <Button
              variant='outline'
              size='sm'
              onClick={() => onPageChange(metadata.page + 1)}
              disabled={metadata.page >= metadata.totalPages}
            >
              Next
              <ChevronRight className='h-4 w-4' />
            </Button>
          </div>
        </div>
      )}

      {/* Single Delete Dialog */}
      <AlertDialog
        open={!!yearToDelete}
        onOpenChange={(open) => !open && setYearToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Academic Year</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {yearToDelete?.academic_year_name}
              ? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isLoading}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isLoading ? 'Deleting...' : 'Delete Academic Year'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Dialog */}
      <AlertDialog
        open={showBulkDeleteDialog}
        onOpenChange={setShowBulkDeleteDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Multiple Academic Years</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedYears.length} academic
              years? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isLoading}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isLoading
                ? 'Deleting...'
                : `Delete ${selectedYears.length} Academic Years`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
