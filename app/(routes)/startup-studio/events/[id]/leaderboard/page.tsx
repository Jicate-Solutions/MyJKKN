'use client';

import { use, useEffect, useState, useMemo } from 'react';
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
import { useVerifiedLeaderboardPaginated } from '@/hooks/startup-studio/use-appathon-verifications';
import { LeaderboardTable } from './_components/leaderboard-table';
import { MrrVerificationQueue } from './_components/mrr-verification-queue';
import { CelebrationConfetti } from './_components/celebration-confetti';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

export default function LeaderboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: event, isPending: eventPending } = useEvent(id);
  const { profile, isLoading: authLoading } = useAuth();
  const isAdmin = profile?.role === 'super_admin' || profile?.role === 'admin' || profile?.role === 'administrator';
  const isStudent = profile?.role === 'student';
  const isFrozen = !!event?.metrics_frozen_at;
  const isPublished = !!event?.is_results_published;

  // Fetch first page to get total count for header + confetti trigger
  const { data: firstPage, isLoading: firstPageLoading } = useVerifiedLeaderboardPaginated(id, {
    page: 1, pageSize: 1,
  });
  const totalTeams = firstPage?.pagination.totalItems ?? 0;

  const [selectedInstitution, setSelectedInstitution] = useState<string>('all');

  // Fetch institutions list (small query for dropdown)
  const { data: allInstitutions } = useVerifiedLeaderboardPaginated(id, {
    page: 1, pageSize: 500, // Get all for institution list
  });
  const institutions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    (allInstitutions?.data ?? []).forEach((e) => {
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
  }, [allInstitutions?.data]);

  // Auto-select student's own institution in the "By College" tab
  useEffect(() => {
    if (isStudent && profile?.institution_id && institutions.length > 0 && selectedInstitution === 'all') {
      const match = institutions.find((inst) => inst.id === profile.institution_id);
      if (match) setSelectedInstitution(match.id);
    }
  }, [isStudent, profile?.institution_id, institutions, selectedInstitution]);

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

      {/* Celebration confetti on page load when results are published */}
      <CelebrationConfetti active={isPublished && !firstPageLoading && totalTeams > 0} />

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
        <div className="relative">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                <Trophy className="h-5 w-5 sm:h-6 sm:w-6 text-yellow-500" />
                Leaderboard
                {isPublished && (
                  <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[10px] sm:text-xs">
                    Results Published
                  </Badge>
                )}
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">{event?.name || 'Event'}</p>
            </div>
            {totalTeams > 0 && (
              <p className="text-xs text-muted-foreground">
                {totalTeams} teams evaluated
              </p>
            )}
          </div>
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
        <Tabs defaultValue="overall" className="space-y-4 sm:space-y-5">
          <TabsList className={`grid w-full max-w-md ${isAdmin ? 'grid-cols-3' : 'grid-cols-2'} h-9 sm:h-10`}>
            <TabsTrigger value="overall" className="gap-1 sm:gap-1.5 text-xs sm:text-sm">
              <Globe className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              Overall
            </TabsTrigger>
            <TabsTrigger value="institution" className="gap-1 sm:gap-1.5 text-xs sm:text-sm">
              <Building2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              By College
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="mrr-queue" className="text-xs sm:text-sm">MRR Verification</TabsTrigger>
            )}
          </TabsList>

          {/* Overall Tab */}
          <TabsContent value="overall">
            <LeaderboardTable
              eventId={id}
              isAdmin={isAdmin}
              isPublished={isPublished}
              isFrozen={isFrozen}
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
