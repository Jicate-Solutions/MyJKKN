'use client';

// Course Events — /courses/new (Phase 2a Task 6). Wraps the shared
// CourseForm (mode="create") and wires it to useCreateCourseEvent. Reachable
// via the "Create a Course" button on /courses (app/(routes)/courses/page.tsx),
// gated by the same courses.create key — see check-nav-reachability.ts, which
// treats a button-invoked child page as reachable through its chip-reachable
// parent and ignores navMeta.

import { useRouter } from 'next/navigation';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useCreateCourseEvent } from '@/hooks/courses/use-course-events';
import type { CreateCourseEventDto } from '@/types/courses';
import { CourseForm, type CourseFormOutput } from '@/app/(routes)/courses/_components/course-form';

export default function NewCoursePage() {
  const router = useRouter();
  const createCourseEvent = useCreateCourseEvent();

  const handleSubmit = (values: CourseFormOutput) => {
    // useCreateCourseEvent's own onSuccess (list invalidation + toast) still
    // fires — this per-call onSuccess only adds the redirect, it doesn't
    // replace the hook's.
    createCourseEvent.mutate(values as CreateCourseEventDto, {
      onSuccess: (created) => router.push(`/courses/${created.id}`),
    });
  };

  return (
    <ContentLayout title="Create a Course">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Courses', href: '/courses' },
          { label: 'New' },
        ]}
      />
      <PermissionGuard module="courses" action="create">
        <div className="mt-4 max-w-3xl">
          <CourseForm
            mode="create"
            onSubmit={handleSubmit}
            submitting={createCourseEvent.isPending}
          />
        </div>
      </PermissionGuard>
    </ContentLayout>
  );
}
