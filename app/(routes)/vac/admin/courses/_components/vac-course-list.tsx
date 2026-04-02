'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable, type DataFetchParams, type DataFetchResult } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { BookOpen, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { VACService } from '@/lib/services/vac/vac-service';
import { useDeleteVACCourse } from '@/hooks/vac/use-vac';
import type { VACCourse } from '@/types/vac';

interface VACCourseListProps {
  institutionId: string;
}

export function VACCourseList({ institutionId }: VACCourseListProps) {
  const router = useRouter();
  const deleteMutation = useDeleteVACCourse();
  const [deleteTarget, setDeleteTarget] = useState<VACCourse | null>(null);
  const [refetchKey, setRefetchKey] = useState(0);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteMutation.mutateAsync(deleteTarget.id);
    setDeleteTarget(null);
    setRefetchKey((k) => k + 1);
  };

  const trackColor = (track: string) => {
    if (track.startsWith('AI')) return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    if (track.startsWith('H')) return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
    return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
  };

  const getColumns = useCallback(
    (_handleRowDeselection: ((rowId: string) => void) | null | undefined): ColumnDef<VACCourse, unknown>[] => [
      {
        accessorKey: 'code',
        header: 'Code',
        size: 120,
      },
      {
        accessorKey: 'name',
        header: 'Course Name',
        size: 250,
      },
      {
        accessorKey: 'track',
        header: 'Track',
        size: 100,
        cell: ({ row }) => (
          <Badge variant="outline" className={trackColor(row.original.track)}>
            {row.original.track}
          </Badge>
        ),
      },
      {
        accessorKey: 'course_category',
        header: 'Category',
        size: 100,
        cell: ({ row }) => (
          <span className="capitalize text-sm">
            {row.original.course_category.replace('_', ' ')}
          </span>
        ),
      },
      {
        accessorKey: 'fee',
        header: 'Fee',
        size: 80,
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.fee > 0 ? `₹${row.original.fee.toLocaleString()}` : 'Free'}
          </span>
        ),
      },
      {
        accessorKey: 'duration_hours',
        header: 'Hours',
        size: 70,
        cell: ({ row }) => <span className="text-sm">{row.original.duration_hours}h</span>,
      },
      {
        accessorKey: 'nsqf_level',
        header: 'NSQF',
        size: 60,
        cell: ({ row }) => (
          <span className="text-sm">{row.original.nsqf_level ?? '-'}</span>
        ),
      },
      {
        accessorKey: 'is_active',
        header: 'Status',
        size: 90,
        cell: ({ row }) => (
          <Badge variant={row.original.is_active ? 'default' : 'secondary'}>
            {row.original.is_active ? 'Active' : 'Inactive'}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: '',
        size: 60,
        cell: ({ row }) => {
          const course = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() =>
                    router.push(`/vac/admin/courses/${course.id}/edit`)
                  }
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    router.push(`/vac/admin/courses/${course.id}/lessons`)
                  }
                >
                  <BookOpen className="mr-2 h-4 w-4" />
                  Lessons
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setDeleteTarget(course)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [router]
  );

  const fetchDataFn = useCallback(
    async (params: DataFetchParams): Promise<DataFetchResult<VACCourse>> => {
      const res = await VACService.getCourses({
        institution_id: institutionId,
        search: params.search || undefined,
        page: params.page,
        limit: params.limit,
        sortBy: params.sort_by,
        sortOrder: params.sort_order as 'asc' | 'desc',
      });
      return {
        success: true,
        data: res.data,
        pagination: {
          page: res.metadata.page,
          limit: params.limit,
          total_pages: res.metadata.totalPages,
          total_items: res.metadata.total,
        },
      };
    },
    [institutionId]
  );

  const renderToolbarContent = useCallback(
    ({ selectedRows, resetSelection }: {
      selectedRows: VACCourse[];
      allSelectedIds: (string | number)[];
      totalSelectedCount: number;
      resetSelection: () => void;
    }) => (
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={() => router.push('/vac/admin/courses/new')}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add Course
        </Button>
        {selectedRows.length > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={async () => {
              for (const row of selectedRows) {
                await deleteMutation.mutateAsync(row.id);
              }
              resetSelection();
              setRefetchKey((k) => k + 1);
            }}
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
            Delete ({selectedRows.length})
          </Button>
        )}
      </div>
    ),
    [router, deleteMutation]
  );

  return (
    <>
      <DataTable<VACCourse, unknown>
        getColumns={getColumns}
        fetchDataFn={fetchDataFn}
        idField="id"
        renderToolbarContent={renderToolbarContent}
        refetchKey={refetchKey}
        config={{
          enableSearch: true,
          enableColumnResizing: true,
        }}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Course</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.name}&quot;?
              This action cannot be undone and will remove all associated lessons and enrollments.
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
