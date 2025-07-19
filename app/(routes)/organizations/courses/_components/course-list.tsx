'use client';

import { useMemo, useCallback, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { MoreVertical, Edit, Trash2, BookOpen, Plus } from 'lucide-react';
import { Course } from '@/types/organizations';
import { CourseService } from '@/lib/services/organization/course-service';
import { usePermissions } from '@/hooks/use-permissions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { DataTable, PermissionColumnDef } from '@/components/ui/data-table';
import { toast } from 'react-hot-toast';

interface CourseListProps {
  courses: Course[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  onRefresh: () => void;
  paginationLoading?: boolean;
}

export function CourseList({
  courses,
  metadata,
  onPageChange,
  onPageSizeChange,
  onRefresh,
  paginationLoading
}: CourseListProps) {
  const { canAccess, isSuperAdmin } = usePermissions();

  const canViewCourses =
    isSuperAdmin || canAccess('organizations.courses', 'view');
  const canEditCourses =
    isSuperAdmin || canAccess('organizations.courses', 'edit');
  const canDeleteCourses =
    isSuperAdmin || canAccess('organizations.courses', 'delete');

  // Handle bulk delete
  const handleBulkDelete = async (selectedRows: Course[]) => {
    try {
      // Process deletions sequentially to handle potential storage cleanup properly
      for (const course of selectedRows) {
        await CourseService.deleteCourse(course.id);
      }

      toast.success(`${selectedRows.length} courses deleted successfully`);
      onRefresh();
    } catch (error) {
      console.error('Error deleting courses:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete courses'
      );
      throw error; // Re-throw to let DataTable handle the error state
    }
  };

  // Handle single delete
  const handleSingleDelete = useCallback(
    async (course: Course) => {
      try {
        await CourseService.deleteCourse(course.id);
        toast.success('Course deleted successfully');
        onRefresh();
      } catch (error) {
        console.error('Error deleting course:', error);
        toast.error(
          error instanceof Error ? error.message : 'Failed to delete course'
        );
      }
    },
    [onRefresh]
  );

  // Format date helper
  const formatDate = (date: string) => {
    return format(new Date(date), 'MMM d, yyyy');
  };

  // Define columns for the data table
  const columns: PermissionColumnDef<Course, any>[] = useMemo(
    () => [
      {
        id: 'course_code',
        accessorKey: 'course_code',
        header: 'Code',
        cell: ({ row }) => {
          const course = row.original;
          return canViewCourses ? (
            <Link
              href={`/organizations/courses/${course.id}`}
              className='flex items-center hover:text-primary font-medium'
            >
              <BookOpen className='mr-2 h-4 w-4' />
              {course.course_code}
            </Link>
          ) : (
            <div className='flex items-center font-medium'>
              <BookOpen className='mr-2 h-4 w-4' />
              {course.course_code}
            </div>
          );
        }
      },
      {
        id: 'course_name',
        accessorKey: 'course_name',
        header: 'Course Name',
        cell: ({ row }) => {
          return (
            <span className='font-medium'>{row.getValue('course_name')}</span>
          );
        }
      },
      {
        id: 'institution',
        header: 'Institution',
        cell: ({ row }) => {
          const course = row.original;
          return (
            <span className='text-sm'>{course.institution?.name || 'N/A'}</span>
          );
        }
      },
      {
        id: 'is_active',
        accessorKey: 'is_active',
        header: 'Status',
        cell: ({ row }) => {
          const isActive = row.getValue('is_active') as boolean;
          return (
            <Badge variant={isActive ? 'default' : 'secondary'}>
              {isActive ? 'Active' : 'Inactive'}
            </Badge>
          );
        }
      },
      {
        id: 'created_at',
        accessorKey: 'created_at',
        header: 'Created',
        cell: ({ row }) => {
          return formatDate(row.getValue('created_at'));
        }
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
          const course = row.original;

          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant='ghost' className='h-8 w-8 p-0'>
                  <span className='sr-only'>Open menu</span>
                  <MoreVertical className='h-4 w-4' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem
                  asChild={canViewCourses}
                  disabled={!canViewCourses}
                  style={{ opacity: canViewCourses ? 1 : 0.5 }}
                >
                  {canViewCourses ? (
                    <Link
                      href={`/organizations/courses/${course.id}`}
                      className='cursor-pointer'
                    >
                      <BookOpen className='mr-2 h-4 w-4' />
                      View Details
                    </Link>
                  ) : (
                    <div>
                      <BookOpen className='mr-2 h-4 w-4' />
                      View Details
                    </div>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  asChild={canEditCourses}
                  disabled={!canEditCourses}
                  style={{ opacity: canEditCourses ? 1 : 0.5 }}
                >
                  {canEditCourses ? (
                    <Link
                      href={`/organizations/courses/${course.id}/edit`}
                      className='cursor-pointer'
                    >
                      <Edit className='mr-2 h-4 w-4' />
                      Edit Course
                    </Link>
                  ) : (
                    <div className='flex items-center gap-2'>
                      <Edit className='mr-2 h-4 w-4' />
                      Edit Course
                    </div>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={
                    canDeleteCourses
                      ? () => handleSingleDelete(course)
                      : undefined
                  }
                  disabled={!canDeleteCourses}
                  className={
                    canDeleteCourses
                      ? 'text-destructive focus:text-destructive cursor-pointer'
                      : 'cursor-pointer'
                  }
                  style={{ opacity: canDeleteCourses ? 1 : 0.5 }}
                >
                  <Trash2 className='mr-2 h-4 w-4' />
                  Delete Course
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
        enableSorting: false,
        enableHiding: false
      }
    ],
    [canViewCourses, canEditCourses, canDeleteCourses, handleSingleDelete]
  );

  // Create table tools (action buttons)
  const tableTools = (
    <div className='flex flex-col sm:flex-row gap-2'>
      {canEditCourses ? (
        <Button className='w-full sm:w-auto' asChild>
          <Link href='/organizations/courses/new'>
            <Plus className='mr-2 h-4 w-4' />
            Add Course
          </Link>
        </Button>
      ) : (
        <Button
          className='w-full sm:w-auto opacity-50'
          disabled
          variant='outline'
        >
          <Plus className='mr-2 h-4 w-4' />
          Add Course
        </Button>
      )}
    </div>
  );

  return (
    <DataTable
      columns={columns}
      data={courses}
      searchPlaceholder='Search by code or name...'
      permissions={{
        module: 'organizations.courses',
        actions: {
          view: true,
          delete: true
        },
        showPermissionError: true
      }}
      tableTools={tableTools}
      onDeleteSelected={canDeleteCourses ? handleBulkDelete : undefined}
      getRowId={(row) => row.id}
      onRefresh={onRefresh}
      showRefresh={true}
      serverSidePagination={{
        currentPage: metadata.page,
        totalPages: metadata.totalPages,
        pageSize: metadata.limit,
        totalItems: metadata.total,
        hasNextPage: metadata.page < metadata.totalPages,
        hasPreviousPage: metadata.page > 1,
        onPageChange: onPageChange,
        onPageSizeChange: onPageSizeChange,
        isLoading: paginationLoading
      }}
    />
  );
}
