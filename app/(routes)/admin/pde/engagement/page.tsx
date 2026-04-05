'use client';

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Activity, Clock, TrendingUp, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useVACCourses } from '@/hooks/vac/use-vac';
import type { PDEEngagementEvent } from '@/types/pde';

// Fetch aggregate engagement stats
function useEngagementStats(courseId?: string) {
  return useQuery({
    queryKey: ['pde', 'engagement-stats', courseId],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();

      // Get unique active learners (from daily table)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let dailyQuery = (supabase as any)
        .from('pde_engagement_daily')
        .select('learner_id, time_spent_minutes, lessons_completed, assessments_taken');
      if (courseId && courseId !== 'all') {
        dailyQuery = dailyQuery.eq('course_id', courseId);
      }
      const { data: dailyRows } = await dailyQuery;

      const rows = dailyRows || [];
      const uniqueLearners = new Set(rows.map((r: { learner_id: string }) => r.learner_id));
      const totalTime = rows.reduce((s: number, r: { time_spent_minutes: number }) => s + (r.time_spent_minutes || 0), 0);
      const avgTime = uniqueLearners.size > 0 ? Math.round(totalTime / uniqueLearners.size) : 0;

      // Simple engagement score: avg across learners
      const learnerTimes: Record<string, number> = {};
      for (const r of rows) {
        learnerTimes[r.learner_id] = (learnerTimes[r.learner_id] || 0) + (r.time_spent_minutes || 0);
      }
      const avgScore = uniqueLearners.size > 0
        ? Math.round(
            Object.values(learnerTimes).reduce((s, t) => s + Math.min(100, t / 60 * 20 + 30), 0)
            / uniqueLearners.size
          )
        : 0;

      return {
        activeLearners: uniqueLearners.size,
        avgTimeMinutes: avgTime,
        avgEngagementScore: avgScore,
      };
    },
    staleTime: 60000,
  });
}

// Fetch recent engagement events
function useRecentEvents(courseId?: string, limit = 50) {
  return useQuery({
    queryKey: ['pde', 'recent-events', courseId, limit],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase as any)
        .from('pde_engagement_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (courseId && courseId !== 'all') {
        query = query.eq('course_id', courseId);
      }
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data || []) as PDEEngagementEvent[];
    },
    staleTime: 30000,
  });
}

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  isLoading,
}: {
  title: string;
  value: string | number;
  description?: string;
  icon: React.ElementType;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-4" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-3 w-32 mt-1" />
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

function eventTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    lesson_view: 'Viewed Lesson',
    lesson_complete: 'Completed Lesson',
    exercise_start: 'Started Exercise',
    exercise_submit: 'Submitted Exercise',
    assessment_start: 'Started Assessment',
    assessment_submit: 'Submitted Assessment',
    discussion_post: 'Posted Discussion',
    discussion_reply: 'Replied to Discussion',
    peer_review_given: 'Gave Peer Review',
    peer_review_received: 'Received Peer Review',
    ai_prompt_used: 'Used AI Prompt',
    ai_output_modified: 'Modified AI Output',
    ai_output_accepted_blindly: 'Accepted AI Blindly',
    certificate_earned: 'Earned Certificate',
    video_play: 'Played Video',
    video_complete: 'Completed Video',
    resource_download: 'Downloaded Resource',
  };
  return labels[type] || type;
}

function eventTypeBadgeVariant(type: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (type.includes('complete') || type === 'certificate_earned') return 'default';
  if (type === 'ai_output_accepted_blindly') return 'destructive';
  if (type.includes('ai_')) return 'secondary';
  return 'outline';
}

export default function EngagementDashboardPage() {
  const [courseFilter, setCourseFilter] = useState<string>('all');
  const { data: courses, isLoading: coursesLoading } = useVACCourses();
  const { data: stats, isLoading: statsLoading } = useEngagementStats(courseFilter);
  const { data: events, isLoading: eventsLoading } = useRecentEvents(courseFilter);

  return (
    <ContentLayout title="Engagement Dashboard">
      <div className="space-y-6">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/vac">VAC</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Engagement</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header + Filter */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Engagement Dashboard</h1>
            <p className="text-muted-foreground">
              Track learner engagement, activity trends, and identify areas needing attention.
            </p>
          </div>
          <Select value={courseFilter} onValueChange={setCourseFilter}>
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Filter by course" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Courses</SelectItem>
              {(courses || []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.code} - {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard
            title="Active Learners"
            value={stats?.activeLearners ?? 0}
            description="Learners with tracked engagement"
            icon={Users}
            isLoading={statsLoading}
          />
          <StatCard
            title="Avg Time per Learner"
            value={`${stats?.avgTimeMinutes ?? 0} min`}
            description="Average total time spent"
            icon={Clock}
            isLoading={statsLoading}
          />
          <StatCard
            title="Avg Engagement Score"
            value={`${stats?.avgEngagementScore ?? 0}/100`}
            description="Composite engagement metric"
            icon={TrendingUp}
            isLoading={statsLoading}
          />
        </div>

        {/* Recent Events Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Recent Engagement Events
            </CardTitle>
            <CardDescription>Last 50 events{courseFilter !== 'all' ? ' (filtered)' : ''}</CardDescription>
          </CardHeader>
          <CardContent>
            {eventsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : events && events.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Learner ID</TableHead>
                    <TableHead>Course ID</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell>
                        <Badge variant={eventTypeBadgeVariant(event.event_type)}>
                          {eventTypeLabel(event.event_type)}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {event.learner_id.slice(0, 8)}...
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {event.course_id ? `${event.course_id.slice(0, 8)}...` : '-'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(event.created_at).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No engagement events recorded yet.</p>
                <p className="text-sm">Events will appear here as learners interact with courses.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
