'use client';

import { use, useMemo } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  useVACCourseWithEnrollment,
  useVACProgress,
  useCourseProgress
} from '@/hooks/vac/use-vac';
import { useAuth } from '@/hooks/use-auth';
import { EnrollButton } from '../_components/enroll-button';
import type { VACLesson } from '@/types/vac';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle,
  CheckCircle2,
  Circle,
  Clock,
  CreditCard,
  Lock,
  Play,
  Trophy
} from 'lucide-react';

export default function CourseDetailPage({
  params
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = use(params);
  const { user } = useAuth();

  const {
    course,
    lessons,
    stats,
    isEnrolled,
    enrollment,
    progress: courseProgress,
    isLoading,
    isError,
    error,
    refetch
  } = useVACCourseWithEnrollment(courseId, user?.id);

  // Progress tracking for lessons
  const { data: progressData } = useVACProgress(user?.id, courseId);

  // Create a map of lesson progress for quick lookup
  const progressMap = useMemo(() => {
    return new Map((progressData || []).map(p => [p.lesson_id, p]));
  }, [progressData]);

  // Group lessons by week
  const lessonsByWeek = useMemo(() => {
    const grouped: Record<number, VACLesson[]> = {};
    lessons.forEach((lesson) => {
      if (!grouped[lesson.week]) {
        grouped[lesson.week] = [];
      }
      grouped[lesson.week].push(lesson);
    });
    // Sort lessons within each week by hour
    Object.keys(grouped).forEach((week) => {
      grouped[Number(week)].sort((a, b) => a.hour - b.hour);
    });
    return grouped;
  }, [lessons]);

  const weeks = Object.keys(lessonsByWeek).map(Number).sort((a, b) => a - b);

  // Get status icon for a lesson
  const getLessonStatusIcon = (lessonId: string) => {
    const progress = progressMap.get(lessonId);
    if (!progress || progress.status === 'not_started') {
      return <Circle className="h-4 w-4 text-muted-foreground" />;
    }
    if (progress.status === 'in_progress') {
      return <Clock className="h-4 w-4 text-yellow-600" />;
    }
    return <CheckCircle2 className="h-4 w-4 text-green-600" />;
  };

  // Get button text based on status
  const getButtonText = (lessonId: string, isLocked: boolean) => {
    if (isLocked) return 'Locked';
    const progress = progressMap.get(lessonId);
    if (!progress || progress.status === 'not_started') {
      return 'Start';
    }
    if (progress.status === 'in_progress') {
      return 'Continue';
    }
    return 'Review';
  };

  if (isLoading) {
    return (
      <ContentLayout title="Loading...">
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-12 w-3/4" />
          <Skeleton className="h-6 w-1/2" />
          <div className="grid gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </div>
      </ContentLayout>
    );
  }

  if (isError || !course) {
    return (
      <ContentLayout title="Error">
        <div className="space-y-6">
          <Link href="/vac">
            <Button variant="ghost">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Courses
            </Button>
          </Link>
          <div className="text-center py-12">
            <p className="text-destructive">
              Failed to load course: {error instanceof Error ? error.message : 'Course not found'}
            </p>
          </div>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={course.name}>
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
              <BreadcrumbPage>{course.code}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Course Header with Enrollment Card */}
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Badge variant="secondary">{course.institution}</Badge>
              {course.track && (
                <Badge variant="outline" className="capitalize">
                  {course.track}
                </Badge>
              )}
              <Badge variant="outline">{course.code}</Badge>
              {isEnrolled && (
                <Badge variant="default" className="bg-green-600">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Enrolled
                </Badge>
              )}
            </div>
            <h1 className="text-3xl font-bold text-foreground">{course.name}</h1>
            <p className="text-muted-foreground mt-2">{course.description}</p>
            <div className="flex items-center gap-6 mt-4 text-sm text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {course.duration_hours} hours
              </span>
              <span className="flex items-center gap-1">
                <BookOpen className="h-4 w-4" />
                {course.weeks} weeks
              </span>
              {stats && (
                <span className="flex items-center gap-1">
                  <CheckCircle className="h-4 w-4" />
                  {stats.publishedLessons}/{stats.totalLessons} lessons
                </span>
              )}
              {course.fee > 0 && (
                <span className="flex items-center gap-1 font-medium text-foreground">
                  <CreditCard className="h-4 w-4" />
                  Rs. {course.fee.toLocaleString()}
                </span>
              )}
            </div>
          </div>

          {/* Enrollment Card */}
          <Card className="w-full lg:w-80 shrink-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">
                {isEnrolled ? 'Your Progress' : 'Enroll Now'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isEnrolled ? (
                <>
                  {/* Progress */}
                  {courseProgress && courseProgress.total > 0 && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Course Progress</span>
                        <span className="font-medium">{courseProgress.percentage}%</span>
                      </div>
                      <Progress value={courseProgress.percentage} className="h-2" />
                      <div className="text-xs text-muted-foreground">
                        {courseProgress.completed} of {courseProgress.total} lessons completed
                        {courseProgress.inProgress > 0 && ` (${courseProgress.inProgress} in progress)`}
                      </div>
                    </div>
                  )}

                  {/* Completion Badge */}
                  {courseProgress?.percentage === 100 && (
                    <Badge variant="default" className="bg-green-600 gap-1 w-full justify-center py-2">
                      <Trophy className="h-4 w-4" />
                      Course Completed!
                    </Badge>
                  )}

                  {/* Payment Status */}
                  {enrollment && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Payment</span>
                      <Badge
                        variant={
                          enrollment.payment_status === 'paid'
                            ? 'default'
                            : enrollment.payment_status === 'waived'
                            ? 'secondary'
                            : 'outline'
                        }
                      >
                        {enrollment.payment_status}
                      </Badge>
                    </div>
                  )}

                  <Link href="/vac/my-courses">
                    <Button variant="outline" className="w-full">
                      View My Courses
                    </Button>
                  </Link>
                </>
              ) : (
                <>
                  {course.fee > 0 ? (
                    <div className="text-center">
                      <div className="text-3xl font-bold">Rs. {course.fee.toLocaleString()}</div>
                      <div className="text-sm text-muted-foreground">One-time payment</div>
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="text-3xl font-bold text-green-600">Free</div>
                      <div className="text-sm text-muted-foreground">No payment required</div>
                    </div>
                  )}

                  {user ? (
                    <EnrollButton
                      course={course}
                      userId={user.id}
                      isEnrolled={false}
                      onEnrollSuccess={refetch}
                    />
                  ) : (
                    <Link href="/auth/login">
                      <Button className="w-full">Sign in to Enroll</Button>
                    </Link>
                  )}

                  <ul className="text-sm text-muted-foreground space-y-2">
                    <li className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      {course.duration_hours} hours of content
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      {stats?.publishedLessons || 0} lessons
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      Lifetime access
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      Certificate on completion
                    </li>
                  </ul>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Lessons by Week */}
        {weeks.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <BookOpen className="h-12 w-12 mx-auto text-muted-foreground" />
              <p className="mt-4 text-muted-foreground">No lessons available yet.</p>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue={`week-${weeks[0]}`} className="w-full">
            <TabsList className="mb-6 flex-wrap h-auto">
              {weeks.map((week) => (
                <TabsTrigger key={week} value={`week-${week}`}>
                  Week {week}
                </TabsTrigger>
              ))}
            </TabsList>

            {weeks.map((week) => (
              <TabsContent key={week} value={`week-${week}`}>
                <div className="grid gap-4">
                  {lessonsByWeek[week]?.map((lesson) => {
                    // First lesson is always a free preview, others require enrollment
                    const isLocked = !isEnrolled && lesson.hour > 1;
                    const progress = progressMap.get(lesson.id);
                    const isCompleted = progress?.status === 'completed';
                    const isInProgress = progress?.status === 'in_progress';

                    if (isLocked) {
                      // Locked lesson card
                      return (
                        <Card key={lesson.id} className="opacity-75">
                          <CardHeader className="pb-2">
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-3">
                                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted text-muted-foreground font-semibold">
                                  <Lock className="h-4 w-4" />
                                </div>
                                <div>
                                  <CardTitle className="text-lg text-muted-foreground">
                                    {lesson.title}
                                  </CardTitle>
                                  <CardDescription>
                                    Hour {lesson.hour} - {lesson.duration_minutes} minutes
                                  </CardDescription>
                                </div>
                              </div>
                              <Badge variant="outline">
                                <Lock className="h-3 w-3 mr-1" />
                                Locked
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <p className="text-sm text-muted-foreground">
                              Enroll in this course to unlock all lessons.
                            </p>
                          </CardContent>
                        </Card>
                      );
                    }

                    // Accessible lesson card
                    return (
                      <Link key={lesson.id} href={`/vac/${courseId}/${lesson.id}`}>
                        <Card className={`hover:shadow-md transition-shadow cursor-pointer ${isCompleted ? 'border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20' : ''}`}>
                          <CardHeader className="pb-2">
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-3">
                                <div className={`flex items-center justify-center w-10 h-10 rounded-full font-semibold ${
                                  isCompleted
                                    ? 'bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400'
                                    : isInProgress
                                    ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900 dark:text-yellow-400'
                                    : 'bg-primary/10 text-primary'
                                }`}>
                                  {isCompleted ? (
                                    <CheckCircle2 className="h-5 w-5" />
                                  ) : (
                                    lesson.hour
                                  )}
                                </div>
                                <div>
                                  <CardTitle className={`text-lg ${isCompleted ? 'text-muted-foreground' : ''}`}>
                                    {lesson.title}
                                  </CardTitle>
                                  <CardDescription>
                                    Hour {lesson.hour} - {lesson.duration_minutes} minutes
                                  </CardDescription>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {!isEnrolled && lesson.hour === 1 && (
                                  <Badge variant="outline" className="text-green-600 border-green-600">
                                    Free Preview
                                  </Badge>
                                )}
                                {user && isEnrolled && getLessonStatusIcon(lesson.id)}
                                {lesson.is_published ? (
                                  <Badge variant="default" className="bg-green-600">
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    Published
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary">Draft</Badge>
                                )}
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="flex items-center justify-between">
                              <div className="text-sm text-muted-foreground">
                                {lesson.prerequisites && (
                                  <span>Prerequisites: {lesson.prerequisites}</span>
                                )}
                              </div>
                              <Button size="sm" variant={isCompleted ? 'outline' : 'ghost'}>
                                <Play className="h-4 w-4 mr-1" />
                                {user ? getButtonText(lesson.id, false) : (lesson.hour === 1 ? 'Preview' : 'Start')}
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>
    </ContentLayout>
  );
}
