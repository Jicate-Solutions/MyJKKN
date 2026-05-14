'use client';

import { use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
  const searchParams = useSearchParams();
  const { data: course, isLoading } = useBosCourse(id);
  const update = useUpdateBosCourse();

  // Hard-lock check: trust the URL param (set from list row data which is reliable)
  // as well as the fetched course — whichever says locked wins.
  const lockedFromUrl = searchParams.get('course_status')?.toLowerCase() === 'locked';
  const courseIsLocked = lockedFromUrl || isLocked(course);

  return (
    <PermissionGuard module='academic.bos-courses' action='edit'>
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>
            {course ? `Edit ${course.course_code}` : 'Edit Course'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className='h-96 w-full' />
          ) : courseIsLocked ? (
            // Hard block — render regardless of whether course data has loaded,
            // because lockedFromUrl is already definitive while the fetch is in flight.
            <div className='flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800'>
              <Lock className='h-5 w-5 shrink-0' />
              <span>
                This course is <strong>Locked</strong> and cannot be edited.
              </span>
              <button
                onClick={() => router.push('/bos/courses')}
                className='ml-auto underline'
              >
                Back to list
              </button>
            </div>
          ) : !course ? (
            <Skeleton className='h-96 w-full' />
          ) : (
            <CourseForm
              submitting={update.isPending}
              submitLabel='Save Changes'
              defaultValues={{
                course_code: course.course_code,
                course_name: course.course_name ?? course.course_title ?? '',
                course_category: course.course_category,
                course_part_master: course.course_part_master ?? 'Part III',
                course_type: (course.course_type as never) ?? 'Core',
                // Leave Level blank for legacy / non-tiered courses (e.g.,
                // Internship) — don't silently substitute 'I' on save.
                course_level: (course.course_level as never) ?? undefined,
                exam_duration: course.exam_duration ?? 3,
                credit: course.credit ?? course.credits ?? 3,
                theory_hours: course.theory_hours ?? 0,
                practical_hours: course.practical_hours ?? 0,
                internal_max_mark: course.internal_max_mark ?? 25,
                external_max_mark: course.external_max_mark ?? 75,
                total_max_mark: course.total_max_mark ?? 100,
              }}
              onSubmit={async (form) => {
                // Final server-side guard — 423 response means COE confirmed lock.
                try {
                  await update.mutateAsync({ id, form });
                  toast.success('Course updated');
                  router.push('/bos/courses');
                } catch (e) {
                  const msg = (e as Error).message;
                  if (msg.toLowerCase().includes('locked')) {
                    toast.error('Course is locked and cannot be modified');
                  } else {
                    toast.error(msg);
                  }
                }
              }}
            />
          )}
        </CardContent>
      </Card>
    </PermissionGuard>
  );
}
