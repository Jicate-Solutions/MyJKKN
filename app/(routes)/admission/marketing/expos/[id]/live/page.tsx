'use client';

import { useParams } from 'next/navigation';
import { useExpoEvent } from '@/hooks/admission';
import {
  useExpoCaptureStats,
  useExpoTopCapturers,
  useExpoWaStats,
  useExpoActualLeadCount,
} from '@/hooks/admission/use-expo-capture';
import { useAuth } from '@/hooks/use-auth';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Users,
  Target,
  Trophy,
  MessageCircle,
  CheckCheck,
  AlertTriangle,
  ArrowLeft,
  MapPin,
  Calendar,
  RefreshCw,
  TrendingUp,
  Clock,
} from 'lucide-react';
import Link from 'next/link';

function LiveDashboardContent() {
  const params = useParams();
  const eventId = params.id as string;
  const { profile } = useAuth();
  const currentUserId = profile?.id || '';

  const { event, isLoading: eventLoading } = useExpoEvent(eventId);
  const { data: captureStats, isLoading: statsLoading, dataUpdatedAt } = useExpoCaptureStats(eventId, currentUserId);
  const { data: topCapturers, isLoading: capturersLoading } = useExpoTopCapturers(eventId);
  const { data: waStats } = useExpoWaStats(eventId);
  const { data: actualCount } = useExpoActualLeadCount(eventId);

  if (eventLoading) {
    return (
      <div className="space-y-4 mt-4">
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!event) {
    return (
      <Card className="max-w-md mx-auto mt-8">
        <CardContent className="pt-6 text-center">
          <p className="text-muted-foreground">Event not found.</p>
          <Button variant="outline" className="mt-4" asChild>
            <Link href="/admission/marketing/expos">Back to Expos</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-2">
            <Link href={`/admission/marketing/expos/${eventId}`}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Event
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">{event.event_name}</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {event.city}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {new Date(event.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              {event.end_date !== event.start_date && (
                <> – {new Date(event.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</>
              )}
            </span>
            <Badge variant={event.event_status === 'in_progress' ? 'default' : 'outline'}>
              {event.event_status}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCw className="h-3 w-3 animate-spin" />
          <span>Live — updated {lastUpdated}</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-950">
                <Target className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {statsLoading ? '—' : actualCount ?? captureStats?.teamCount ?? 0}
                </p>
                <p className="text-xs text-muted-foreground">Total Leads</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-950">
                <Users className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{event.total_team_members}</p>
                <p className="text-xs text-muted-foreground">Team Members</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-950">
                <CheckCheck className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{waStats?.sent ?? 0}</p>
                <p className="text-xs text-muted-foreground">WA Sent</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-950">
                {(waStats?.failed ?? 0) > 0 ? (
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                ) : (
                  <MessageCircle className="h-5 w-5 text-amber-600" />
                )}
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {(waStats?.failed ?? 0) > 0 ? waStats?.failed : waStats?.queued ?? 0}
                </p>
                <p className="text-xs text-muted-foreground">
                  {(waStats?.failed ?? 0) > 0 ? 'WA Failed' : 'WA Queued'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Personal Stats + Leaderboard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Your Stats */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Your Captures
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <p className="text-5xl font-bold text-primary">
                {statsLoading ? '—' : captureStats?.myCount ?? 0}
              </p>
              <p className="text-sm text-muted-foreground mt-2">leads captured by you</p>
              {captureStats && captureStats.teamCount > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {Math.round(((captureStats.myCount || 0) / captureStats.teamCount) * 100)}% of team total
                </p>
              )}
            </div>
            <Button className="w-full mt-4" asChild>
              <Link href={`/admission/marketing/expos/${eventId}/capture`}>
                Capture More Leads
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Leaderboard */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="h-4 w-4 text-yellow-500" />
              Team Leaderboard
            </CardTitle>
            <CardDescription>
              Top lead capturers for this event
            </CardDescription>
          </CardHeader>
          <CardContent>
            {capturersLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : !topCapturers || topCapturers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Target className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No leads captured yet. Be the first!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {topCapturers.map((capturer, index) => {
                  const isCurrentUser = capturer.userId === currentUserId;
                  const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : null;
                  const percentage = captureStats?.teamCount
                    ? Math.round((capturer.count / captureStats.teamCount) * 100)
                    : 0;

                  return (
                    <div
                      key={capturer.userId}
                      className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                        isCurrentUser
                          ? 'bg-primary/10 border border-primary/20'
                          : 'bg-muted/50 hover:bg-muted'
                      }`}
                    >
                      {/* Rank */}
                      <div className="w-8 text-center">
                        {medal ? (
                          <span className="text-lg">{medal}</span>
                        ) : (
                          <span className="text-sm font-bold text-muted-foreground">#{index + 1}</span>
                        )}
                      </div>

                      {/* Name + Progress Bar */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium truncate ${isCurrentUser ? 'text-primary' : ''}`}>
                            {capturer.name}
                          </span>
                          {isCurrentUser && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">You</Badge>
                          )}
                        </div>
                        {/* Progress bar */}
                        <div className="mt-1 h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-gray-400' : index === 2 ? 'bg-amber-700' : 'bg-primary/50'
                            }`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>

                      {/* Count */}
                      <div className="text-right">
                        <span className="text-lg font-bold">{capturer.count}</span>
                        <p className="text-[10px] text-muted-foreground">{percentage}%</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activity Indicator */}
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-2">
        <Clock className="h-3 w-3" />
        <span>Stats refresh every 30 seconds</span>
      </div>
    </div>
  );
}

export default function ExpoLiveDashboard() {
  return (
    <ContentLayout>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/admission/marketing/expos">Expos</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Live Dashboard</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <LiveDashboardContent />
    </ContentLayout>
  );
}
