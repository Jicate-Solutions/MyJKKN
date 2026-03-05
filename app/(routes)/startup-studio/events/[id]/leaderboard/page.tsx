'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Loader2, Trophy } from 'lucide-react';
import { useEvent } from '@/hooks/startup-studio/use-events';
import { useAuth } from '@/hooks/use-auth';
import { LeaderboardTable } from './_components/leaderboard-table';
import { MrrVerificationQueue } from './_components/mrr-verification-queue';

export default function LeaderboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: event, isLoading } = useEvent(id);
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'super_admin' || profile?.role === 'admin' || profile?.role === 'administrator' || (profile as any)?.is_super_admin;

  const breadcrumbs = [
    { label: 'Home', href: '/' },
    { label: 'Startup Studio', href: '/startup-studio/events' },
    { label: event?.name || 'Event', href: `/startup-studio/events/${id}` },
    { label: 'Leaderboard' },
  ];

  if (isLoading) {
    return (
      <ContentLayout title="Leaderboard">
        <PageBreadcrumb items={breadcrumbs} />
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ContentLayout>
    );
  }

  if (!isAdmin && !event?.is_results_published) {
    return (
      <ContentLayout title="Leaderboard">
        <PageBreadcrumb items={breadcrumbs} />
        <div className="space-y-6 mt-4 pb-10">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => router.push(`/startup-studio/events/${id}`)}
          >
            <ArrowLeft className="h-4 w-4" /> Back to Event
          </Button>
          <Card className="max-w-2xl">
            <CardContent className="pt-8 pb-8 text-center space-y-3">
              <Trophy className="h-12 w-12 text-muted-foreground/40 mx-auto" />
              <p className="text-sm font-medium">Results Not Published Yet</p>
              <p className="text-sm text-muted-foreground">Check back after results are published by the organizers.</p>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Leaderboard">
      <PageBreadcrumb items={breadcrumbs} />

      <div className="space-y-6 mt-4 pb-10">
        {/* Back Button */}
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={() => router.push(`/startup-studio/events/${id}`)}
        >
          <ArrowLeft className="h-4 w-4" /> Back to Event
        </Button>

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="h-6 w-6 text-yellow-500" />
            Leaderboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{event?.name || 'Event'}</p>
        </div>

        {/* Content */}
        {isAdmin ? (
          <Tabs defaultValue="leaderboard" className="space-y-5">
            <TabsList className="grid w-full max-w-sm grid-cols-2">
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
      </div>
    </ContentLayout>
  );
}
