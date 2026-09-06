// app/(public)/course/[slug]/page.tsx
//
// PUBLIC course landing page — Course Events Phase 3.
//
// A visitor with no JKKN account sees the course and its package tiers, and can
// go on to apply. Server component: it loads through the shared service-role
// loader, so no tenant id and no internal id ever reaches the browser.
//
// Reachable only because proxy.ts allow-lists '/course/' (WITH the trailing
// slash — '/course' would also match the authenticated '/courses' console).
//
// Explicit "not available" state when the slug is unknown or the course is still
// a draft — never a silent redirect.
//
// Pattern: app/(public)/r/[slug]/page.tsx.

import type { Metadata } from 'next';
import { loadPublicCourse } from '@/lib/services/courses/public-course-loader';
import { CourseNotAvailable } from './_components/course-not-available';
import { CourseLanding } from './_components/course-landing';

export const dynamic = 'force-dynamic';

interface CoursePageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ form?: string }>;
}

export async function generateMetadata({ params }: CoursePageProps): Promise<Metadata> {
  const { slug } = await params;
  const course = await loadPublicCourse(slug);

  // Indexing is ALLOWED here, unlike the other public pages in this app. A
  // routing form or a booking link is a private working surface that happens to
  // need no login; a course landing page is marketing whose whole purpose is to
  // be found. The apply page below is still noindex — that one is a form, not a
  // destination.
  return course
    ? {
        title: `${course.title} · JKKN`,
        description: course.description ?? undefined,
        openGraph: {
          title: course.title,
          description: course.description ?? undefined,
          images: course.cover_image_url ? [course.cover_image_url] : undefined,
        },
      }
    : { title: 'Course not found · JKKN', robots: { index: false } };
}

export default async function PublicCoursePage({ params, searchParams }: CoursePageProps) {
  const { slug } = await params;
  const { form } = await searchParams;
  const course = await loadPublicCourse(slug);

  if (!course) {
    return (
      <CourseNotAvailable
        title="Course not available"
        message="This course does not exist, or it is not open to the public yet. Please check the link, or contact the institution you were trying to reach."
      />
    );
  }

  return <CourseLanding course={course} preselectedForm={form ?? null} />;
}
