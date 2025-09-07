import { Skeleton } from '@/components/ui/skeleton';

export function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {/* Table header skeleton */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-[300px]" />
        <Skeleton className="h-9 w-[100px]" />
      </div>
      
      {/* Table skeleton */}
      <div className="border rounded-md">
        {/* Header row */}
        <div className="flex items-center space-x-4 p-4 border-b">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-[200px]" />
          <Skeleton className="h-4 w-[100px]" />
          <Skeleton className="h-4 w-[150px]" />
          <Skeleton className="h-4 w-[100px]" />
          <Skeleton className="h-4 w-[80px]" />
          <Skeleton className="h-4 w-[60px]" />
        </div>
        
        {/* Data rows */}
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center space-x-4 p-4 border-b last:border-b-0">
            <Skeleton className="h-4 w-4" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-[180px]" />
              <Skeleton className="h-3 w-[240px]" />
              <Skeleton className="h-3 w-[120px]" />
            </div>
            <Skeleton className="h-5 w-[80px]" />
            <div className="space-y-1">
              <Skeleton className="h-4 w-[130px]" />
              <Skeleton className="h-3 w-[100px]" />
            </div>
            <Skeleton className="h-5 w-[60px]" />
            <Skeleton className="h-4 w-[70px]" />
            <Skeleton className="h-5 w-[50px]" />
            <Skeleton className="h-8 w-8" />
          </div>
        ))}
      </div>
      
      {/* Pagination skeleton */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-[100px]" />
        <div className="flex items-center space-x-2">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-4 w-[60px]" />
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-8" />
        </div>
      </div>
    </div>
  );
}