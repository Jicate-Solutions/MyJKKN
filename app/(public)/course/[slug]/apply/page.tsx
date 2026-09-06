// app/(public)/course/[slug]/apply/page.tsx
//
// PUBLIC application form — Course Events Phase 3.
//
// Server component: resolves the form through the shared service-role loader and
// hands only the PublicCourseApplyForm shape to the client widget. The widget
// posts to /api/public/courses/[slug]/apply, which re-validates everything —
// nothing the browser sends is trusted, least of all the package.
//
// noindex, unlike the landing page. That page is marketing and should be found;
// this one is a form, and a form in search results is just a way to collect
// submissions from people who never saw what they are applying for.

import type { Metadata } from 'next';
import { loadPublicApplyForm, loadPublicCourse } from '@/lib/services/courses/public-course-loader';
import { CourseNotAvailable } from '../_components/course-not-available';
import { ApplyWidget } from './_components/apply-widget';
import { FormChooser } from './_components/form-chooser';

export const dynamic = 'force-dynamic';

interface ApplyPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ form?: string }>;
}

export const metadata: Metadata = {
  title: 'Apply · JKKN',
  robots: { index: false },
};

export default async function PublicApplyPage({ params, searchParams }: ApplyPageProps) {
  const { slug } = await params;
  const { form } = await searchParams;

  const applyForm = await loadPublicApplyForm(slug, form);

  if (!applyForm) {
    // Two different reasons land here, and they deserve different pages: either
    // there is nothing to apply to, or there are SEVERAL forms and none was
    // named. Silently picking the first would send an applicant down a path
    // they did not choose, so ask.
    const course = await loadPublicCourse(slug);

    if (course && course.forms.length > 1) {
      return <FormChooser course={course} />;
    }

    return (
      <CourseNotAvailable
        title="This application form is not available"
        message="The form may have closed, or the link may be out of date. Open the course page to see whether applications are still being accepted."
      />
    );
  }

  if (!applyForm.applicationsOpen) {
    return (
      <CourseNotAvailable
        title="Applications are closed"
        message={`${applyForm.courseTitle} is not accepting applications at the moment.`}
      />
    );
  }

  return <ApplyWidget form={applyForm} courseSlug={slug} />;
}
