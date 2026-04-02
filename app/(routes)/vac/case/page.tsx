'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import {
  useCASETracks,
  useMyTrackEnrollments,
  useCASELearnerProgress,
} from '@/hooks/vac/use-case';
import type {
  CASETrack,
  CASETrackEnrollment,
  CASETrackEnrollmentWithTrack,
  CASELearnerProgress,
  CASERiskLevel,
} from '@/types/case';
import {
  Target,
  Brain,
  Users,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Clock,
  ChevronRight,
  ShieldCheck,
  Zap,
  Shield,
} from 'lucide-react';

// ── Risk colors & labels ───────────────────────────────────────────────────

const RISK_CONFIG: Record<string, { color: string; bg: string; icon: typeof AlertTriangle; label: string }> = {
  on_track: {
    color: 'text-green-700 dark:text-green-300',
    bg: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800',
    icon: CheckCircle2,
    label: 'On Track',
  },
  at_risk: {
    color: 'text-amber-700 dark:text-amber-300',
    bg: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800',
    icon: AlertTriangle,
    label: 'At Risk',
  },
  critical: {
    color: 'text-red-700 dark:text-red-300',
    bg: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800',
    icon: AlertCircle,
    label: 'Critical',
  },
  overdue: {
    color: 'text-red-700 dark:text-red-300',
    bg: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800',
    icon: Clock,
    label: 'Overdue',
  },
  completed: {
    color: 'text-blue-700 dark:text-blue-300',
    bg: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800',
    icon: ShieldCheck,
    label: 'Completed',
  },
};

// ── Track type icons ───────────────────────────────────────────────────────

const TRACK_TYPE_CONFIG: Record<string, { icon: typeof Brain; color: string }> = {
  ai_mastery: { icon: Brain, color: 'text-violet-500' },
  human_excellence: { icon: Users, color: 'text-amber-500' },
};

// ── Progress Ring ──────────────────────────────────────────────────────────

function ProgressRing({
  completed,
  total,
  size = 120,
}: {
  completed: number;
  total: number;
  size?: number;
}) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className="stroke-muted"
          strokeWidth="8"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className="stroke-primary"
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold">{completed}/{total}</span>
        <span className="text-xs text-muted-foreground">tracks</span>
      </div>
    </div>
  );
}

// ── Risk Banner ────────────────────────────────────────────────────────────

function RiskBanner({ riskLevel }: { riskLevel: CASERiskLevel }) {
  const config = RISK_CONFIG[riskLevel] || RISK_CONFIG.on_track;
  const Icon = config.icon;

  if (riskLevel === 'on_track' || riskLevel === 'completed') return null;

  return (
    <div className={`flex items-center gap-3 p-4 rounded-lg border ${config.bg}`}>
      <Icon className={`h-5 w-5 ${config.color} shrink-0`} />
      <div>
        <p className={`font-semibold text-sm ${config.color}`}>
          Status: {config.label}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {riskLevel === 'at_risk'
            ? 'You may need to accelerate your progress to graduate on time.'
            : riskLevel === 'critical'
              ? 'Immediate action required. Contact your coordinator for support.'
              : 'Your CASE tracks are overdue. Please contact administration.'}
        </p>
      </div>
    </div>
  );
}

// ── Track Card ─────────────────────────────────────────────────────────────

function TrackCard({
  track,
  enrollment,
  userId,
}: {
  track: CASETrack;
  enrollment?: CASETrackEnrollmentWithTrack;
  userId: string;
}) {
  const typeConfig = TRACK_TYPE_CONFIG[track.track_type] || TRACK_TYPE_CONFIG.ai_mastery;
  const TypeIcon = typeConfig.icon;

  const status = enrollment?.status;
  const isCompleted = status === 'completed';
  const isEnrolled = !!enrollment;
  const attendancePct = enrollment?.attendance_percentage ?? 0;
  const graderAvg = enrollment?.grader_score_average ?? 0;

  return (
    <Card className={`transition-shadow hover:shadow-md ${isCompleted ? 'border-green-200 dark:border-green-800' : ''}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <TypeIcon className={`h-5 w-5 ${typeConfig.color}`} />
            <CardTitle className="text-base">{track.track_name}</CardTitle>
          </div>
          <Badge variant="outline" className="text-xs">
            {track.track_code}
          </Badge>
        </div>
        {track.description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {track.description}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Duration */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          {track.duration_hours} hours
        </div>

        {/* Enrollment status */}
        {isEnrolled ? (
          <div className="space-y-2">
            <Badge
              variant="secondary"
              className={
                isCompleted
                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                  : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
              }
            >
              {status === 'completed'
                ? 'Completed'
                : status === 'in_progress'
                  ? 'In Progress'
                  : status?.replace('_', ' ')}
            </Badge>

            {/* Completion gates */}
            <div className="space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Attendance</span>
                <span className={attendancePct >= track.completion_attendance_threshold ? 'text-green-600 font-medium' : ''}>
                  {attendancePct}% / {track.completion_attendance_threshold}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Grader Score</span>
                <span className={graderAvg >= track.completion_grader_threshold ? 'text-green-600 font-medium' : ''}>
                  {graderAvg}% / {track.completion_grader_threshold}%
                </span>
              </div>
              {track.completion_project_required && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Project</span>
                  <span className={enrollment?.project_submitted ? 'text-green-600 font-medium' : ''}>
                    {enrollment?.project_submitted ? 'Submitted' : 'Pending'}
                  </span>
                </div>
              )}
            </div>

            {/* Placement info */}
            {enrollment?.placement_score !== null && enrollment?.placement_score !== undefined && (
              <div className="text-xs text-muted-foreground">
                Placement: {enrollment.placement_score}% (start week {enrollment.placement_start_week})
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Not yet enrolled</p>
            <Button size="sm" variant="outline" asChild>
              <Link href={`/vac/case/placement/${track.id}`}>
                Take Placement Test
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function CASEGraduationTrackerPage() {
  const { profile } = useAuth();
  const userId = profile?.id || '';

  const { data: tracks, isLoading: tracksLoading } = useCASETracks();
  const { data: enrollments, isLoading: enrollmentsLoading } = useMyTrackEnrollments(userId);
  const { data: learnerProgress, isLoading: progressLoading } = useCASELearnerProgress(userId);

  // Build enrollment lookup by track_id
  const enrollmentMap = useMemo(() => {
    const m = new Map<string, CASETrackEnrollmentWithTrack>();
    if (enrollments && Array.isArray(enrollments)) {
      (enrollments as CASETrackEnrollmentWithTrack[]).forEach((e) => {
        m.set(e.track_id, e);
      });
    }
    return m;
  }, [enrollments]);

  // Separate tracks by type
  const { aiTracks, humanTracks } = useMemo(() => {
    if (!tracks || !Array.isArray(tracks)) return { aiTracks: [], humanTracks: [] };
    const ai: CASETrack[] = [];
    const human: CASETrack[] = [];
    (tracks as CASETrack[]).forEach((t) => {
      if (t.track_type === 'ai_mastery') ai.push(t);
      else human.push(t);
    });
    ai.sort((a, b) => a.sequence_order - b.sequence_order);
    human.sort((a, b) => a.sequence_order - b.sequence_order);
    return { aiTracks: ai, humanTracks: human };
  }, [tracks]);

  const progress = learnerProgress as CASELearnerProgress | null | undefined;
  const tracksCompleted = progress?.tracks_completed ?? 0;
  const riskLevel = progress?.risk_level ?? 'on_track';
  const isLoading = tracksLoading || enrollmentsLoading || progressLoading;

  return (
    <ContentLayout title="CASE Graduation Tracker">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
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

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">CASE Graduation Tracker</h1>
            <p className="text-sm text-muted-foreground">
              Complete all 6 tracks to achieve Senior Learner status
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/vac/progress">View Progress</Link>
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-48" />
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Progress Overview */}
            <Card>
              <CardContent className="p-6">
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <ProgressRing completed={tracksCompleted} total={6} />
                  <div className="flex-1 space-y-3 text-center sm:text-left">
                    <h2 className="text-lg font-semibold">
                      {tracksCompleted === 6
                        ? 'Graduation Requirements Met!'
                        : `${6 - tracksCompleted} tracks remaining`}
                    </h2>
                    {progress && (
                      <div className="flex flex-wrap gap-4 justify-center sm:justify-start text-sm">
                        <div>
                          <span className="text-muted-foreground">Hours Completed: </span>
                          <span className="font-medium">{progress.total_hours_completed}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Current Semester: </span>
                          <span className="font-medium">{progress.current_semester}</span>
                        </div>
                        {progress.agency_index > 0 && (
                          <div>
                            <span className="text-muted-foreground">Agency Index: </span>
                            <span className="font-medium">{progress.agency_index}</span>
                          </div>
                        )}
                      </div>
                    )}
                    <Badge
                      variant="secondary"
                      className={RISK_CONFIG[riskLevel]?.bg || ''}
                    >
                      {RISK_CONFIG[riskLevel]?.label || riskLevel}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Risk Banner */}
            <RiskBanner riskLevel={riskLevel as CASERiskLevel} />

            {/* Track grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* AI Tracks (left column) */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-violet-500" />
                  <h2 className="text-lg font-semibold">AI Mastery Tracks</h2>
                  <Badge variant="outline">{aiTracks.length}</Badge>
                </div>
                {aiTracks.map((track) => (
                  <TrackCard
                    key={track.id}
                    track={track}
                    enrollment={enrollmentMap.get(track.id)}
                    userId={userId}
                  />
                ))}
              </div>

              {/* Human Excellence Tracks (right column) */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-amber-500" />
                  <h2 className="text-lg font-semibold">Human Excellence Tracks</h2>
                  <Badge variant="outline">{humanTracks.length}</Badge>
                </div>
                {humanTracks.map((track) => (
                  <TrackCard
                    key={track.id}
                    track={track}
                    enrollment={enrollmentMap.get(track.id)}
                    userId={userId}
                  />
                ))}
              </div>
            </div>

            {/* Semester mapping note */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Zap className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Semester Mapping</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      CASE tracks are distributed across your programme semesters. Complete at least one
                      track per semester to stay on track for graduation. The system monitors your pace
                      and alerts you if you fall behind.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </ContentLayout>
  );
}
