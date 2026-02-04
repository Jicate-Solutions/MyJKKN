'use client';

import { useCourseProgress, useVACProgress } from '@/hooks/vac/use-vac';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, Circle, Clock, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CourseProgressBarProps {
  userId: string;
  courseId: string;
  showDetails?: boolean;
  className?: string;
}

/**
 * Course progress bar showing overall completion percentage
 */
export function CourseProgressBar({
  userId,
  courseId,
  showDetails = false,
  className
}: CourseProgressBarProps) {
  const { data: progress, isLoading } = useCourseProgress(userId, courseId);

  if (isLoading) {
    return (
      <div className={cn('space-y-2', className)}>
        <Skeleton className="h-2 w-full" />
        {showDetails && <Skeleton className="h-4 w-24" />}
      </div>
    );
  }

  if (!progress) {
    return null;
  }

  const { completed, total, percentage, inProgress } = progress;
  const isComplete = percentage === 100;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {completed} of {total} lessons completed
        </span>
        <span className={cn(
          'font-medium',
          isComplete ? 'text-green-600' : 'text-primary'
        )}>
          {percentage}%
        </span>
      </div>
      <Progress
        value={percentage}
        className={cn(
          'h-2',
          isComplete && 'bg-green-100 [&>div]:bg-green-600'
        )}
      />
      {showDetails && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-green-600" />
            {completed} completed
          </span>
          {inProgress > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-yellow-600" />
              {inProgress} in progress
            </span>
          )}
          <span className="flex items-center gap-1">
            <Circle className="h-3 w-3" />
            {total - completed - inProgress} not started
          </span>
        </div>
      )}
      {isComplete && (
        <Badge variant="default" className="bg-green-600 gap-1">
          <Trophy className="h-3 w-3" />
          Course Complete!
        </Badge>
      )}
    </div>
  );
}

interface LessonProgressListProps {
  userId: string;
  courseId: string;
  lessons: Array<{ id: string; hour: number; title: string }>;
  currentLessonId?: string;
}

/**
 * Lesson-by-lesson progress list showing status of each lesson
 */
export function LessonProgressList({
  userId,
  courseId,
  lessons,
  currentLessonId
}: LessonProgressListProps) {
  const { data: progressData, isLoading } = useVACProgress(userId, courseId);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {lessons.slice(0, 5).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  // Create a map of lesson progress
  const progressMap = new Map(
    (progressData || []).map(p => [p.lesson_id, p])
  );

  return (
    <div className="space-y-1">
      {lessons.map((lesson) => {
        const lessonProgress = progressMap.get(lesson.id);
        const status = lessonProgress?.status || 'not_started';
        const isCurrent = lesson.id === currentLessonId;

        return (
          <div
            key={lesson.id}
            className={cn(
              'flex items-center gap-3 p-2 rounded-md text-sm',
              isCurrent && 'bg-primary/10 border border-primary/20',
              !isCurrent && 'hover:bg-muted/50'
            )}
          >
            <LessonStatusIcon status={status} />
            <span className={cn(
              'flex-1 truncate',
              status === 'completed' && 'text-muted-foreground line-through',
              isCurrent && 'font-medium'
            )}>
              Hour {lesson.hour}: {lesson.title}
            </span>
            {isCurrent && (
              <Badge variant="outline" className="text-xs">
                Current
              </Badge>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface LessonStatusIconProps {
  status: 'not_started' | 'in_progress' | 'completed';
  className?: string;
}

function LessonStatusIcon({ status, className }: LessonStatusIconProps) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className={cn('h-4 w-4 text-green-600', className)} />;
    case 'in_progress':
      return <Clock className={cn('h-4 w-4 text-yellow-600', className)} />;
    default:
      return <Circle className={cn('h-4 w-4 text-muted-foreground', className)} />;
  }
}

interface ProgressCardProps {
  userId: string;
  courseId: string;
  courseName: string;
  lessons: Array<{ id: string; hour: number; title: string }>;
  currentLessonId?: string;
}

/**
 * Full progress card with both progress bar and lesson list
 */
export function ProgressCard({
  userId,
  courseId,
  courseName,
  lessons,
  currentLessonId
}: ProgressCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          <span>Your Progress</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <CourseProgressBar
          userId={userId}
          courseId={courseId}
          showDetails
        />
        <div className="border-t pt-4">
          <h4 className="text-sm font-medium mb-3">Lessons</h4>
          <div className="max-h-64 overflow-y-auto">
            <LessonProgressList
              userId={userId}
              courseId={courseId}
              lessons={lessons}
              currentLessonId={currentLessonId}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Mini progress indicator for course cards
 */
export function MiniProgress({
  userId,
  courseId,
  className
}: {
  userId: string;
  courseId: string;
  className?: string;
}) {
  const { data: progress, isLoading } = useCourseProgress(userId, courseId);

  if (isLoading) {
    return <Skeleton className={cn('h-1.5 w-16', className)} />;
  }

  if (!progress || progress.total === 0) {
    return null;
  }

  const { percentage } = progress;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Progress value={percentage} className="h-1.5 w-16" />
      <span className="text-xs text-muted-foreground">{percentage}%</span>
    </div>
  );
}
