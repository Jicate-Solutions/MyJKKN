'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Trophy,
  AlertCircle,
  ShieldCheck,
  Activity,
} from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth-provider';
import {
  useMySF100Enrollment,
  useSF100Enrollment,
  useSF100PaidUsers,
  useSF100PublicLeaderboard,
} from '@/hooks/startup-studio';
import { SF100PaidUserCounter } from './sf100-paid-user-counter';
import { SF100PhaseIndicator } from './sf100-phase-indicator';
import { SF100CheckInPrompt } from './sf100-checkin-prompt';
import { SF100ActivityTimeline } from './sf100-activity-timeline';
import { SF100DeadlineCountdown } from './sf100-deadline-countdown';
import { useSF100Programs } from '@/hooks/startup-studio';

interface InstitutionalSupport {
  on_duty: boolean;
  lab_access: boolean;
  scholarship: 'approved' | 'pending' | 'rejected' | null;
}

function SupportBadge({ granted, label }: { granted: boolean | null | undefined; label: string }) {
  if (granted == null) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
        granted
          ? 'bg-green-100 text-green-700'
          : 'bg-amber-100 text-amber-700'
      }`}
    >
      {granted ? '✓' : '⏳'} {label}
    </span>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-16 w-full rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
      <Skeleton className="h-16 w-full rounded-xl" />
      <Skeleton className="h-48 rounded-xl" />
    </div>
  );
}

export function SF100TeamDashboard() {
  useAuth(); // ensure authenticated

  // Step 0: Discover the active program (never hardcode 'current')
  const { data: programsRaw, isLoading: programsLoading } = useSF100Programs();
  const programs = Array.isArray(programsRaw) ? programsRaw : (programsRaw as any)?.data || [];
  const activeProgram = programs.find((p: any) => p.status === 'active') || programs[0];
  const activeProgramId: string | undefined = activeProgram?.id;

  // Step 1: Get the current user's enrollment in the active program
  const {
    data: myEnrollment,
    isLoading: enrollmentLoading,
    error: enrollmentError,
  } = useMySF100Enrollment(activeProgramId ?? '');

  const enrollmentId: string | undefined = (myEnrollment as any)?.id;

  // Step 2: Get full enrollment detail (includes phase, team info, support status)
  const { data: enrollment, isLoading: detailLoading } = useSF100Enrollment(
    enrollmentId ?? ''
  );

  // Step 3: Paid users count
  const { data: paidUsersData, isLoading: paidUsersLoading } = useSF100PaidUsers(
    enrollmentId ?? ''
  );
  const paidUsersList = Array.isArray(paidUsersData) ? paidUsersData : [];
  const cumulativePaidUsers: number = paidUsersList.length;
  const activePaidUsers: number = paidUsersList.filter(
    (u: any) => u.status !== 'churned'
  ).length;

  // Step 4: Leaderboard position
  const programId: string | undefined = (enrollment as any)?.program_id ?? (myEnrollment as any)?.program_id ?? activeProgramId;
  const { data: leaderboardRaw } = useSF100PublicLeaderboard(programId ?? '');
  const leaderboard = Array.isArray(leaderboardRaw) ? leaderboardRaw : (leaderboardRaw as any)?.data || [];
  const myLeaderboardEntry = leaderboard.find((e: any) => e.enrollment_id === enrollmentId) || null;
  const leaderboardRank: number | null = myLeaderboardEntry?.rank ?? null;
  const leaderboardPhaseLabel: string = myLeaderboardEntry?.phase_label ?? (enrollment as any)?.current_phase ?? '';

  const isLoading = programsLoading || enrollmentLoading || detailLoading || paidUsersLoading;

  // Not enrolled
  const notEnrolled =
    !enrollmentLoading &&
    !enrollmentError &&
    !enrollmentId;

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (enrollmentError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load your enrollment. Try refreshing the page.
        </AlertDescription>
      </Alert>
    );
  }

  if (notEnrolled) {
    return (
      <Card className="p-8 text-center">
        <div className="flex flex-col items-center gap-4">
          <Trophy className="h-12 w-12 text-amber-500" />
          <div>
            <h2 className="text-lg font-semibold">You are not enrolled in Solve for 100</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Contact your Startup Studio mentor to get your team enrolled.
            </p>
          </div>
          <Button asChild>
            <Link href="/startup-studio">Back to Startup Studio</Link>
          </Button>
        </div>
      </Card>
    );
  }

  const teamName: string = enrollment?.team_name ?? 'Your Team';
  const currentPhase: string = enrollment?.current_phase ?? 'setup';
  const currentPhaseLabel: string = enrollment?.phase_label ?? currentPhase.replace(/_/g, ' ');
  const programDeadline: string | undefined = enrollment?.program_deadline;
  const programStartDate: string | undefined = enrollment?.program_start_date;
  const programTotalDays: number = enrollment?.program_total_days ?? 210;
  const lastCheckInAt: string | null = enrollment?.last_check_in_at ?? null;

  const institutionalSupport: InstitutionalSupport = {
    on_duty: enrollment?.on_duty_approved ?? false,
    lab_access: enrollment?.lab_access_approved ?? false,
    scholarship: enrollment?.scholarship_status ?? null,
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <Card className="bg-gradient-to-r from-primary/5 via-background to-background border-primary/20">
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold tracking-tight">SOLVE FOR 100</h2>
                <Badge variant="outline" className="text-xs font-medium capitalize">
                  {currentPhaseLabel.replace(/_/g, ' ')}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Team:{' '}
                <span className="font-medium text-foreground">{teamName}</span>
              </p>
            </div>
            {programDeadline && (
              <SF100DeadlineCountdown
                deadline={programDeadline}
                startDate={programStartDate}
                totalDays={programTotalDays}
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Main content: paid user counter + phase indicator */}
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        {/* Paid user counter */}
        <Card>
          <CardContent className="pt-6 pb-4 flex flex-col items-center">
            <SF100PaidUserCounter
              cumulative={cumulativePaidUsers}
              active={activePaidUsers}
              target={100}
              enrollmentId={enrollmentId}
            />
          </CardContent>
        </Card>

        {/* Phase indicator */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Phase Progress
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <SF100PhaseIndicator currentPhase={currentPhase} />
          </CardContent>
        </Card>
      </div>

      {/* Weekly check-in prompt */}
      {enrollmentId && (
        <SF100CheckInPrompt
          lastCheckInAt={lastCheckInAt}
          enrollmentId={enrollmentId}
        />
      )}

      {/* Recent Activity */}
      {enrollmentId && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <SF100ActivityTimeline enrollmentId={enrollmentId} />
          </CardContent>
        </Card>
      )}

      {/* Institutional Support + Leaderboard — two column on desktop */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Institutional Support */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-blue-600" />
              Institutional Support
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-2">
              <SupportBadge granted={institutionalSupport.on_duty} label="On-duty" />
              <SupportBadge granted={institutionalSupport.lab_access} label="Lab access" />
              {institutionalSupport.scholarship != null && (
                <span
                  className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
                    institutionalSupport.scholarship === 'approved'
                      ? 'bg-green-100 text-green-700'
                      : institutionalSupport.scholarship === 'pending'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-red-100 text-red-700'
                  }`}
                >
                  {institutionalSupport.scholarship === 'approved'
                    ? '✓'
                    : institutionalSupport.scholarship === 'pending'
                      ? '⏳'
                      : '✗'}{' '}
                  Scholarship
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Leaderboard position */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" />
              Leaderboard
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {leaderboardRank != null ? (
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold tabular-nums">#{leaderboardRank}</span>
                <span className="text-sm text-muted-foreground">
                  in{' '}
                  <span className="font-medium text-foreground capitalize">
                    {leaderboardPhaseLabel.replace(/_/g, ' ')}
                  </span>{' '}
                  phase
                </span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Log your first paid user to appear on the leaderboard.
              </p>
            )}
            <Button variant="ghost" size="sm" className="mt-2 -ml-2 text-xs h-7" asChild>
              <Link href={`/startup-studio/solve-for-100/leaderboard`}>
                View full leaderboard
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
