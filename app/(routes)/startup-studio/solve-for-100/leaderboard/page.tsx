'use client';

import { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { apiClient } from '@/lib/api/client';
import { SF100PublicStats } from './_components/sf100-public-stats';
import { SF100PublicLeaderboard } from './_components/sf100-public-leaderboard';

function LeaderboardContent() {
  // Auto-fetch the active program
  const { data: programData, isLoading: programLoading } = useQuery({
    queryKey: ['sf100', 'active-program'],
    queryFn: async () => {
      // Try the programs list endpoint to find active program
      const res = await apiClient.get('/api/startup-studio/solve-for-100/programs', {
        params: { status: 'active', limit: 1 },
      });
      const programs = (res as any)?.data || [];
      return programs[0] || null;
    },
    staleTime: 60000,
  });

  if (programLoading) {
    return <PageFallback />;
  }

  const programId = programData?.id;

  if (!programId) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-muted-foreground">
          No active Solve for 100 program found.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Leaderboard</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {programData?.name || 'Solve for 100'} — live standings
        </p>
      </div>
      <SF100PublicStats programId={programId} />
      <SF100PublicLeaderboard programId={programId} />
    </div>
  );
}

function PageFallback() {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export default function LeaderboardPage() {
  return (
    <Suspense fallback={<PageFallback />}>
      <LeaderboardContent />
    </Suspense>
  );
}
