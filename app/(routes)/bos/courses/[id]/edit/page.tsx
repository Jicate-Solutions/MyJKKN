'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { CourseForm } from '../../_components/course-form';
import { useBosCourse, useUpdateBosCourse } from '@/hooks/bos/use-bos-courses';
import { isLocked } from '@/types/bos-courses';

export default function EditCoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: course, isLoading } = useBosCourse(id);
  const update = useUpdateBosCourse();

  return (
    <PermissionGuard module='academic.bos-courses' action='edit'>
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>
            {course ? `Edit ${course.course_code}` : 'Edit Course'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading || !course ? (
            <Skeleton className='h-96 w-full' />
          ) : isLocked(course) ? (
            <div className='flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800'>
              <Lock className='h-4 w-4' />
              This course is <strong>Locked</strong> and cannot be edited.
              <button
                onClick={() => router.push('/bos/courses')}
                className='ml-auto underline'
              >
                Back to list
              </button>
            </div>
          ) : (
            <CourseForm
              submitting={update.isPending}
              submitLabel='Save Changes'
              defaultValues={{
                course_code: course.course_code,
                course_name: course.course_name ?? '',
                course_category: course.course_category,
                course_part_master: course.course_part_master ?? 'Part III',
                course_type: (course.course_type as never) ?? 'Core',
                exam_duration: course.exam_duration ?? 3,
                credit: course.credit ?? 3,
                theory_hours: course.theory_hours ?? 0,
                practical_hours: course.practical_hours ?? 0,
                internal_max_mark: course.internal_max_mark ?? 25,
                external_max_mark: course.external_max_mark ?? 75,
                total_max_mark: course.total_max_mark ?? 100,
              }}
              onSubmit={async (form) => {
                try {
                  await update.mutateAsync({ id, form });
                  toast.success('Course updated');
                  router.push('/bos/courses');
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            />
          )}
        </CardContent>
      </Card>
    </PermissionGuard>
  );
}
