'use client';

/** Dashboard — profile card (with child switcher) + feature tile grid. */
import { ProfileCard } from '@/components/parent/profile-card';
import { FeatureTileGrid } from '@/components/parent/feature-tile-grid';
import { WhatsNewBanner } from '@/components/parent/whats-new-banner';
import { Skeleton } from '@/components/ui/skeleton';
import { useParentSession } from '@/hooks/parent/use-parent-session';

export default function ParentDashboardPage() {
  const { isLoading, children } = useParentSession();

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-44 w-full rounded-3xl" />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-[1.5rem]" />
          ))}
        </div>
      </div>
    );
  }

  if (!children.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
        <p className="font-medium">No students linked yet</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          We couldn’t find any linked children for this account. Please contact your
          institution if this looks wrong.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ProfileCard />
      <WhatsNewBanner />
      <FeatureTileGrid />
    </div>
  );
}
