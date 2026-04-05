'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useLearnerQuestEnrollments, useBuildSessions } from '@/hooks/pde/use-pde';
import { useAuth } from '@/hooks/use-auth';
import { BeatLoader } from 'react-spinners';
import {
  Hammer,
  ArrowRight,
  Clock,
  Target,
  Rocket,
  Calendar,
} from 'lucide-react';

export default function BuildArenaLandingPage() {
  const { profile: user } = useAuth();
  const learnerId = user?.id;

  const { data: enrollments, isLoading: loadingEnrollments } = useLearnerQuestEnrollments(learnerId);
  const { data: buildSessions, isLoading: loadingSessions } = useBuildSessions(learnerId);

  const activeEnrollments = (enrollments || []).filter(
    (e: { status?: string }) => e.status === 'active' || e.status === 'in_progress'
  );

  const recentSessions = (buildSessions || []).slice(0, 5);

  return (
    <ContentLayout title="Build Arena">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learn', href: '/vac' },
          { label: 'Build Arena' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#0b6d41' }}>
            Build Arena
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your workspace for building real solutions. Pick a quest and start creating.
          </p>
        </div>

        {/* Active Quest Enrollments */}
        <Card className="bg-[#fbfbee]/30 dark:bg-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Rocket className="h-5 w-5 text-[#0b6d41]" />
              Active Quests
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingEnrollments ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                    <Skeleton className="h-8 w-32" />
                  </div>
                ))}
              </div>
            ) : activeEnrollments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Target className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium mb-1">No active quests</h3>
                <p className="text-sm text-muted-foreground max-w-md mb-4">
                  Head to the Quest Board to find a challenge that excites you.
                  Choose solo missions, team projects, or community initiatives.
                </p>
                <Button asChild className="bg-[#0b6d41] hover:bg-[#0b6d41]/90">
                  <Link href="/learn/quests">
                    <Target className="h-4 w-4 mr-2" />
                    Browse Quest Board
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {activeEnrollments.map((enrollment: {
                  id: string;
                  quest_id: string;
                  quest?: { title?: string; quest_type?: string; difficulty?: string };
                  enrolled_at?: string;
                  status?: string;
                }) => (
                  <div
                    key={enrollment.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="space-y-1">
                      <p className="font-medium">
                        {enrollment.quest?.title || 'Untitled Quest'}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {enrollment.quest?.quest_type && (
                          <Badge variant="outline" className="text-xs capitalize">
                            {enrollment.quest.quest_type.replace(/_/g, ' ')}
                          </Badge>
                        )}
                        {enrollment.quest?.difficulty && (
                          <Badge variant="outline" className="text-xs capitalize">
                            {enrollment.quest.difficulty}
                          </Badge>
                        )}
                        {enrollment.enrolled_at && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Enrolled {new Date(enrollment.enrolled_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button asChild size="sm" className="bg-[#0b6d41] hover:bg-[#0b6d41]/90">
                      <Link href={`/learn/build/${enrollment.quest_id}`}>
                        <Hammer className="h-3.5 w-3.5 mr-1" />
                        Continue Building
                        <ArrowRight className="h-3.5 w-3.5 ml-1" />
                      </Link>
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Build Sessions */}
        <Card className="bg-[#fbfbee]/30 dark:bg-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted-foreground" />
              Recent Build Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingSessions ? (
              <div className="flex justify-center py-6">
                <BeatLoader color="#0b6d41" size={8} />
              </div>
            ) : recentSessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Hammer className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">
                  No build sessions yet. Start working on a quest to see your session history here.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentSessions.map((session: {
                  id: string;
                  quest_id?: string;
                  started_at?: string;
                  ended_at?: string;
                  duration_minutes?: number;
                  quest?: { title?: string };
                }) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">
                        {session.quest?.title || 'Build Session'}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {session.started_at
                          ? new Date(session.started_at).toLocaleString()
                          : 'Unknown date'}
                        {session.duration_minutes && (
                          <span className="ml-2 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {session.duration_minutes}m
                          </span>
                        )}
                      </p>
                    </div>
                    {session.quest_id && (
                      <Button asChild size="sm" variant="outline" className="text-xs h-7">
                        <Link href={`/learn/build/${session.quest_id}`}>
                          Resume
                          <ArrowRight className="h-3 w-3 ml-1" />
                        </Link>
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
