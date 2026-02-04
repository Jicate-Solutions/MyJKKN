import { Suspense } from 'react';
import CourseDetailContent from './_components/course-detail-content';
import { Skeleton } from '@/components/ui/skeleton';

interface PageProps {
  params: Promise<{ courseId: string }>;
}

function CourseLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
      <header className="border-b bg-white dark:bg-gray-900 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <Skeleton className="h-8 w-48" />
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">
        <Skeleton className="h-12 w-2/3 mb-4" />
        <Skeleton className="h-6 w-1/2 mb-8" />
        <Skeleton className="h-64 w-full" />
      </main>
    </div>
  );
}

export default async function PublicCourseDetailPage({ params }: PageProps) {
  const { courseId } = await params;
  return (
    <Suspense fallback={<CourseLoading />}>
      <CourseDetailContent courseId={courseId} />
    </Suspense>
  );
}
