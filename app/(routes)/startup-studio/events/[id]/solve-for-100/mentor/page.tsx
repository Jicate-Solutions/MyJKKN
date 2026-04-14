'use client';

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  ClipboardCheck,
  Loader2,
  Users,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import { useAuth } from '@/hooks/use-auth';
import { useEvent } from '@/hooks/startup-studio/use-events';
import {
  useUnreviewedCheckins,
  useWeeklyOverview,
  useMentorReview,
} from '@/hooks/startup-studio/use-solve100-weekly';
import type {
  Solve100WeeklyCheckin,
  Solve100TeamRow,
} from '@/types/startup-studio';

import { AlertsPanel, type AlertFilter } from './_components/alerts-panel';
import { TeamReviewCard } from './_components/team-review-card';
import { ReviewDialog } from './_components/review-dialog';

// Guards against Next.js DRP placeholder tokens (%%drp:...) in route params
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (id: string | undefined | null): boolean =>
  !!id && !id.includes('%%drp:') && UUID_REGEX.test(id);

/**
 * Compute the current Solve for 100 week number based on event start date.
 * Falls back to week 1 if data is missing. Week is 1-indexed.
 */
function computeCurrentWeek(eventStart?: string | null): number {
  if (!eventStart) return 1;
  try {
    const start = new Date(eventStart);
    const now = new Date();
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const diff = Math.floor((now.getTime() - start.getTime()) / msPerWeek);
    return Math.max(1, Math.min(44, diff + 1));
  } catch {
    return 1;
  }
}

export default function MentorReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  if (!isValidUUID(id)) {
    return (
      <ContentLayout title="Mentor Review">
        <div className="flex justify-center items-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ContentLayout>
    );
  }

  const { profile, isLoading: authLoading } = useAuth();
  const isSuperAdmin =
    profile?.role === 'super_admin' ||
    profile?.role === 'admin' ||
    profile?.role === 'administrator' ||
    (profile as any)?.is_super_admin;
  const isMentor =
    isSuperAdmin ||
    profile?.role === 'staff' ||
    profile?.role === 'faculty' ||
    (profile as any)?.is_mentor;

  const { data: event, isLoading: eventLoading } = useEvent(id);

  const currentWeek = useMemo(
    () => computeCurrentWeek((event as any)?.start_date),
    [event],
  );

  // Weekly overview gives current-week check-ins for every assigned team
  const { data: weeklyRows = [], isLoading: rowsLoading } = useWeeklyOverview(
    id,
    currentWeek,
  );

  // Unreviewed list (badge counts, quick access)
  const { data: unreviewed = [] } = useUnreviewedCheckins(
    id,
    isSuperAdmin ? undefined : profile?.id,
  );

  const { mutateAsync: submitReview, isPending: isSubmitting } =
    useMentorReview();

  // UI state
  const [alertFilter, setAlertFilter] = useState<AlertFilter>('all');
  const [reviewing, setReviewing] = useState<Solve100TeamRow | null>(null);

  // Filter team rows by mentor assignment (super_admin sees all)
  const myTeams = useMemo<Solve100TeamRow[]>(() => {
    if (!Array.isArray(weeklyRows)) return [];
    if (isSuperAdmin) return weeklyRows as Solve100TeamRow[];
    return (weeklyRows as Solve100TeamRow[]).filter(
      (row) => row.assigned_mentor_id === profile?.id,
    );
  }, [weeklyRows, isSuperAdmin, profile?.id]);

  // Compute alert categories
  const alertBuckets = useMemo(() => {
    const noProgress = myTeams.filter((t) => {
      const current = t.current_checkin?.verified_paid_users ?? 0;
      const previous = t.previous_checkin?.verified_paid_users ?? 0;
      // No change for 2+ weeks (assumption: no current checkin or same count)
      return !t.current_checkin || current === previous;
    });

    const unresolvedBlockers = myTeams.filter(
      (t) =>
        !!t.current_checkin?.biggest_blocker &&
        !t.current_checkin?.blocker_resolved,
    );

    const missedCommitments = myTeams.filter(
      (t) => t.previous_checkin?.commitment_met === false,
    );

    return {
      noProgress,
      unresolvedBlockers,
      missedCommitments,
    };
  }, [myTeams]);

  const filteredTeams = useMemo<Solve100TeamRow[]>(() => {
    switch (alertFilter) {
      case 'no-progress':
        return alertBuckets.noProgress;
      case 'unresolved-blockers':
        return alertBuckets.unresolvedBlockers;
      case 'missed-commitments':
        return alertBuckets.missedCommitments;
      case 'all':
      default:
        return myTeams;
    }
  }, [alertFilter, alertBuckets, myTeams]);

  const isLoading = authLoading || eventLoading || rowsLoading;

  if (eventLoading) {
    return (
      <ContentLayout title="Mentor Review">
        <div className="flex justify-center items-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ContentLayout>
    );
  }
  if (!event) return notFound();

  if (!isMentor && !isSuperAdmin) {
    return (
      <ContentLayout title="Mentor Review">
        <div className="max-w-xl mx-auto mt-10">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              You do not have permission to view the mentor review dashboard.
              This page is for mentors and event admins only.
            </AlertDescription>
          </Alert>
        </div>
      </ContentLayout>
    );
  }

  const unreviewedCount =
    Array.isArray(unreviewed) ? unreviewed.length : 0;

  return (
    <ContentLayout title="Mentor Review">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio/events' },
          {
            label: event.name || 'Event',
            href: `/startup-studio/events/${id}`,
          },
          {
            label: 'Solve for 100',
            href: `/startup-studio/events/${id}/solve-for-100`,
          },
          { label: 'Mentor Review' },
        ]}
      />

      <div className="space-y-6 mt-4 pb-10">
        {/* Back + Header */}
        <div className="flex items-center gap-3">
          <Link href={`/startup-studio/events/${id}/solve-for-100`}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-primary shrink-0" />
              Mentor Review
              {isSuperAdmin && (
                <Badge
                  variant="outline"
                  className="text-[10px] font-normal uppercase tracking-wide"
                >
                  Admin View
                </Badge>
              )}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Week {currentWeek} &middot; {myTeams.length} team
              {myTeams.length === 1 ? '' : 's'}{' '}
              {isSuperAdmin ? 'in this event' : 'assigned to you'}
              {unreviewedCount > 0 && (
                <>
                  {' '}
                  &middot;{' '}
                  <span className="text-amber-600 font-medium">
                    {unreviewedCount} awaiting review
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Stats row */}
        {!isLoading && myTeams.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              icon={<Users className="h-4 w-4" />}
              label="Total Teams"
              value={myTeams.length}
            />
            <StatCard
              icon={<CheckCircle2 className="h-4 w-4" />}
              label="Reviewed"
              value={
                myTeams.filter((t) => t.current_checkin?.mentor_reviewed)
                  .length
              }
              color="text-green-600"
            />
            <StatCard
              icon={<AlertTriangle className="h-4 w-4" />}
              label="Blocked"
              value={alertBuckets.unresolvedBlockers.length}
              color="text-red-600"
            />
            <StatCard
              icon={<Loader2 className="h-4 w-4" />}
              label="Missed Commitment"
              value={alertBuckets.missedCommitments.length}
              color="text-amber-600"
            />
          </div>
        )}

        {/* Alerts Panel */}
        {!isLoading && myTeams.length > 0 && (
          <AlertsPanel
            noProgressCount={alertBuckets.noProgress.length}
            unresolvedBlockerCount={alertBuckets.unresolvedBlockers.length}
            missedCommitmentCount={alertBuckets.missedCommitments.length}
            activeFilter={alertFilter}
            onFilterChange={setAlertFilter}
          />
        )}

        {/* Loading / Empty / Grid */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : myTeams.length === 0 ? (
          <Card>
            <CardContent className="pt-8 pb-8 text-center space-y-3">
              <ClipboardCheck className="h-12 w-12 mx-auto text-muted-foreground/40" />
              <div>
                <p className="text-sm font-medium">
                  No teams assigned to you yet
                </p>
                <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                  Once an event admin assigns teams to you as their mentor,
                  their weekly check-ins will appear here for review.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : filteredTeams.length === 0 ? (
          <Card>
            <CardContent className="pt-6 pb-6 text-center">
              <p className="text-sm text-muted-foreground">
                No teams match this filter. Try switching back to{' '}
                <button
                  onClick={() => setAlertFilter('all')}
                  className="underline font-medium text-primary"
                >
                  All Teams
                </button>
                .
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredTeams.map((team) => (
              <TeamReviewCard
                key={team.team_id}
                team={team}
                currentWeek={currentWeek}
                onReview={() => setReviewing(team)}
              />
            ))}
          </div>
        )}

        {/* Review Dialog */}
        <ReviewDialog
          team={reviewing}
          currentWeek={currentWeek}
          eventId={id}
          open={!!reviewing}
          onOpenChange={(open) => {
            if (!open) setReviewing(null);
          }}
          onSubmit={async (checkinId, notes) => {
            await submitReview({
              checkin_id: checkinId,
              notes,
              mentor_id: profile!.id,
            });
            setReviewing(null);
          }}
          isSubmitting={isSubmitting}
        />
      </div>
    </ContentLayout>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          {icon}
          <span className="text-xs font-medium truncate">{label}</span>
        </div>
        <p className={cn('text-2xl font-bold', color)}>{value}</p>
      </CardContent>
    </Card>
  );
}
