'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useVACCourse } from '@/hooks/vac/use-vac';
import { VACService } from '@/lib/services/vac-service';
import { ArrowLeft, BookOpen, Clock, GraduationCap, IndianRupee, PlayCircle, CheckCircle2 } from 'lucide-react';

interface CourseDetailContentProps {
  courseId: string;
}

export default function CourseDetailContent({ courseId }: CourseDetailContentProps) {
  const { data: course, isLoading: courseLoading, error: courseError } = useVACCourse(courseId);

  // Use direct fetch instead of hook for debugging
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [lessons, setLessons] = useState<any[]>([]);
  const [lessonsLoading, setLessonsLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [lessonsError, setLessonsError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchLessons() {
      if (!courseId) return;
      try {
        const data = await VACService.getLessonsByCourse(courseId);
        setLessons(data);
      } catch (err) {
        setLessonsError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setLessonsLoading(false);
      }
    }
    fetchLessons();
  }, [courseId]);

  // Group lessons by week
  const lessonsByWeek = lessons.reduce((acc, lesson) => {
    const week = lesson.week || 1;
    if (!acc[week]) acc[week] = [];
    acc[week].push(lesson);
    return acc;
  }, {} as Record<number, typeof lessons>);

  const weeks = Object.keys(lessonsByWeek).map(Number).sort((a, b) => a - b);

  if (courseLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
        <header className="border-b bg-white dark:bg-gray-900 sticky top-0 z-10">
          <div className="container mx-auto px-4 py-4">
            <Skeleton className="h-8 w-48" />
          </div>
        </header>
        <main className="container mx-auto px-4 py-8">
          <Skeleton className="h-12 w-2/3 mb-4" />
          <Skeleton className="h-6 w-1/2 mb-8" />
          <Skeleton className="h-64 w-full" />
        </main>
      </div>
    );
  }

  if (courseError || !course) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Course Not Found</h1>
          <p className="text-muted-foreground mb-6">The course you&apos;re looking for doesn&apos;t exist or has been removed.</p>
          <Link href="/courses">
            <Button>Back to Courses</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <header className="border-b bg-white dark:bg-gray-900 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/courses">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                All Courses
              </Button>
            </Link>
          </div>
          <Link href="/auth/login">
            <Button>Enroll Now</Button>
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Course Header */}
        <div className="mb-8">
          <div className="flex flex-wrap gap-2 mb-4">
            <Badge variant="secondary">{course.institution}</Badge>
            {course.track && (
              <Badge variant="outline" className="capitalize">{course.track}</Badge>
            )}
            <Badge variant="outline">{course.code}</Badge>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            {course.name}
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 mb-6">
            {course.description}
          </p>

          {/* Course Stats */}
          <div className="flex flex-wrap gap-6 text-gray-600 dark:text-gray-300">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              <span>{course.duration_hours} hours total</span>
            </div>
            <div className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              <span>{course.weeks} weeks</span>
            </div>
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              <span>{lessons.length} lessons</span>
            </div>
            <div className="flex items-center gap-2">
              <IndianRupee className="h-5 w-5" />
              <span className="font-semibold text-xl text-foreground">₹{course.fee}</span>
            </div>
          </div>
        </div>

        {/* Course Content */}
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Lessons List */}
          <div className="lg:col-span-2">
            <h2 className="text-2xl font-bold mb-6">Course Content</h2>

            {lessonsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            ) : lessons.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No lessons available yet.</p>
                </CardContent>
              </Card>
            ) : (
              <Tabs defaultValue={weeks[0]?.toString()} className="w-full">
                <TabsList className="mb-4">
                  {weeks.map((week) => (
                    <TabsTrigger key={week} value={week.toString()}>
                      Week {week}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {weeks.map((week) => (
                  <TabsContent key={week} value={week.toString()}>
                    <div className="space-y-3">
                      {lessonsByWeek[week]
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        .sort((a: any, b: any) => (a.hour || 0) - (b.hour || 0))
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        .map((lesson: any, idx: number) => (
                          <Card key={lesson.id} className="hover:shadow-md transition-shadow">
                            <CardHeader className="py-4">
                              <div className="flex items-start justify-between">
                                <div className="flex items-start gap-4">
                                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                                    {idx + 1}
                                  </div>
                                  <div>
                                    <CardTitle className="text-lg">{lesson.title}</CardTitle>
                                    <CardDescription className="mt-1">
                                      {lesson.description || 'No description available'}
                                    </CardDescription>
                                    <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                                      <span className="flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {lesson.duration_minutes || 60} min
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <PlayCircle className="h-6 w-6 text-muted-foreground" />
                              </div>
                            </CardHeader>
                          </Card>
                        ))}
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            )}
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <Card className="sticky top-24">
              <CardHeader>
                <CardTitle>Ready to Start?</CardTitle>
                <CardDescription>
                  Sign in to enroll and access all course materials
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-3xl font-bold">₹{course.fee}</div>
                <Link href="/auth/login" className="block">
                  <Button className="w-full" size="lg">
                    Enroll Now
                  </Button>
                </Link>
                <div className="text-sm text-muted-foreground">
                  <ul className="space-y-2">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      {course.duration_hours} hours of content
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      {lessons.length} comprehensive lessons
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      Certificate upon completion
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      Lifetime access
                    </li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t mt-16 py-8 bg-gray-50 dark:bg-gray-900">
        <div className="container mx-auto px-4 text-center text-gray-500">
          <p>&copy; 2026 JKKN Institutions. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
