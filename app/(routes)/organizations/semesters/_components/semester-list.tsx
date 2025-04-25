'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  MoreVertical,
  Edit,
  Trash2,
  FileText,
  RefreshCw,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Semester } from '@/types/organizations';
import { SemesterService } from '@/lib/services/organization/semester-service';
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

interface SemesterListProps {
  semesters: Semester[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  onPageChange: (page: number) => void;
  onRefresh: () => void;
}

export function SemesterList({
  semesters,
  metadata,
  onPageChange,
  onRefresh
}: SemesterListProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [semesterToDelete, setSemesterToDelete] = useState<Semester | null>(
    null
  );

  const handleDelete = async () => {
    if (!semesterToDelete) return;

    try {
      setIsLoading(true);
      await SemesterService.deleteSemester(semesterToDelete.id);
      onRefresh();
      toast.success('Semester deleted successfully');
    } catch (error) {
      console.error('Error deleting semester:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete semester'
      );
    } finally {
      setIsLoading(false);
      setSemesterToDelete(null);
    }
  };

  const formatDate = (date: string) => {
    return format(new Date(date), 'MMM d, yyyy');
  };

  return (
    <div className='space-y-4'>
      <div className='flex justify-end'>
        <Button
          variant='outline'
          size='sm'
          onClick={onRefresh}
          className='ml-auto'
        >
          <RefreshCw className='mr-2 h-4 w-4' />
          Refresh
        </Button>
      </div>

      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Program</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className='text-right'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {semesters.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className='text-center text-muted-foreground h-24'
                >
                  No semesters found
                </TableCell>
              </TableRow>
            ) : (
              semesters.map((semester) => (
                <TableRow key={semester.id}>
                  <TableCell className='font-medium'>
                    <Link
                      href={`/organizations/semesters/${semester.id}`}
                      className='hover:text-primary'
                    >
                      {semester.semester_code}
                    </Link>
                  </TableCell>
                  <TableCell>{semester.semester_name}</TableCell>
                  <TableCell>
                    <Badge variant='secondary'>
                      {semester.semester_type.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>{semester.program?.program_name}</TableCell>
                  <TableCell>
                    <Badge
                      variant={semester.is_active ? 'default' : 'secondary'}
                    >
                      {semester.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(semester.created_at)}</TableCell>
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
                            href={`/organizations/semesters/${semester.id}`}
                            className='cursor-pointer'
                          >
                            <FileText className='mr-2 h-4 w-4' />
                            View Details
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link
                            href={`/organizations/semesters/${semester.id}/edit`}
                            className='cursor-pointer'
                          >
                            <Edit className='mr-2 h-4 w-4' />
                            Edit Semester
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setSemesterToDelete(semester)}
                          className='text-destructive focus:text-destructive cursor-pointer'
                        >
                          <Trash2 className='mr-2 h-4 w-4' />
                          Delete Semester
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

      <AlertDialog
        open={!!semesterToDelete}
        onOpenChange={(open) => !open && setSemesterToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Semester</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {semesterToDelete?.semester_name}?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isLoading}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isLoading ? 'Deleting...' : 'Delete Semester'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
