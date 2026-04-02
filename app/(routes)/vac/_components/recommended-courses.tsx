'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useRecommendedCourses } from '@/hooks/vac/use-vac';
import type { VACCourse } from '@/types/vac';

interface RecommendedCoursesProps {
  programmeId: string;
  institutionId: string;
}

const TRACK_COLORS: Record<string, string> = {
  'AI-1': 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  'AI-2': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
  'AI-3': 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  'AI-4': 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  'H-1': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  'H-2': 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
  general: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
};

function CourseCard({ course }: { course: VACCourse }) {
  return (
    <Card className="min-w-[220px] max-w-[260px] shrink-0 transition-shadow hover:shadow-md">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-semibold leading-tight line-clamp-2">
            {course.name}
          </h4>
          <Badge
            variant="secondary"
            className={`shrink-0 text-[10px] ${TRACK_COLORS[course.track] || TRACK_COLORS.general}`}
          >
            {course.track}
          </Badge>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{course.duration_hours}h</span>
          <span className="font-medium text-foreground">
            {course.fee > 0 ? `₹${course.fee.toLocaleString('en-IN')}` : 'Free'}
          </span>
        </div>

        <Button asChild size="sm" variant="outline" className="w-full text-xs">
          <Link href={`/vac/${course.id}`}>
            View
            <ArrowRight className="ml-1.5 h-3 w-3" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="min-w-[220px] space-y-3 rounded-lg border p-4">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-8 w-full" />
        </div>
      ))}
    </div>
  );
}

export function RecommendedCourses({ programmeId, institutionId }: RecommendedCoursesProps) {
  const { data: courses, isLoading, error } = useRecommendedCourses(programmeId, institutionId);

  if (isLoading) return <LoadingSkeleton />;
  if (error || !courses || courses.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-amber-500" />
        <h3 className="text-sm font-semibold">Recommended for Your Programme</h3>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-muted">
        {courses.map((course: VACCourse) => (
          <CourseCard key={course.id} course={course} />
        ))}
      </div>
    </div>
  );
}
