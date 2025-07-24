'use client';

import { useMemo, useCallback } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { MoreVertical, Edit, Trash2, FileText, Plus, Eye } from 'lucide-react';
import { CourseMapping } from '@/types/organizations';
import { CourseMappingService } from '@/lib/services/organization/course-mapping-service';
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

interface CourseMappingListProps {
  courseMappings: CourseMapping[];
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

export function CourseMappingList({
  courseMappings,
  metadata,
  onPageChange,
  onPageSizeChange,
  onRefresh,
  paginationLoading
}: CourseMappingListProps) {
  const { canAccess, isSuperAdmin } = usePermissions();

  const canViewCourses =
    isSuperAdmin || canAccess('organizations.courses', 'view');
  const canEditCourseMappings =
    isSuperAdmin || canAccess('organizations.course.mappings', 'edit');
  const canDeleteCourseMappings =
    isSuperAdmin || canAccess('organizations.course.mappings', 'delete');

  // Handle bulk delete
  const handleBulkDelete = async (selectedRows: CourseMapping[]) => {
    try {
      for (const mapping of selectedRows) {
        await CourseMappingService.deleteCourseMapping(mapping.id);
      }
      toast.success(
        `${selectedRows.length} course mappings deleted successfully`
      );
      onRefresh();
    } catch (error) {
      console.error('Error deleting course mappings:', error);
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to delete course mappings'
      );
      throw error;
    }
  };

  // Handle single delete
  const handleSingleDelete = useCallback(
    async (mapping: CourseMapping) => {
      try {
        await CourseMappingService.deleteCourseMapping(mapping.id);
        toast.success('Course mapping deleted successfully');
        onRefresh();
      } catch (error) {
        console.error('Error deleting course mapping:', error);
        toast.error(
          error instanceof Error
            ? error.message
            : 'Failed to delete course mapping'
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
  const columns: PermissionColumnDef<CourseMapping, any>[] = useMemo(
    () => [
      {
        id: 'course_code',
        accessorKey: 'course.course_code',
        header: 'Course Code',
        cell: ({ row }) => {
          const mapping = row.original;
          return canViewCourses ? (
            <Link
              href={`/organizations/courses/${mapping.course?.id}`}
              className='flex items-center hover:text-primary font-medium'
            >
              <FileText className='mr-2 h-4 w-4' />
              {mapping.course?.course_code}
            </Link>
          ) : (
            <div className='flex items-center font-medium'>
              <FileText className='mr-2 h-4 w-4' />
              {mapping.course?.course_code}
            </div>
          );
        }
      },
      {
        id: 'course_name',
        accessorKey: 'course.course_name',
        header: 'Course Name',
        cell: ({ row }) => {
          return (
            <span className='font-medium'>
              {row.original.course?.course_name}
            </span>
          );
        }
      },

      {
        id: 'department',
        accessorKey: 'department.department_name',
        header: 'Department',
        cell: ({ row }) => {
          return <span>{row.original.department?.department_name}</span>;
        }
      },
      {
        id: 'semester',
        accessorKey: 'semester.semester_name',
        header: 'Semester',
        cell: ({ row }) => {
          return <span>{row.original.semester?.semester_name}</span>;
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
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
          const mapping = row.original;

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
                      href={`/organizations/courses/${mapping.course?.id}`}
                      className='cursor-pointer'
                    >
                      <Eye className='mr-2 h-4 w-4' />
                      View Course
                    </Link>
                  ) : (
                    <div>
                      <Eye className='mr-2 h-4 w-4' />
                      View Course
                    </div>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  asChild={canEditCourseMappings}
                  disabled={!canEditCourseMappings}
                  style={{ opacity: canEditCourseMappings ? 1 : 0.5 }}
                >
                  {canEditCourseMappings ? (
                    <Link
                      href={`/organizations/courses/mappings/${mapping.id}/edit`}
                      className='cursor-pointer'
                    >
                      <Edit className='mr-2 h-4 w-4' />
                      Edit
                    </Link>
                  ) : (
                    <div className='flex items-center gap-2'>
                      <Edit className='mr-2 h-4 w-4' />
                      Edit
                    </div>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={
                    canDeleteCourseMappings
                      ? () => handleSingleDelete(mapping)
                      : undefined
                  }
                  disabled={!canDeleteCourseMappings}
                  className={
                    canDeleteCourseMappings
                      ? 'text-destructive focus:text-destructive cursor-pointer'
                      : 'cursor-pointer'
                  }
                  style={{ opacity: canDeleteCourseMappings ? 1 : 0.5 }}
                >
                  <Trash2 className='mr-2 h-4 w-4' />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
        enableSorting: false,
        enableHiding: false
      }
    ],
    [
      canViewCourses,
      canEditCourseMappings,
      canDeleteCourseMappings,
      handleSingleDelete
    ]
  );

  // Create table tools (action buttons)
  const tableTools = (
    <div className='flex flex-col sm:flex-row gap-2'>
      {canEditCourseMappings ? (
        <Button className='w-full sm:w-auto' asChild>
          <Link href='/organizations/courses/mappings/new'>
            <Plus className='mr-2 h-4 w-4' />
            Map Course
          </Link>
        </Button>
      ) : (
        <Button
          className='w-full sm:w-auto opacity-50'
          disabled
          variant='outline'
        >
          <Plus className='mr-2 h-4 w-4' />
          Map Course
        </Button>
      )}
    </div>
  );

  return (
    <DataTable
      columns={columns}
      data={courseMappings}
      permissions={{
        module: 'organizations.course.mappings',
        actions: {
          view: true,
          delete: true
        },
        showPermissionError: true
      }}
      tableTools={tableTools}
      onDeleteSelected={canDeleteCourseMappings ? handleBulkDelete : undefined}
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
