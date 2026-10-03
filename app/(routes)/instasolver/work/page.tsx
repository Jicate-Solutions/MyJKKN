import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { WorkClient } from './_components/work-client';

export default function InstaSolverWorkPage() {
  // WorkClient reads ?tab= and ?page=, which needs a Suspense boundary.
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <WorkClient />
    </Suspense>
  );
}
