'use client';

import { useRouter } from 'next/navigation';
import { MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePermissions } from '@/hooks/use-permissions';
import { useDeleteBosCourse } from '@/hooks/bos/use-bos-courses';
import { type BosCourseMaster, isLocked } from '@/types/bos-courses';

export function CoursesRowActions({ course }: { course: BosCourseMaster }) {
  const router = useRouter();
  const { canAccess, isSuperAdmin } = usePermissions();
  const del = useDeleteBosCourse();

  const locked = isLocked(course);
  const canEdit = !locked && (isSuperAdmin || canAccess('academic.bos-courses', 'edit'));
  const canDelete = !locked && (isSuperAdmin || canAccess('academic.bos-courses', 'delete'));

  if (!canEdit && !canDelete) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' size='icon' className='h-8 w-8'>
          <MoreHorizontal className='h-4 w-4' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        {canEdit && (
          <DropdownMenuItem onClick={() => router.push(`/bos/courses/${course.id}/edit`)}>
            Edit
          </DropdownMenuItem>
        )}
        {canDelete && (
          <DropdownMenuItem
            className='text-red-600'
            onClick={async () => {
              if (!confirm(`Delete ${course.course_code}?`)) return;
              try {
                await del.mutateAsync(course.id);
                toast.success('Course deleted');
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
