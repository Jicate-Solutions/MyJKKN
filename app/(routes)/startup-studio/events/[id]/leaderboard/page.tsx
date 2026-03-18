'use client';

import { use, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Building2, Globe, Loader2, Trophy, Info } from 'lucide-react';
import { useEvent } from '@/hooks/startup-studio/use-events';
import { useAuth } from '@/hooks/use-auth';
import { useVerifiedLeaderboard } from '@/hooks/startup-studio/use-appathon-verifications';
import { useLeaderboard } from '@/hooks/startup-studio/use-event-leaderboard';
import { LeaderboardTable } from './_components/leaderboard-table';
import { MrrVerificationQueue } from './_components/mrr-verification-queue';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function LeaderboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: event, isPending: eventPending } = useEvent(id);
  const { profile, isLoading: authLoading } = useAuth();
  const isAdmin = profile?.role === 'super_admin' || profile?.role === 'admin' || profile?.role === 'administrator';
  const isFrozen = !!event?.metrics_frozen_at;
  const isPublished = !!event?.is_results_published;

  const { data: verifiedEntries = [], isLoading: verifiedLoading } = useVerifiedLeaderboard(id);
  const { data: prePublishedEntries = [] } = useLeaderboard(id);

  const [selectedInstitution, setSelectedInstitution] = useState<string>('all');

  // Derive unique institutions from whichever data source is active
  const institutions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    const entries: any[] = isPublished ? verifiedEntries : prePublishedEntries;
    entries.forEach((e) => {
      const iid = e.institution_id;
      const iname = e.institution_name || 'Unknown';
      if (!iid) return;
      const existing = map.get(iid);
      if (existing) {
        existing.count++;
      } else {
        map.set(iid, { id: iid, name: iname, count: 1 });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [verifiedEntries, prePublishedEntries, isPublished]);

  const breadcrumbs = [
    { label: 'Home', href: '/' },
    { label: 'Startup Studio', href: '/startup-studio/events' },
    { label: event?.name || 'Event', href: `/startup-studio/events/${id}` },
    { label: 'Leaderboard' },
  ];

  if ((authLoading && !profile) || eventPending) {
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

        {/* State banners */}
        {!isPublished && !isFrozen && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-sm">
              <strong>Preliminary</strong> — Based on team-reported metrics.
              Final rankings will be shown after evaluator verification.
            </AlertDescription>
          </Alert>
        )}
        {!isPublished && isFrozen && (
          <Alert className="border-amber-400 bg-amber-50 dark:bg-amber-950/20">
            <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
            <AlertDescription className="text-amber-700 text-sm">
              <strong>Verification in progress...</strong> Results will be published
              after all teams are verified.
            </AlertDescription>
          </Alert>
        )}

        {/* Content Tabs */}
        <Tabs defaultValue="overall" className="space-y-5">
          <TabsList className={`grid w-full max-w-md ${isAdmin ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <TabsTrigger value="overall" className="gap-1.5">
              <Globe className="h-3.5 w-3.5" />
              Overall
            </TabsTrigger>
            <TabsTrigger value="institution" className="gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              By Institution
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="mrr-queue">MRR Verification</TabsTrigger>
            )}
          </TabsList>

          {/* Overall Tab */}
          <TabsContent value="overall">
            <LeaderboardTable
              eventId={id}
              isAdmin={isAdmin}
              isPublished={isPublished}
              isFrozen={isFrozen}
              entriesOverride={verifiedEntries.length > 0 ? verifiedEntries as any : undefined}
              isLoadingOverride={verifiedLoading || undefined}
            />
          </TabsContent>

          {/* By Institution Tab */}
          <TabsContent value="institution">
            <div className="space-y-4">
              {/* Institution Selector */}
              <div className="flex items-center gap-3">
                <Select
                  value={selectedInstitution}
                  onValueChange={setSelectedInstitution}
                >
                  <SelectTrigger className="w-full max-w-md h-10">
                    <SelectValue placeholder="Select Institution" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Institutions — select one</SelectItem>
                    {institutions.map((inst) => (
                      <SelectItem key={inst.id} value={inst.id}>
                        {inst.name} ({inst.count} teams)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedInstitution === 'all' ? (
                <Card>
                  <CardContent className="pt-8 pb-8 text-center space-y-3">
                    <Building2 className="h-12 w-12 text-muted-foreground/40 mx-auto" />
                    <p className="text-sm font-medium">Select an Institution</p>
                    <p className="text-sm text-muted-foreground">
                      Choose an institution above to view their college-wise rankings.
                    </p>
                    {institutions.length > 0 && (
                      <div className="flex flex-wrap justify-center gap-2 pt-2">
                        {institutions.map((inst) => (
                          <Button
                            key={inst.id}
                            variant="outline"
                            size="sm"
                            className="text-xs h-8"
                            onClick={() => setSelectedInstitution(inst.id)}
                          >
                            {inst.name.replace('JKKN ', '').replace('College of ', '')} ({inst.count})
                          </Button>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <LeaderboardTable
                  eventId={id}
                  isAdmin={isAdmin}
                  isPublished={isPublished}
                  isFrozen={isFrozen}
                  entriesOverride={isPublished ? verifiedEntries as any : undefined}
                  isLoadingOverride={isPublished ? verifiedLoading : undefined}
                  institutionView
                  institutionId={selectedInstitution}
                />
              )}
            </div>
          </TabsContent>

          {/* MRR Queue Tab (Admin only) */}
          {isAdmin && (
            <TabsContent value="mrr-queue">
              <MrrVerificationQueue eventId={id} />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </ContentLayout>
  );
}
