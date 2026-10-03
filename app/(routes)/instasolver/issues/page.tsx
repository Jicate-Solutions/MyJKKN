import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { IssuesClient } from './_components/issues-client';

export default function IssuesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <IssuesClient />
    </Suspense>
  );
}
