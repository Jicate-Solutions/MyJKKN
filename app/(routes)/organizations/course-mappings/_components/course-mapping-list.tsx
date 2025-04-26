'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MoreVertical, Eye, Edit, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { CourseMapping } from '@/types/organizations';
import { CourseMappingService } from '@/lib/services/organization/course-mapping-service';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Pagination } from '@/components/pagination';

interface CourseMappingListProps {
  courseMappings: CourseMapping[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  onPageChange: (page: number) => void;
  onRefresh: () => void;
}

export function CourseMappingList({
  courseMappings,
  metadata,
  onPageChange,
  onRefresh
}: CourseMappingListProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [mappingToDelete, setMappingToDelete] = useState<CourseMapping | null>(
    null
  );

  const handleDelete = async () => {
    if (!mappingToDelete) return;

    try {
      setIsDeleting(true);
      await CourseMappingService.deleteCourseMapping(mappingToDelete.id);
      onRefresh();
      toast.success('Course mapping deleted successfully');
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to delete course mapping'
      );
    } finally {
      setIsDeleting(false);
      setMappingToDelete(null);
    }
  };

  if (courseMappings.length === 0) {
    return (
      <div className='text-center py-4'>
        <p className='text-muted-foreground'>No course mappings found</p>
      </div>
    );
  }

  // Calculate the starting serial number for the current page
  const startSerialNumber = (metadata.page - 1) * metadata.limit + 1;

  return (
    <AlertDialog>
      <div>
        <div className='rounded-md border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='w-[50px]'>S.No</TableHead>
                <TableHead>Course Code</TableHead>
                <TableHead>Course Name</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Program</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className='text-right'>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {courseMappings.map((mapping, index) => (
                <TableRow key={mapping.id}>
                  <TableCell>{startSerialNumber + index}</TableCell>
                  <TableCell className='font-medium'>
                    <Link
                      href={`/organizations/courses/${mapping.course?.id}`}
                      className='hover:underline'
                    >
                      {mapping.course?.course_code}
                    </Link>
                  </TableCell>
                  <TableCell>{mapping.course?.course_name}</TableCell>
                  <TableCell>{mapping.department?.department_name}</TableCell>
                  <TableCell>{mapping.program?.program_name}</TableCell>
                  <TableCell>
                    <Badge
                      variant={mapping.is_active ? 'default' : 'secondary'}
                      className={mapping.is_active ? 'bg-green-500' : ''}
                    >
                      {mapping.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className='text-right'>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant='ghost' size='icon' className='h-8 w-8'>
                          <MoreVertical className='h-4 w-4' />
                          <span className='sr-only'>Actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align='end'>
                        <DropdownMenuItem asChild>
                          <Link
                            href={`/organizations/courses/${mapping.course?.id}`}
                          >
                            <Eye className='mr-2 h-4 w-4' />
                            View Course
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link
                            href={`/organizations/courses/mappings/${mapping.id}/edit`}
                          >
                            <Edit className='mr-2 h-4 w-4' />
                            Edit Mapping
                          </Link>
                        </DropdownMenuItem>
                        <AlertDialogTrigger asChild>
                          <DropdownMenuItem
                            className='text-destructive focus:text-destructive focus:bg-destructive/10'
                            onSelect={(e) => {
                              e.preventDefault();
                              setMappingToDelete(mapping);
                            }}
                          >
                            <Trash2 className='mr-2 h-4 w-4' />
                            Delete Mapping
                          </DropdownMenuItem>
                        </AlertDialogTrigger>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className='mt-4 flex justify-end'>
          <Pagination
            currentPage={metadata.page}
            totalPages={metadata.totalPages}
            onPageChange={onPageChange}
          />
        </div>
      </div>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Course Mapping</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this course mapping for course {''}
            <span className='font-medium'>
              {mappingToDelete?.course?.course_code || ''}
            </span>
            ? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setMappingToDelete(null)}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isDeleting}
            className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
