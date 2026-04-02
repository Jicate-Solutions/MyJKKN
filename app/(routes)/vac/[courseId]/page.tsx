'use client';

import { use, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/hooks/use-auth';
import {
  useVACCourse,
  useVACLessons,
  useIsEnrolled,
  useVACProgress,
  useCourseCompletionPct,
  useEnrollInCourse,
} from '@/hooks/vac/use-vac';
import type { VACLesson, VACLearnerProgress } from '@/types/vac';
import {
  Clock,
  IndianRupee,
  GraduationCap,
  BookOpen,
  CheckCircle2,
  Lock,
  Play,
  ChevronRight,
  ArrowLeft,
  Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ── Track color mapping ────────────────────────────────────────────────────

const TRACK_COLORS: Record<string, string> = {
  'AI-1': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'AI-2': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  'AI-3': 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200',
  'AI-4': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  'H-1': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  'H-2': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  general: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
};

// ── Fink's Profile visualization ───────────────────────────────────────────

function FinksRadar({
  profile,
}: {
  profile: Record<string, number> | null;
}) {
  if (!profile) return null;

  const dims = [
    { key: 'foundational_knowledge', label: 'Foundational' },
    { key: 'application', label: 'Application' },
    { key: 'integration', label: 'Integration' },
    { key: 'human_dimension', label: 'Human Dim.' },
    { key: 'caring', label: 'Caring' },
    { key: 'learning_how_to_learn', label: 'Meta-Learn' },
  ];

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Fink&apos;s Taxonomy Profile
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {dims.map(({ key, label }) => {
          const val = (profile as Record<string, number>)[key] ?? 0;
          return (
            <div key={key} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium">{val}/5</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${(val / 5) * 100}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Enroll Button ──────────────────────────────────────────────────────────

function EnrollButton({
  courseId,
  userId,
  fee,
}: {
  courseId: string;
  userId: string;
  fee: number;
}) {
  const enrollMutation = useEnrollInCourse();

  const handleEnroll = () => {
    if (!userId) {
      toast.error('Please log in to enroll');
      return;
    }
    enrollMutation.mutate({ user_id: userId, course_id: courseId });
  };

  return (
    <Button
      size="lg"
      className="w-full"
      onClick={handleEnroll}
      disabled={enrollMutation.isPending}
    >
      {enrollMutation.isPending && (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      )}
      {fee > 0
        ? `Enroll - ${fee.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}`
        : 'Enroll for Free'}
    </Button>
  );
}

// ── Enrollment Gate overlay ────────────────────────────────────────────────

function EnrollmentGate({
  courseId,
  userId,
  fee,
}: {
  courseId: string;
  userId: string;
  fee: number;
}) {
  return (
    <div className="relative rounded-lg border border-dashed border-muted-foreground/30 p-8 text-center">
      <Lock className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
      <h3 className="text-lg font-semibold mb-1">Enroll to Continue</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Hour 1 is a free preview. Enroll to unlock all lessons.
      </p>
      <EnrollButton courseId={courseId} userId={userId} fee={fee} />
    </div>
  );
}

// ── Lesson status helper ───────────────────────────────────────────────────

function getLessonStatus(
  lesson: VACLesson,
  index: number,
  isEnrolled: boolean,
  progressMap: Map<string, VACLearnerProgress>
) {
  const progress = progressMap.get(lesson.id);
  if (progress?.status === 'completed' || progress?.status === 'tested_out') {
    return 'completed';
  }
  // Hour 1 (index 0) is always accessible
  if (index === 0) return 'accessible';
  if (!isEnrolled) return 'locked';
  // Check if previous lesson is completed
  return 'accessible';
}

function LessonStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    case 'locked':
      return <Lock className="h-5 w-5 text-muted-foreground" />;
    default:
      return <Play className="h-5 w-5 text-primary" />;
  }
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function CourseDetailPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = use(params);
  const router = useRouter();
  const { profile } = useAuth();
  const userId = profile?.id || '';

  const { data: course, isLoading: courseLoading } = useVACCourse(courseId);
  const { data: lessons, isLoading: lessonsLoading } = useVACLessons(courseId);
  const { data: isEnrolled } = useIsEnrolled(userId, courseId);
  const { data: progress } = useVACProgress(userId, courseId);
  const { data: completionPct } = useCourseCompletionPct(userId, courseId);

  // Build a quick lookup map for progress by lesson_id
  const progressMap = useMemo(() => {
    const m = new Map<string, VACLearnerProgress>();
    if (progress && Array.isArray(progress)) {
      progress.forEach((p) => m.set(p.lesson_id, p));
    }
    return m;
  }, [progress]);

  // Group lessons by week
  const lessonsByWeek = useMemo(() => {
    if (!lessons || !Array.isArray(lessons)) return new Map<number, VACLesson[]>();
    const map = new Map<number, VACLesson[]>();
    const sorted = [...lessons].sort((a, b) =>
      a.week !== b.week ? a.week - b.week : a.hour - b.hour
    );
    sorted.forEach((l) => {
      const existing = map.get(l.week) || [];
      existing.push(l);
      map.set(l.week, existing);
    });
    return map;
  }, [lessons]);

  const isLoading = courseLoading || lessonsLoading;

  if (isLoading) {
    return (
      <ContentLayout title="Loading...">
        <div className="space-y-4 mt-4">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-4 w-3/4" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
            <div className="lg:col-span-2 space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
            <Skeleton className="h-64" />
          </div>
        </div>
      </ContentLayout>
    );
  }

  if (!course) {
    return (
      <ContentLayout title="Not Found">
        <div className="flex flex-col items-center justify-center py-16">
          <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">Course not found</h3>
          <Button variant="outline" className="mt-4" onClick={() => router.push('/vac')}>
            Back to Catalog
          </Button>
        </div>
      </ContentLayout>
    );
  }

  // Flatten all lessons for indexing
  const allLessons = Array.from(lessonsByWeek.values()).flat();

  return (
    <ContentLayout title={course.name}>
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
            <BreadcrumbPage>{course.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-6 mt-4">
        {/* Back link */}
        <Button variant="ghost" size="sm" onClick={() => router.push('/vac')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Catalog
        </Button>

        {/* Course header */}
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold">{course.name}</h1>
              <Badge
                className={TRACK_COLORS[course.track] || TRACK_COLORS.general}
                variant="secondary"
              >
                {course.track}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground font-mono">{course.code}</p>
            {course.description && (
              <p className="text-muted-foreground">{course.description}</p>
            )}

            <div className="flex flex-wrap gap-4 text-sm">
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-muted-foreground" />
                {course.duration_hours} hours / {course.weeks} weeks
              </span>
              <span className="flex items-center gap-1.5">
                <IndianRupee className="h-4 w-4 text-muted-foreground" />
                {course.fee > 0
                  ? `${course.fee.toLocaleString('en-IN')}`
                  : 'Free'}
              </span>
              {course.nsqf_level && (
                <span className="flex items-center gap-1.5">
                  <GraduationCap className="h-4 w-4 text-muted-foreground" />
                  NSQF Level {course.nsqf_level}
                </span>
              )}
              {course.ncrf_credits && (
                <span className="text-muted-foreground">
                  NCrF: {course.ncrf_credits} credits
                </span>
              )}
            </div>

            {/* Progress bar for enrolled users */}
            {isEnrolled && typeof completionPct === 'number' && (
              <div className="space-y-1 max-w-md">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Your Progress</span>
                  <span className="font-medium">{Math.round(completionPct)}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${completionPct}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="w-full lg:w-80 space-y-4">
            {!isEnrolled && (
              <Card>
                <CardContent className="p-4 space-y-3">
                  <EnrollButton courseId={courseId} userId={userId} fee={course.fee} />
                  <p className="text-xs text-muted-foreground text-center">
                    Hour 1 is available as a free preview
                  </p>
                </CardContent>
              </Card>
            )}

            {isEnrolled && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="font-medium">Enrolled</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {course.overall_finks_profile && (
              <Card>
                <CardContent className="p-4">
                  <FinksRadar profile={course.overall_finks_profile} />
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        <Separator />

        {/* Lesson list */}
        <div className="space-y-6">
          <h2 className="text-lg font-semibold">Course Content</h2>

          {Array.from(lessonsByWeek.entries()).map(([week, weekLessons]) => (
            <div key={week} className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Week {week}
              </h3>
              <div className="space-y-1">
                {weekLessons.map((lesson) => {
                  const globalIndex = allLessons.findIndex((l) => l.id === lesson.id);
                  const status = getLessonStatus(lesson, globalIndex, !!isEnrolled, progressMap);
                  const isAccessible = status === 'completed' || status === 'accessible';

                  return (
                    <Link
                      key={lesson.id}
                      href={isAccessible ? `/vac/${courseId}/${lesson.id}` : '#'}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                        isAccessible
                          ? 'hover:bg-muted/50 cursor-pointer'
                          : 'opacity-60 cursor-not-allowed'
                      }`}
                      onClick={(e) => {
                        if (!isAccessible) e.preventDefault();
                      }}
                    >
                      <LessonStatusIcon status={status} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          Hour {lesson.hour}: {lesson.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {lesson.duration_minutes} min
                          {lesson.ltl_phase && ` | ${lesson.ltl_phase.toUpperCase()}`}
                        </p>
                      </div>
                      {isAccessible && (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Show enrollment gate after lesson list if not enrolled */}
          {!isEnrolled && allLessons.length > 1 && (
            <EnrollmentGate courseId={courseId} userId={userId} fee={course.fee} />
          )}
        </div>
      </div>
    </ContentLayout>
  );
}
