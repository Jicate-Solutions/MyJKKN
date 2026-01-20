import { Skeleton } from '@/components/ui/skeleton';

export default function ProfileLoading() {
  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="space-y-6">
        <div>
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-4 w-96 mt-2" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    </div>
  );
}
