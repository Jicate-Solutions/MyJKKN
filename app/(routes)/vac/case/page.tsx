'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { useCaseLearnerDashboard, useEnrollInTrack } from '@/hooks/case/use-case';
import { RiskBanner } from './_components/risk-banner';
import { ProgressOverview } from './_components/progress-overview';
import { TrackCard } from './_components/track-card';
import type { TrackDisplayStatus } from './_components/track-card';
import type { CaseTrack, CaseTrackEnrollment } from '@/types/case';
import { GraduationCap } from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derives the display status for a given track given the Learner's enrollments
 * and the full track list (for prerequisite resolution).
 */
function resolveTrackStatus(
  track: CaseTrack,
  enrollments: CaseTrackEnrollment[],
  allTracks: CaseTrack[]
): TrackDisplayStatus {
  const enrollment = enrollments.find((e) => e.track_id === track.id);

  if (enrollment?.status === 'completed') return 'completed';
  if (enrollment?.status === 'in_progress') return 'in_progress';

  // Check prerequisite
  if (track.prerequisite_track_id) {
    const prereq = allTracks.find((t) => t.id === track.prerequisite_track_id);
    if (prereq) {
      const prereqEnrollment = enrollments.find((e) => e.track_id === prereq.id);
      if (!prereqEnrollment || prereqEnrollment.status !== 'completed') {
        return 'locked';
      }
    }
  }

  return 'available';
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-14 w-full rounded-lg" />
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <Skeleton className="h-72 w-full rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CaseDashboardPage() {
  const { profile: user, isLoading: userLoading } = useAuth();
  const {
    data: dashboard,
    isLoading: dashboardLoading,
    isError,
    error,
  } = useCaseLearnerDashboard(user?.id ?? '');

  const { mutate: enrollInTrack, isPending: isEnrolling } = useEnrollInTrack();

  const isLoading = userLoading || dashboardLoading;

  // -------------------------------------------------------------------------
  // Derived data
  // -------------------------------------------------------------------------

  const progress = dashboard?.progress ?? null;
  const tracks: CaseTrack[] = dashboard?.tracks ?? [];
  const enrollments: CaseTrackEnrollment[] = dashboard?.enrollments ?? [];
  const risk = dashboard?.risk ?? null;
  const riskLevel = progress?.risk_level ?? 'on_track';

  // Separate AI and Human tracks, sorted by sequence_order
  const aiTracks = tracks
    .filter((t) => t.track_type === 'ai_mastery')
    .sort((a, b) => a.sequence_order - b.sequence_order);

  const humanTracks = tracks
    .filter((t) => t.track_type === 'human_excellence')
    .sort((a, b) => a.sequence_order - b.sequence_order);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  function handleEnroll(trackId: string) {
    if (!user?.id) return;
    enrollInTrack({ userId: user.id, trackId });
  }

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  function renderTrackGroup(groupTracks: CaseTrack[], label: string) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span
            className={
              label.startsWith('AI')
                ? 'inline-flex items-center rounded-md bg-violet-100 text-violet-700 border border-violet-200 px-2 py-0.5 text-xs font-semibold'
                : 'inline-flex items-center rounded-md bg-sky-100 text-sky-700 border border-sky-200 px-2 py-0.5 text-xs font-semibold'
            }
          >
            {label}
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {groupTracks.map((track) => {
            const enrollment = enrollments.find((e) => e.track_id === track.id) ?? null;
            const displayStatus = resolveTrackStatus(track, enrollments, tracks);
            const prerequisiteTrack = track.prerequisite_track_id
              ? (tracks.find((t) => t.id === track.prerequisite_track_id) ?? null)
              : null;

            return (
              <TrackCard
                key={track.id}
                track={track}
                enrollment={enrollment}
                prerequisiteTrack={prerequisiteTrack}
                displayStatus={displayStatus}
                onEnroll={handleEnroll}
                isEnrolling={isEnrolling}
              />
            );
          })}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // States
  // -------------------------------------------------------------------------

  if (isLoading) {
    return (
      <ContentLayout title="CASE Graduation Tracker">
        <DashboardSkeleton />
      </ContentLayout>
    );
  }

  if (isError) {
    return (
      <ContentLayout title="CASE Graduation Tracker">
        <Card>
          <CardContent className="py-12 text-center text-destructive">
            Failed to load CASE dashboard:{' '}
            {error instanceof Error ? error.message : 'Unknown error'}
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  if (!progress) {
    return (
      <ContentLayout title="CASE Graduation Tracker">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <GraduationCap className="mx-auto h-12 w-12 mb-4" />
            <p className="text-lg font-medium">No CASE record found</p>
            <p className="mt-2 text-sm">
              Your CASE profile has not been set up yet. Contact your coordinator.
            </p>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  // -------------------------------------------------------------------------
  // Main render
  // -------------------------------------------------------------------------

  return (
    <ContentLayout title="CASE Graduation Tracker">
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
              <BreadcrumbPage>CASE Tracker</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <GraduationCap className="h-8 w-8 text-[#0b6d41]" />
            CASE Graduation Tracker
          </h1>
          <p className="text-muted-foreground mt-1">
            Complete 6 tracks (180 hours) across AI Mastery and Human Excellence to graduate.
          </p>
        </div>

        {/* Risk Banner */}
        <RiskBanner riskLevel={riskLevel} risk={risk} />

        {/* Main layout: Progress overview + Track grid */}
        <div className="grid gap-6 lg:grid-cols-[260px_1fr] items-start">
          {/* Left: Progress Overview */}
          <ProgressOverview progress={progress} risk={risk} />

          {/* Right: Track cards grouped by type */}
          <div className="space-y-8">
            {aiTracks.length > 0 && renderTrackGroup(aiTracks, 'AI Mastery')}
            {humanTracks.length > 0 && renderTrackGroup(humanTracks, 'Human Excellence')}
          </div>
        </div>
      </div>
    </ContentLayout>
  );
}
