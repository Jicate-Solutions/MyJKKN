import { ApplicationCardSkeleton } from './application-card-skeleton';

export function ApplicationGridSkeleton() {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <ApplicationCardSkeleton key={index} />
      ))}
    </div>
  );
}