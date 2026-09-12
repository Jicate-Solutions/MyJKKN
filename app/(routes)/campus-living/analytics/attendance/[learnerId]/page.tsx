'use client';

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2, UserX } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useAttendanceLearnerDetail } from '@/hooks/campus-living/use-attendance-analytics';
import { periodToRange } from '../_components/scope-bar';
import { LearnerHeader, StreakCards } from './_components/learner-summary';
import { AttendanceHeatmap } from './_components/attendance-heatmap';
import { LearnerTrend } from './_components/learner-trend';
import { MarkLogTable } from './_components/mark-log-table';

/**
 * One learner's complete hostel attendance record.
 *
 * navMeta — reached by clicking a row on the attendance analytics dashboard,
 * not from a nav chip. Documents that for the nav-reachability gate, the same
 * escape hatch analytics/bed-economics/page.tsx uses.
 */
export const navMeta = {
  invokedFrom: '/campus-living/analytics/attendance',
} as const;

export default function LearnerAttendancePage({
  params,
}: {
  params: Promise<{ learnerId: string }>;
}) {
  const { learnerId } = use(params);
  const searchParams = useSearchParams();
  const { profile } = useAuth();
  const { isLoading: permsLoading } = usePermissions();
  const institutionId = profile?.institution_id ?? '';

  // Range comes in from the dashboard link so the drill-down opens on the same
  // window the reader was already looking at.
  const fallback = useMemo(() => periodToRange('30d'), []);
  const [from, setFrom] = useState(searchParams.get('from') || fallback.from);
  const [to, setTo] = useState(searchParams.get('to') || fallback.to);

  const { data, isLoading, error } = useAttendanceLearnerDetail(
    institutionId,
    learnerId,
    from,
    to,
  );

  const loading = isLoading || permsLoading;

  return (
    <ContentLayout title="Learner Attendance">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <Button variant="ghost" size="sm" asChild className="w-fit -ml-2">
            <Link href="/campus-living/analytics/attendance">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Attendance analytics
            </Link>
          </Button>
          <div className="flex gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
                className="w-[150px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
                className="w-[150px]"
              />
            </div>
          </div>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Could not load this learner&apos;s attendance</AlertTitle>
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        ) : permsLoading ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !loading && !data?.profile ? (
          // The RPC withholds identity when the caller may not see this
          // learner's attendance, so this covers both "no such learner" and
          // "outside your blocks" without telling the two apart.
          <Alert>
            <UserX className="h-4 w-4" />
            <AlertTitle>Learner not available</AlertTitle>
            <AlertDescription>
              No attendance record for this learner is visible to you. They may
              belong to a block outside your access.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <LearnerHeader
              profile={data?.profile ?? null}
              summary={data?.summary ?? {}}
              isLoading={loading}
            />

            <StreakCards summary={data?.summary ?? {}} isLoading={loading} />

            <AttendanceHeatmap
              days={data?.days ?? []}
              from={from}
              to={to}
              isLoading={loading}
            />

            <LearnerTrend days={data?.days ?? []} isLoading={loading} />

            <MarkLogTable marks={data?.marks ?? []} isLoading={loading} />
          </>
        )}
      </div>
    </ContentLayout>
  );
}
