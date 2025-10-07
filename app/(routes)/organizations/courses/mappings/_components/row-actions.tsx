'use client';

import { useState } from 'react';
import { Row } from '@tanstack/react-table';
import { MoreHorizontal, Edit, Trash, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { useRouter } from 'next/navigation';
import { CourseMappingService } from '@/lib/services/organization/course-mapping-service';
import { toast } from 'react-hot-toast';
import { CourseMapping } from '@/types/organizations';
import { usePermissions } from '@/hooks/use-permissions';

interface DataTableRowActionsProps<TData> {
  row: Row<TData>;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function DataTableRowActions<TData>({
  row,
  onEdit,
  onDelete
}: DataTableRowActionsProps<TData>) {
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();
  const { canAccess, isSuperAdmin } = usePermissions();
  const mapping = row.original as CourseMapping;

  // Permission checks
  const canView = isSuperAdmin || canAccess('organizations.course.mappings', 'view');
  const canEdit = isSuperAdmin || canAccess('organizations.course.mappings', 'edit');
  const canDelete = isSuperAdmin || canAccess('organizations.course.mappings', 'delete');

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await CourseMappingService.deleteCourseMapping(mapping.id);
      toast.success('Course mapping deleted successfully');
      router.refresh();
      if (onDelete) {
        onDelete(mapping.id);
      }
    } catch (error) {
      console.error('Error deleting course mapping:', error);
      toast.error('Failed to delete course mapping');
    } finally {
      setIsDeleting(false);
      setShowDeleteAlert(false);
    }
  };

  // Don't render the menu if user has no permissions
  const hasAnyPermission = canView || canEdit || canDelete;

  if (!hasAnyPermission) {
    return null;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            className='flex h-8 w-8 p-0 data-[state=open]:bg-muted'
          >
            <MoreHorizontal className='h-4 w-4' />
            <span className='sr-only'>Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='w-[160px]'>
          {canView && (
            <DropdownMenuItem
              onClick={() => router.push(`/organizations/courses/mappings/${mapping.id}`)}
            >
              <Eye className='mr-2 h-4 w-4' />
              View Details
            </DropdownMenuItem>
          )}
          {canEdit && (
            <DropdownMenuItem
              onClick={() =>
                router.push(`/organizations/courses/mappings/${mapping.id}/edit`)
              }
            >
              <Edit className='mr-2 h-4 w-4' />
              Edit
            </DropdownMenuItem>
          )}
          {canDelete && (
            <>
              {(canView || canEdit) && <DropdownMenuSeparator />}
              <DropdownMenuItem
                onClick={() => setShowDeleteAlert(true)}
                className='text-destructive'
              >
                <Trash className='mr-2 h-4 w-4' />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              course mapping for &quot;{mapping.course?.course_name}&quot;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
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
    </>
  );
}