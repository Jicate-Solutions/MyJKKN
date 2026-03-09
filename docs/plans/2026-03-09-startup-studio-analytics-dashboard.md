# Startup Studio Analytics Dashboard — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a super_admin-only analytics dashboard at `/startup-studio/events/[id]/dashboard` that shows the full event lifecycle analytics: team registrations, attendance, project submissions, demo-day evaluation, and audience voting.

**Architecture:** Client-side dashboard using React Query. A new thin `EventAnalyticsService` wraps existing service methods into dashboard-ready aggregations — no new SQL migrations needed. Five-tab layout (Overview · Attendance · Submissions · Evaluation · Voting) with KPI stat cards, Recharts bar/pie/radial charts, and TanStack data tables. Access is guarded by the existing `SuperAdminOnly` component.

**Tech Stack:** Next.js 15, React Query (@tanstack/react-query), Recharts 2.x, shadcn/ui components, Tailwind CSS, Supabase (read-only via existing RLS-scoped client)

---

## Pre-flight Checklist

Before starting, confirm:
- [ ] You can read `lib/services/startup-studio/event-analytics-service.ts` (will be created)
- [ ] Existing service file locations: `lib/services/startup-studio/event-service.ts`, `event-venue-service.ts`, `appathon-verification-service.ts`, `audience-vote-service.ts`, `event-checklist-service.ts`, `event-leaderboard-service.ts`, `event-registration-service.ts`
- [ ] Existing hook file: `hooks/startup-studio/use-events.ts` (to understand pattern)
- [ ] Layout components: `components/layout/content-layout.tsx`, `components/layout/page-breadcrumb.tsx`
- [ ] Auth guard: `components/auth/permission-guard.tsx` (exports `SuperAdminOnly`)
- [ ] Chart wrapper: `components/ui/chart.tsx`
- [ ] Sidebar: `lib/sidebarMenuLink.ts`

---

## Task 1: Event Analytics Service

**Files:**
- Create: `lib/services/startup-studio/event-analytics-service.ts`

**What it does:** Wraps multiple existing service calls and adds 3 new aggregation queries (tier distribution, verification status counts, voting totals) that don't exist in current services.

### Step 1: Create the service file

```typescript
// lib/services/startup-studio/event-analytics-service.ts
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { EventService } from './event-service';
import { EventVenueService } from './event-venue-service';
import { AppathonVerificationService } from './appathon-verification-service';
import { AudienceVoteService } from './audience-vote-service';
import { EventChecklistService } from './event-checklist-service';
import { EventLeaderboardService } from './event-leaderboard-service';

export interface DashboardKPIs {
  totalTeams: number;
  checkedInTeams: number;
  totalMembers: number;
  membersWithLaptops: number;
  institutionsCount: number;
  submissionsCount: number;
}

export interface TierDistribution {
  tier: number;
  label: string;
  count: number;
  color: string;
}

export interface AttendanceSummary {
  buildDay: { present: number; absent: number; late: number; unmarked: number; total: number };
  demoDay: { present: number; absent: number; late: number; unmarked: number; total: number };
  byVenue: Array<{
    venueName: string;
    dayType: string;
    present: number;
    absent: number;
    late: number;
  }>;
}

export interface VerificationSummary {
  pending: number;
  verified: number;
  flagged: number;
  disqualified: number;
  total: number;
}

export interface VotingOverview {
  isOpen: boolean;
  totalVotes: number;
  averageRating: number;
  topTeams: Array<{
    teamName: string;
    appName: string | null;
    totalVotes: number;
    averageRating: number;
  }>;
}

export interface SubmissionMetrics {
  teamsSubmitted: number;
  teamsWithLiveApp: number;
  teamsWithRevenue: number;
  tierDistribution: TierDistribution[];
  totalMrrClaimed: number;
  avgMrrClaimed: number;
}

export interface ChecklistProgress {
  phase: string;
  total: number;
  completed: number;
  percentage: number;
}

const TIER_LABELS = ['No Submission', 'Live App', '5+ Users', '10+ Users', 'Revenue', 'Strong Revenue'];
const TIER_COLORS = ['#94a3b8', '#3b82f6', '#22c55e', '#a855f7', '#f59e0b', '#ef4444'];

export class EventAnalyticsService {
  /**
   * Top-level KPIs — reuses getEventStats RPC
   */
  static async getKPIs(eventId: string): Promise<DashboardKPIs> {
    const stats = await EventService.getEventStats(eventId);
    const supabase = createClientSupabaseClient();

    const { count: submissionsCount } = await supabase
      .from('event_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .not('submitted_at', 'is', null);

    return {
      totalTeams: stats.total_teams ?? 0,
      checkedInTeams: stats.checked_in_teams ?? 0,
      totalMembers: stats.total_members ?? 0,
      membersWithLaptops: stats.members_with_laptops ?? 0,
      institutionsCount: stats.institutions ?? 0,
      submissionsCount: submissionsCount ?? 0,
    };
  }

  /**
   * Tier distribution (0-5) — new aggregation query
   */
  static async getSubmissionMetrics(eventId: string): Promise<SubmissionMetrics> {
    const supabase = createClientSupabaseClient();

    const { data: submissions } = await supabase
      .from('event_submissions')
      .select('tier_level, live_app_url, mrr_amount')
      .eq('event_id', eventId);

    if (!submissions || submissions.length === 0) {
      return {
        teamsSubmitted: 0,
        teamsWithLiveApp: 0,
        teamsWithRevenue: 0,
        tierDistribution: [0, 1, 2, 3, 4, 5].map((tier) => ({
          tier,
          label: TIER_LABELS[tier],
          count: 0,
          color: TIER_COLORS[tier],
        })),
        totalMrrClaimed: 0,
        avgMrrClaimed: 0,
      };
    }

    const tierCounts = [0, 1, 2, 3, 4, 5].map((tier) => ({
      tier,
      label: TIER_LABELS[tier],
      count: submissions.filter((s) => (s.tier_level ?? 0) === tier).length,
      color: TIER_COLORS[tier],
    }));

    const teamsSubmitted = submissions.length;
    const teamsWithLiveApp = submissions.filter((s) => s.live_app_url).length;
    const teamsWithRevenue = submissions.filter((s) => (s.mrr_amount ?? 0) > 0).length;
    const totalMrrClaimed = submissions.reduce((sum, s) => sum + (Number(s.mrr_amount) || 0), 0);
    const avgMrrClaimed = teamsWithRevenue > 0 ? totalMrrClaimed / teamsWithRevenue : 0;

    return {
      teamsSubmitted,
      teamsWithLiveApp,
      teamsWithRevenue,
      tierDistribution: tierCounts,
      totalMrrClaimed,
      avgMrrClaimed,
    };
  }

  /**
   * Attendance summary for build_day and demo_day — reuses getEventAttendanceMap
   */
  static async getAttendanceSummary(eventId: string): Promise<AttendanceSummary> {
    const [buildDayMap, demoDayMap] = await Promise.all([
      EventVenueService.getEventAttendanceMap(eventId, 'build_day'),
      EventVenueService.getEventAttendanceMap(eventId, 'demo_day'),
    ]);

    const sumMap = (
      map: Awaited<ReturnType<typeof EventVenueService.getEventAttendanceMap>>,
      dayType: string
    ) => {
      let present = 0, absent = 0, late = 0;
      const byVenue: AttendanceSummary['byVenue'] = [];

      for (const [venueName, counts] of Object.entries(map)) {
        present += counts.present ?? 0;
        absent += counts.absent ?? 0;
        late += counts.late ?? 0;
        byVenue.push({
          venueName,
          dayType,
          present: counts.present ?? 0,
          absent: counts.absent ?? 0,
          late: counts.late ?? 0,
        });
      }

      return { totals: { present, absent, late }, byVenue };
    };

    const buildResult = sumMap(buildDayMap, 'build_day');
    const demoResult = sumMap(demoDayMap, 'demo_day');

    // Get total teams to calculate unmarked
    const { data: totalTeams } = await createClientSupabaseClient()
      .from('event_registrations')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId);

    const total = typeof totalTeams === 'number' ? totalTeams : 0;

    const buildMarked = buildResult.totals.present + buildResult.totals.absent + buildResult.totals.late;
    const demoMarked = demoResult.totals.present + demoResult.totals.absent + demoResult.totals.late;

    return {
      buildDay: { ...buildResult.totals, unmarked: Math.max(0, total - buildMarked), total },
      demoDay: { ...demoResult.totals, unmarked: Math.max(0, total - demoMarked), total },
      byVenue: [...buildResult.byVenue, ...demoResult.byVenue],
    };
  }

  /**
   * Verification status breakdown — new aggregation query
   */
  static async getVerificationSummary(eventId: string): Promise<VerificationSummary> {
    const supabase = createClientSupabaseClient();

    const { data } = await supabase
      .from('appathon_verifications')
      .select('verification_status, event_submissions!inner(event_id)')
      .eq('event_submissions.event_id', eventId);

    const counts = { pending: 0, verified: 0, flagged: 0, disqualified: 0 };
    for (const row of data ?? []) {
      const status = row.verification_status as keyof typeof counts;
      if (status in counts) counts[status]++;
    }

    return { ...counts, total: (data ?? []).length };
  }

  /**
   * Voting overview — aggregates vote summaries
   */
  static async getVotingOverview(
    eventId: string,
    event: { voting_opened_at: string | null; voting_closed_at: string | null }
  ): Promise<VotingOverview> {
    const [summaries, registrations] = await Promise.all([
      AudienceVoteService.getVoteSummaries(eventId),
      // get team names via leaderboard
      EventLeaderboardService.getLeaderboard(eventId),
    ]);

    const isOpen = !!event.voting_opened_at && !event.voting_closed_at;
    const totalVotes = summaries.reduce((sum, s) => sum + (s.total_votes ?? 0), 0);
    const avgRating =
      summaries.length > 0
        ? summaries.reduce((sum, s) => sum + (s.average_rating ?? 0), 0) / summaries.length
        : 0;

    // Top 10 by average rating with min 1 vote
    const registrationMap = new Map(
      (registrations ?? []).map((r) => [r.id, r])
    );

    const topTeams = summaries
      .filter((s) => (s.total_votes ?? 0) > 0)
      .sort((a, b) => (b.average_rating ?? 0) - (a.average_rating ?? 0))
      .slice(0, 10)
      .map((s) => {
        const reg = registrationMap.get(s.submission_id);
        return {
          teamName: reg?.team_name ?? 'Unknown Team',
          appName: reg?.app_name ?? null,
          totalVotes: s.total_votes ?? 0,
          averageRating: s.average_rating ?? 0,
        };
      });

    return { isOpen, totalVotes, averageRating: Math.round(avgRating * 10) / 10, topTeams };
  }

  /**
   * Checklist phase progress
   */
  static async getChecklistProgress(eventId: string): Promise<ChecklistProgress[]> {
    const checklists = await EventChecklistService.getChecklists(eventId);

    const phaseMap = new Map<string, { total: number; completed: number }>();
    for (const cl of checklists ?? []) {
      for (const item of cl.items ?? []) {
        const key = cl.phase;
        const entry = phaseMap.get(key) ?? { total: 0, completed: 0 };
        entry.total++;
        if ((item.completions ?? []).length > 0) entry.completed++;
        phaseMap.set(key, entry);
      }
    }

    return Array.from(phaseMap.entries()).map(([phase, { total, completed }]) => ({
      phase,
      total,
      completed,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    }));
  }

  /**
   * Institution participation breakdown — reuses getLearnerParticipationStats
   */
  static async getInstitutionBreakdown(eventId: string) {
    return EventService.getLearnerParticipationStats(eventId, {});
  }
}
```

### Step 2: Verify the file exists and has no TypeScript errors (check manually — no run step needed for service)

---

## Task 2: React Query Hooks

**Files:**
- Create: `hooks/startup-studio/use-event-analytics.ts`

### Step 1: Create hooks file

```typescript
// hooks/startup-studio/use-event-analytics.ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { EventAnalyticsService } from '@/lib/services/startup-studio/event-analytics-service';
import { AppathonVerificationService } from '@/lib/services/startup-studio/appathon-verification-service';
import type { StartupEvent } from '@/types/startup-studio';

export function useEventDashboardKPIs(eventId: string) {
  const { isLoading: authLoading } = useAuth();
  return useQuery({
    queryKey: ['event-dashboard-kpis', eventId],
    queryFn: () => EventAnalyticsService.getKPIs(eventId),
    enabled: !authLoading && !!eventId,
    staleTime: 15_000,
  });
}

export function useEventSubmissionMetrics(eventId: string) {
  const { isLoading: authLoading } = useAuth();
  return useQuery({
    queryKey: ['event-submission-metrics', eventId],
    queryFn: () => EventAnalyticsService.getSubmissionMetrics(eventId),
    enabled: !authLoading && !!eventId,
    staleTime: 15_000,
  });
}

export function useEventAttendanceSummary(eventId: string) {
  const { isLoading: authLoading } = useAuth();
  return useQuery({
    queryKey: ['event-attendance-summary', eventId],
    queryFn: () => EventAnalyticsService.getAttendanceSummary(eventId),
    enabled: !authLoading && !!eventId,
    staleTime: 15_000,
  });
}

export function useEventVerificationSummary(eventId: string) {
  const { isLoading: authLoading } = useAuth();
  return useQuery({
    queryKey: ['event-verification-summary', eventId],
    queryFn: () => EventAnalyticsService.getVerificationSummary(eventId),
    enabled: !authLoading && !!eventId,
    staleTime: 15_000,
  });
}

export function useEventVotingOverview(eventId: string, event: StartupEvent | null | undefined) {
  const { isLoading: authLoading } = useAuth();
  return useQuery({
    queryKey: ['event-voting-overview', eventId],
    queryFn: () =>
      EventAnalyticsService.getVotingOverview(eventId, {
        voting_opened_at: event?.voting_opened_at ?? null,
        voting_closed_at: event?.voting_closed_at ?? null,
      }),
    enabled: !authLoading && !!eventId && !!event,
    staleTime: 10_000,
  });
}

export function useEventEvaluatorProgress(eventId: string) {
  const { isLoading: authLoading } = useAuth();
  return useQuery({
    queryKey: ['evaluator-progress', eventId],
    queryFn: () => AppathonVerificationService.getEvaluatorProgress(eventId),
    enabled: !authLoading && !!eventId,
    staleTime: 15_000,
  });
}

export function useEventChecklistProgress(eventId: string) {
  const { isLoading: authLoading } = useAuth();
  return useQuery({
    queryKey: ['event-checklist-progress', eventId],
    queryFn: () => EventAnalyticsService.getChecklistProgress(eventId),
    enabled: !authLoading && !!eventId,
    staleTime: 30_000,
  });
}

export function useEventInstitutionBreakdown(eventId: string) {
  const { isLoading: authLoading } = useAuth();
  return useQuery({
    queryKey: ['event-institution-breakdown', eventId],
    queryFn: () => EventAnalyticsService.getInstitutionBreakdown(eventId),
    enabled: !authLoading && !!eventId,
    staleTime: 30_000,
  });
}
```

---

## Task 3: KPI Cards Component

**Files:**
- Create: `app/(routes)/startup-studio/events/[id]/dashboard/_components/analytics-kpi-cards.tsx`

### Step 1: Create KPI cards

```typescript
// app/(routes)/startup-studio/events/[id]/dashboard/_components/analytics-kpi-cards.tsx
'use client';

import { Users, Laptop, Building2, FileCheck, UserCheck, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DashboardKPIs } from '@/lib/services/startup-studio/event-analytics-service';

interface KPICardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: React.ElementType;
  iconColor: string;
  bgColor: string;
}

function KPICard({ title, value, subtitle, icon: Icon, iconColor, bgColor }: KPICardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className={`p-2 rounded-lg ${bgColor}`}>
          <Icon className={`h-4 w-4 ${iconColor}`} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

interface Props {
  kpis: DashboardKPIs;
  totalTeams: number;
}

export function AnalyticsKPICards({ kpis, totalTeams }: Props) {
  const submissionRate =
    totalTeams > 0 ? Math.round((kpis.submissionsCount / totalTeams) * 100) : 0;
  const laptopRate =
    kpis.totalMembers > 0
      ? Math.round((kpis.membersWithLaptops / kpis.totalMembers) * 100)
      : 0;
  const checkInRate =
    totalTeams > 0 ? Math.round((kpis.checkedInTeams / totalTeams) * 100) : 0;

  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <KPICard
        title="Teams Registered"
        value={kpis.totalTeams}
        subtitle={`${kpis.checkedInTeams} checked in (${checkInRate}%)`}
        icon={Users}
        iconColor="text-blue-600 dark:text-blue-400"
        bgColor="bg-blue-100 dark:bg-blue-900/30"
      />
      <KPICard
        title="Total Participants"
        value={kpis.totalMembers}
        subtitle={`${kpis.membersWithLaptops} with laptops (${laptopRate}%)`}
        icon={UserCheck}
        iconColor="text-green-600 dark:text-green-400"
        bgColor="bg-green-100 dark:bg-green-900/30"
      />
      <KPICard
        title="Laptop Coverage"
        value={`${laptopRate}%`}
        subtitle={`${kpis.membersWithLaptops} of ${kpis.totalMembers} members`}
        icon={Laptop}
        iconColor="text-purple-600 dark:text-purple-400"
        bgColor="bg-purple-100 dark:bg-purple-900/30"
      />
      <KPICard
        title="Institutions"
        value={kpis.institutionsCount}
        subtitle="Colleges represented"
        icon={Building2}
        iconColor="text-orange-600 dark:text-orange-400"
        bgColor="bg-orange-100 dark:bg-orange-900/30"
      />
      <KPICard
        title="Submissions"
        value={kpis.submissionsCount}
        subtitle={`${submissionRate}% of teams submitted`}
        icon={FileCheck}
        iconColor="text-cyan-600 dark:text-cyan-400"
        bgColor="bg-cyan-100 dark:bg-cyan-900/30"
      />
      <KPICard
        title="Check-ins"
        value={kpis.checkedInTeams}
        subtitle={`${checkInRate}% check-in rate`}
        icon={TrendingUp}
        iconColor="text-pink-600 dark:text-pink-400"
        bgColor="bg-pink-100 dark:bg-pink-900/30"
      />
    </div>
  );
}
```

---

## Task 4: Overview Tab

**Files:**
- Create: `app/(routes)/startup-studio/events/[id]/dashboard/_components/overview-tab.tsx`

### Step 1: Create overview tab

```typescript
// app/(routes)/startup-studio/events/[id]/dashboard/_components/overview-tab.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { ChecklistProgress } from '@/lib/services/startup-studio/event-analytics-service';

const PHASE_LABELS: Record<string, string> = {
  pre_event: 'Pre Event',
  on_day: 'On Day',
  build_day: 'Build Day',
  demo_day: 'Demo Day',
  post_event: 'Post Event',
};

const PHASE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ef4444'];

interface Props {
  institutionBreakdown: { participated?: number; total?: number; institution_name?: string }[];
  checklistProgress: ChecklistProgress[];
  eventStatus: string;
  startDate: string | null;
  endDate: string | null;
  demoDate: string | null;
}

export function OverviewTab({
  institutionBreakdown,
  checklistProgress,
  eventStatus,
  startDate,
  endDate,
  demoDate,
}: Props) {
  const pieData = (institutionBreakdown ?? [])
    .filter((i) => (i.participated ?? 0) > 0)
    .map((i) => ({ name: i.institution_name ?? 'Unknown', value: i.participated ?? 0 }))
    .slice(0, 10);

  return (
    <div className="space-y-6">
      {/* Event Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Event Timeline</CardTitle>
          <CardDescription>Key dates and current status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Status:</span>
              <Badge variant="outline" className="capitalize">
                {eventStatus.replace(/_/g, ' ')}
              </Badge>
            </div>
            {startDate && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Start:</span>
                <span className="text-sm font-medium">
                  {new Date(startDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                </span>
              </div>
            )}
            {endDate && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">End:</span>
                <span className="text-sm font-medium">
                  {new Date(endDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                </span>
              </div>
            )}
            {demoDate && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Demo Day:</span>
                <span className="text-sm font-medium">
                  {new Date(demoDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Institution Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Teams by Institution</CardTitle>
            <CardDescription>Distribution of registered teams</CardDescription>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No participation data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={false}
                  >
                    {pieData.map((_, index) => (
                      <Cell key={index} fill={PHASE_COLORS[index % PHASE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Checklist Progress */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Checklist Progress</CardTitle>
            <CardDescription>Admin checklist completion by phase</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {checklistProgress.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No checklists created yet</p>
            ) : (
              checklistProgress.map((p, i) => (
                <div key={p.phase} className="space-y-1.5">
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-medium">{PHASE_LABELS[p.phase] ?? p.phase}</span>
                    <span className="text-muted-foreground">
                      {p.completed}/{p.total} ({p.percentage}%)
                    </span>
                  </div>
                  <Progress value={p.percentage} className="h-2" />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

---

## Task 5: Attendance Tab

**Files:**
- Create: `app/(routes)/startup-studio/events/[id]/dashboard/_components/attendance-tab.tsx`

### Step 1: Create attendance tab

```typescript
// app/(routes)/startup-studio/events/[id]/dashboard/_components/attendance-tab.tsx
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import type { AttendanceSummary } from '@/lib/services/startup-studio/event-analytics-service';

interface AttendanceStatCardProps {
  label: string;
  value: number;
  total: number;
  color: string;
}

function AttendanceStatCard({ label, value, total, color }: AttendanceStatCardProps) {
  const rate = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className={`rounded-lg border p-4 ${color}`}>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{rate}% of teams</p>
    </div>
  );
}

interface Props {
  summary: AttendanceSummary;
}

export function AttendanceTab({ summary }: Props) {
  const [activeDay, setActiveDay] = useState<'build_day' | 'demo_day'>('build_day');
  const data = activeDay === 'build_day' ? summary.buildDay : summary.demoDay;

  // Chart data from byVenue filtered by active day
  const venueData = summary.byVenue
    .filter((v) => v.dayType === activeDay)
    .map((v) => ({
      venue: v.venueName.length > 20 ? v.venueName.slice(0, 20) + '…' : v.venueName,
      Present: v.present,
      Absent: v.absent,
      Late: v.late,
    }));

  return (
    <div className="space-y-6">
      {/* Day Toggle */}
      <div className="flex gap-2">
        {(['build_day', 'demo_day'] as const).map((day) => (
          <button
            key={day}
            onClick={() => setActiveDay(day)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeDay === day
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {day === 'build_day' ? 'Build Day' : 'Demo Day'}
          </button>
        ))}
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <AttendanceStatCard
          label="Present"
          value={data.present}
          total={data.total}
          color="border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800"
        />
        <AttendanceStatCard
          label="Absent"
          value={data.absent}
          total={data.total}
          color="border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800"
        />
        <AttendanceStatCard
          label="Late"
          value={data.late}
          total={data.total}
          color="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-800"
        />
        <AttendanceStatCard
          label="Unmarked"
          value={data.unmarked}
          total={data.total}
          color="border-slate-200 bg-slate-50 dark:bg-slate-950/20 dark:border-slate-700"
        />
      </div>

      {/* Per-Venue Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Attendance by Venue</CardTitle>
          <CardDescription>
            {activeDay === 'build_day' ? 'Build Day' : 'Demo Day'} breakdown per venue
          </CardDescription>
        </CardHeader>
        <CardContent>
          {venueData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No attendance recorded yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={venueData} margin={{ top: 5, right: 20, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="venue" angle={-30} textAnchor="end" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="Present" fill="#22c55e" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Absent" fill="#ef4444" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Late" fill="#f59e0b" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## Task 6: Submissions Tab

**Files:**
- Create: `app/(routes)/startup-studio/events/[id]/dashboard/_components/submissions-tab.tsx`

### Step 1: Create submissions tab

```typescript
// app/(routes)/startup-studio/events/[id]/dashboard/_components/submissions-tab.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import type { SubmissionMetrics } from '@/lib/services/startup-studio/event-analytics-service';

const TIER_BADGE_COLORS: Record<number, string> = {
  0: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  1: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  2: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  3: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  4: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  5: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

interface Props {
  metrics: SubmissionMetrics;
  totalTeams: number;
}

export function SubmissionsTab({ metrics, totalTeams }: Props) {
  const noSubmissionCount = totalTeams - metrics.teamsSubmitted;
  const chartData = [
    { name: 'No Sub', count: noSubmissionCount, color: '#94a3b8', tier: 0 },
    ...metrics.tierDistribution.slice(1).map((t) => ({
      name: t.label,
      count: t.count,
      color: t.color,
      tier: t.tier,
    })),
  ];

  return (
    <div className="space-y-6">
      {/* Submission Metric Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Teams Submitted', value: metrics.teamsSubmitted, sub: `of ${totalTeams} total` },
          { label: 'Apps Live', value: metrics.teamsWithLiveApp, sub: 'with live_app_url' },
          { label: 'Generating Revenue', value: metrics.teamsWithRevenue, sub: 'MRR > ₹0' },
          {
            label: 'Total MRR Claimed',
            value: `₹${metrics.totalMrrClaimed.toLocaleString('en-IN')}`,
            sub: `avg ₹${Math.round(metrics.avgMrrClaimed).toLocaleString('en-IN')} per team`,
          },
        ].map((card) => (
          <Card key={card.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tier Distribution Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tier Distribution</CardTitle>
          <CardDescription>
            Teams by achieved tier level (0 = no submission → 5 = strong revenue)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} />
              <Tooltip
                formatter={(value, name) => [value, 'Teams']}
                labelFormatter={(label) => `Tier: ${label}`}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Tier Legend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tier Reference</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {metrics.tierDistribution.map((t) => (
              <div key={t.tier} className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${TIER_BADGE_COLORS[t.tier]}`}>
                  Tier {t.tier}: {t.label}
                </span>
                <span className="text-sm text-muted-foreground">({t.count} teams)</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## Task 7: Evaluation Tab

**Files:**
- Create: `app/(routes)/startup-studio/events/[id]/dashboard/_components/evaluation-tab.tsx`

### Step 1: Create evaluation tab

```typescript
// app/(routes)/startup-studio/events/[id]/dashboard/_components/evaluation-tab.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { RadialBarChart, RadialBar, Legend, ResponsiveContainer } from 'recharts';
import type { VerificationSummary } from '@/lib/services/startup-studio/event-analytics-service';

const STATUS_CONFIG = {
  verified: { label: 'Verified', color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300', fill: '#22c55e' },
  pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300', fill: '#f59e0b' },
  flagged: { label: 'Flagged', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300', fill: '#f97316' },
  disqualified: { label: 'Disqualified', color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300', fill: '#ef4444' },
};

interface EvaluatorRow {
  evaluator_name?: string;
  venue_name?: string;
  total_teams?: number;
  verified_count?: number;
  remaining?: number;
}

interface Props {
  verificationSummary: VerificationSummary;
  evaluatorProgress: EvaluatorRow[];
}

export function EvaluationTab({ verificationSummary, evaluatorProgress }: Props) {
  const radialData = Object.entries(STATUS_CONFIG).map(([key, cfg]) => ({
    name: cfg.label,
    value: verificationSummary[key as keyof VerificationSummary] as number,
    fill: cfg.fill,
  })).filter((d) => d.value > 0);

  const completionRate =
    verificationSummary.total > 0
      ? Math.round(((verificationSummary.verified + verificationSummary.disqualified) / verificationSummary.total) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {/* Verification Status Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {(Object.entries(STATUS_CONFIG) as [keyof VerificationSummary, typeof STATUS_CONFIG[keyof typeof STATUS_CONFIG]][]).map(([key, cfg]) => (
          <Card key={key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{cfg.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {verificationSummary[key as keyof VerificationSummary] as number}
              </div>
              <span className={`text-xs px-1.5 py-0.5 rounded mt-1 inline-block ${cfg.color}`}>
                {verificationSummary.total > 0
                  ? `${Math.round(((verificationSummary[key as keyof VerificationSummary] as number) / verificationSummary.total) * 100)}%`
                  : '0%'}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Overall completion */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Overall Evaluation Progress</CardTitle>
          <CardDescription>
            {verificationSummary.verified + verificationSummary.disqualified} of{' '}
            {verificationSummary.total} teams evaluated ({completionRate}%)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Progress value={completionRate} className="h-3" />
        </CardContent>
      </Card>

      {/* Evaluator Progress Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Evaluator Progress</CardTitle>
          <CardDescription>Teams evaluated per judge per venue</CardDescription>
        </CardHeader>
        <CardContent>
          {evaluatorProgress.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No evaluations started yet
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Evaluator</TableHead>
                  <TableHead>Venue</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Verified</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead>Progress</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {evaluatorProgress.map((row, i) => {
                  const pct =
                    (row.total_teams ?? 0) > 0
                      ? Math.round(((row.verified_count ?? 0) / (row.total_teams ?? 1)) * 100)
                      : 0;
                  return (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{row.evaluator_name ?? '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{row.venue_name ?? '—'}</TableCell>
                      <TableCell className="text-right">{row.total_teams ?? 0}</TableCell>
                      <TableCell className="text-right text-green-600">{row.verified_count ?? 0}</TableCell>
                      <TableCell className="text-right text-yellow-600">{row.remaining ?? 0}</TableCell>
                      <TableCell className="min-w-[120px]">
                        <div className="flex items-center gap-2">
                          <Progress value={pct} className="h-2 flex-1" />
                          <span className="text-xs text-muted-foreground w-8">{pct}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## Task 8: Voting Tab

**Files:**
- Create: `app/(routes)/startup-studio/events/[id]/dashboard/_components/voting-tab.tsx`

### Step 1: Create voting tab

```typescript
// app/(routes)/startup-studio/events/[id]/dashboard/_components/voting-tab.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Star, Vote, TrendingUp } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import type { VotingOverview } from '@/lib/services/startup-studio/event-analytics-service';

interface Props {
  overview: VotingOverview;
}

function StarDisplay({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`h-3 w-3 ${s <= Math.round(rating) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'}`}
        />
      ))}
      <span className="ml-1 text-sm text-muted-foreground">{rating.toFixed(1)}</span>
    </span>
  );
}

export function VotingTab({ overview }: Props) {
  return (
    <div className="space-y-6">
      {/* Voting Status Alert */}
      <Alert
        className={
          overview.isOpen
            ? 'border-green-500 bg-green-50 dark:bg-green-950/20'
            : 'border-muted'
        }
      >
        <AlertDescription className={overview.isOpen ? 'text-green-700 dark:text-green-400' : ''}>
          {overview.isOpen
            ? '🗳️ Voting is currently OPEN — votes are being collected live.'
            : 'Voting is closed or not yet started.'}
        </AlertDescription>
      </Alert>

      {/* Voting KPI Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Votes Cast</CardTitle>
            <Vote className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview.totalVotes}</div>
            <p className="text-xs text-muted-foreground mt-1">across all teams</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Average Rating</CardTitle>
            <Star className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview.averageRating.toFixed(1)} ★</div>
            <p className="text-xs text-muted-foreground mt-1">overall event average</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Top Rated Team</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold truncate">
              {overview.topTeams[0]?.teamName ?? '—'}
            </div>
            {overview.topTeams[0] && (
              <StarDisplay rating={overview.topTeams[0].averageRating} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Teams Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top Rated Teams</CardTitle>
          <CardDescription>Ranked by average audience rating (min 1 vote)</CardDescription>
        </CardHeader>
        <CardContent>
          {overview.topTeams.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No votes cast yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Rank</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>App</TableHead>
                  <TableHead className="text-right">Votes</TableHead>
                  <TableHead>Rating</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.topTeams.map((team, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <span
                        className={`font-bold ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-orange-600' : 'text-muted-foreground'}`}
                      >
                        #{i + 1}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium">{team.teamName}</TableCell>
                    <TableCell className="text-muted-foreground">{team.appName ?? '—'}</TableCell>
                    <TableCell className="text-right">{team.totalVotes}</TableCell>
                    <TableCell>
                      <StarDisplay rating={team.averageRating} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## Task 9: Dashboard Page

**Files:**
- Create: `app/(routes)/startup-studio/events/[id]/dashboard/page.tsx`

### Step 1: Create the dashboard page

```typescript
// app/(routes)/startup-studio/events/[id]/dashboard/page.tsx
'use client';

import { use } from 'react';
import { Loader2, BarChart3 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/layout/page-breadcrumb';
import { SuperAdminOnly } from '@/components/auth/permission-guard';
import { useAuth } from '@/hooks/use-auth';
import { useEvent } from '@/hooks/startup-studio/use-events';
import {
  useEventDashboardKPIs,
  useEventSubmissionMetrics,
  useEventAttendanceSummary,
  useEventVerificationSummary,
  useEventVotingOverview,
  useEventEvaluatorProgress,
  useEventChecklistProgress,
  useEventInstitutionBreakdown,
} from '@/hooks/startup-studio/use-event-analytics';
import { AnalyticsKPICards } from './_components/analytics-kpi-cards';
import { OverviewTab } from './_components/overview-tab';
import { AttendanceTab } from './_components/attendance-tab';
import { SubmissionsTab } from './_components/submissions-tab';
import { EvaluationTab } from './_components/evaluation-tab';
import { VotingTab } from './_components/voting-tab';

interface Props {
  params: Promise<{ id: string }>;
}

export default function EventAnalyticsDashboardPage({ params }: Props) {
  const { id: eventId } = use(params);

  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="Analytics Dashboard">
          <Alert variant="destructive" className="mt-8">
            <AlertDescription>
              This page is only accessible to super administrators.
            </AlertDescription>
          </Alert>
        </ContentLayout>
      }
    >
      <DashboardContent eventId={eventId} />
    </SuperAdminOnly>
  );
}

function DashboardContent({ eventId }: { eventId: string }) {
  const { profile } = useAuth();

  const { data: event, isLoading: eventLoading } = useEvent(eventId);
  const { data: kpis, isLoading: kpisLoading } = useEventDashboardKPIs(eventId);
  const { data: submissionMetrics, isLoading: subLoading } = useEventSubmissionMetrics(eventId);
  const { data: attendanceSummary, isLoading: attLoading } = useEventAttendanceSummary(eventId);
  const { data: verificationSummary, isLoading: verLoading } = useEventVerificationSummary(eventId);
  const { data: votingOverview, isLoading: voteLoading } = useEventVotingOverview(eventId, event);
  const { data: evaluatorProgress, isLoading: evalLoading } = useEventEvaluatorProgress(eventId);
  const { data: checklistProgress, isLoading: clLoading } = useEventChecklistProgress(eventId);
  const { data: institutionBreakdown, isLoading: instLoading } = useEventInstitutionBreakdown(eventId);

  const isLoading = eventLoading || kpisLoading;

  return (
    <ContentLayout title="Analytics Dashboard">
      <PageBreadcrumb
        items={[
          { label: 'Startup Studio', href: '/startup-studio/events' },
          { label: event?.name ?? 'Event', href: `/startup-studio/events/${eventId}` },
          { label: 'Analytics Dashboard' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Page Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{event?.name ?? 'Event'} — Analytics</h1>
              <p className="text-muted-foreground text-sm">
                Super admin analytics dashboard · All event data in one view
              </p>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && kpis && (
          <>
            {/* KPI Cards */}
            <AnalyticsKPICards kpis={kpis} totalTeams={kpis.totalTeams} />

            {/* Tabs */}
            <Tabs defaultValue="overview" className="space-y-4">
              <TabsList className="flex flex-wrap h-auto gap-1">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="attendance">Attendance</TabsTrigger>
                <TabsTrigger value="submissions">Submissions</TabsTrigger>
                <TabsTrigger value="evaluation">Evaluation</TabsTrigger>
                <TabsTrigger value="voting">Voting</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-4">
                {clLoading || instLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <OverviewTab
                    institutionBreakdown={institutionBreakdown ?? []}
                    checklistProgress={checklistProgress ?? []}
                    eventStatus={event?.status ?? 'draft'}
                    startDate={event?.start_date ?? null}
                    endDate={event?.end_date ?? null}
                    demoDate={event?.demo_date ?? null}
                  />
                )}
              </TabsContent>

              <TabsContent value="attendance" className="mt-4">
                {attLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : attendanceSummary ? (
                  <AttendanceTab summary={attendanceSummary} />
                ) : null}
              </TabsContent>

              <TabsContent value="submissions" className="mt-4">
                {subLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : submissionMetrics ? (
                  <SubmissionsTab metrics={submissionMetrics} totalTeams={kpis.totalTeams} />
                ) : null}
              </TabsContent>

              <TabsContent value="evaluation" className="mt-4">
                {verLoading || evalLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : verificationSummary ? (
                  <EvaluationTab
                    verificationSummary={verificationSummary}
                    evaluatorProgress={evaluatorProgress ?? []}
                  />
                ) : null}
              </TabsContent>

              <TabsContent value="voting" className="mt-4">
                {voteLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : votingOverview ? (
                  <VotingTab overview={votingOverview} />
                ) : null}
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </ContentLayout>
  );
}
```

---

## Task 10: Sidebar Link Update

**Files:**
- Modify: `lib/sidebarMenuLink.ts`

### Step 1: Read the current sidebarMenuLink.ts to find the exact startup-studio section

Read the file first, then find the `submenus` array under the Startup Studio section (look for `startup-studio/events/${activeId}/demo-day` or similar). Add a new submenu entry for the dashboard that is only visible to super_admin.

### Step 2: Add the Dashboard link

Find the existing submenu list in the startup-studio section. Locate the block where `demo-day`, `evaluate`, etc. are listed. Add a new entry **at the top of the submenus array** (before other entries so it appears first):

```typescript
// In lib/sidebarMenuLink.ts — inside the startup-studio submenus array
// ADD at the beginning of the submenus (when activeId exists):
{
  href: `/startup-studio/events/${activeId}/dashboard`,
  label: 'Analytics Dashboard',
  active: pathname.includes('/dashboard'),
  // Only visible to super_admin — add conditional rendering at usage point OR
  // include in all menus (the page itself guards via SuperAdminOnly)
},
```

**Note:** Because the sidebar is role-filtered and super_admin already has access to all admin menus, the simplest approach is to add the link for all roles but the page will show "access denied" for non-super-admins. Alternatively, check if the sidebar supports per-item role filtering. If it does, add `roles: ['super_admin']` or equivalent. Read the file to confirm the pattern before implementing.

---

## Task 11: Verification

### Step 1: Check for TypeScript errors

```bash
cd D:/Projects/MyJKKN && npx tsc --noEmit 2>&1 | grep -A2 "dashboard\|analytics"
```

Expected: No errors related to new files.

### Step 2: Verify route is accessible

Navigate to `/startup-studio/events/[any-event-id]/dashboard` in browser as super_admin. Confirm:
- [ ] Page loads without console errors
- [ ] KPI cards show numbers (even if 0)
- [ ] All 5 tabs render without crashing
- [ ] Non-super-admin sees access denied message

### Step 3: Check Recharts renders

In Overview tab, if there's participation data, a pie chart should be visible. In Attendance tab, if attendance has been marked, a bar chart appears. Zero-state messages should show when no data is available.

---

## File Summary

| File | Action | Purpose |
|------|--------|---------|
| `lib/services/startup-studio/event-analytics-service.ts` | **Create** | Aggregates analytics from existing services |
| `hooks/startup-studio/use-event-analytics.ts` | **Create** | React Query hooks for dashboard data |
| `app/(routes)/startup-studio/events/[id]/dashboard/page.tsx` | **Create** | Main dashboard page (super_admin guarded) |
| `app/(routes)/startup-studio/events/[id]/dashboard/_components/analytics-kpi-cards.tsx` | **Create** | 6 top-level KPI stat cards |
| `app/(routes)/startup-studio/events/[id]/dashboard/_components/overview-tab.tsx` | **Create** | Institution pie chart + checklist progress |
| `app/(routes)/startup-studio/events/[id]/dashboard/_components/attendance-tab.tsx` | **Create** | Build/Demo day attendance with bar chart |
| `app/(routes)/startup-studio/events/[id]/dashboard/_components/submissions-tab.tsx` | **Create** | Tier distribution bar chart + metrics |
| `app/(routes)/startup-studio/events/[id]/dashboard/_components/evaluation-tab.tsx` | **Create** | Evaluator progress table + verification counts |
| `app/(routes)/startup-studio/events/[id]/dashboard/_components/voting-tab.tsx` | **Create** | Voting status + top teams table |
| `lib/sidebarMenuLink.ts` | **Modify** | Add Analytics Dashboard submenu link |

**No database migrations required.** All data flows from existing tables/views via existing services.

---

## Key Decisions & Rationale

1. **No new SQL** — `evaluator_progress`, `appathon_leaderboard`, and `audience_vote_summary` views + existing service methods cover all analytics needs.

2. **Thin aggregation service** — `EventAnalyticsService` is a client-side aggregation layer, not a new Supabase service file. It calls existing services to avoid duplicating Supabase query logic.

3. **Tab-based layout** — Five tabs match the five event lifecycle phases (Overview → Attendance → Submissions → Evaluation → Voting). Users can focus on one area at a time.

4. **`SuperAdminOnly` guard** — Using the existing component rather than inline `if (isSuperAdmin)` to follow the pattern established in `components/auth/permission-guard.tsx`.

5. **Zero-state handling** — Every chart and table has an empty state message so the page is useful even for events with no data yet.

6. **Recharts only** — Consistent with `components/analytics/charts/` examples in the codebase. No new chart libraries introduced.
