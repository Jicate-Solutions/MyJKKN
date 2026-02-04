import { Suspense } from 'react';
import LessonViewerContent from './_components/lesson-viewer-content';
import { Skeleton } from '@/components/ui/skeleton';

interface PageProps {
  params: Promise<{ courseId: string; lessonId: string }>;
}

function LessonLoading() {
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
        <div className="space-y-4">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </main>
    </div>
  );
}

export default async function LessonViewerPage({ params }: PageProps) {
  const { courseId, lessonId } = await params;
  return (
    <Suspense fallback={<LessonLoading />}>
      <LessonViewerContent courseId={courseId} lessonId={lessonId} />
    </Suspense>
  );
}
