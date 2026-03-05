'use client';

import { use } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { useEvent } from '@/hooks/startup-studio/use-events';
import { useAuth } from '@/hooks/use-auth';
import { LeaderboardTable } from './_components/leaderboard-table';
import { MrrVerificationQueue } from './_components/mrr-verification-queue';

export default function LeaderboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: event } = useEvent(id);
  const { profile } = useAuth();
  const isAdmin =
    profile?.role === 'admin' ||
    profile?.role === 'administrator' ||
    profile?.is_super_admin;

  if (!isAdmin && !event?.is_results_published) {
    return (
      <ContentLayout>
        <PageBreadcrumb
          items={[
            { label: 'Startup Studio', href: '/startup-studio/events' },
            { label: event?.name || 'Event', href: `/startup-studio/events/${id}` },
            { label: 'Leaderboard' },
          ]}
        />
        <Card className="max-w-lg mx-auto mt-8">
          <CardContent className="pt-6 text-center text-muted-foreground">
            Results coming soon! Check back after results are published.
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout>
      <PageBreadcrumb
        items={[
          { label: 'Startup Studio', href: '/startup-studio/events' },
          { label: event?.name || 'Event', href: `/startup-studio/events/${id}` },
          { label: 'Leaderboard' },
        ]}
      />

      {isAdmin ? (
        <Tabs defaultValue="leaderboard" className="space-y-4">
          <TabsList>
            <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
            <TabsTrigger value="mrr-queue">MRR Verification</TabsTrigger>
          </TabsList>
          <TabsContent value="leaderboard">
            <LeaderboardTable eventId={id} isAdmin={true} />
          </TabsContent>
          <TabsContent value="mrr-queue">
            <MrrVerificationQueue eventId={id} />
          </TabsContent>
        </Tabs>
      ) : (
        <LeaderboardTable eventId={id} isAdmin={false} />
      )}
    </ContentLayout>
  );
}
