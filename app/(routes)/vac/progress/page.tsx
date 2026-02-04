'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  GraduationCap,
  Clock,
  CheckCircle,
  Play,
  Award,
  ArrowRight
} from 'lucide-react';

export default function VACProgressPage() {
  // Placeholder progress data
  const enrolledCourses = [
    {
      id: '1',
      name: 'Soft Skills for Workplace',
      code: 'VAC-SS-101',
      progress: 75,
      completedLessons: 9,
      totalLessons: 12,
      timeSpent: '8h 30m',
      lastAccessed: '2026-02-04',
      status: 'in_progress',
    },
    {
      id: '2',
      name: 'Digital Marketing Basics',
      code: 'VAC-DM-101',
      progress: 100,
      completedLessons: 10,
      totalLessons: 10,
      timeSpent: '12h 15m',
      lastAccessed: '2026-01-28',
      status: 'completed',
    },
    {
      id: '3',
      name: 'Data Analytics Fundamentals',
      code: 'VAC-DA-101',
      progress: 30,
      completedLessons: 3,
      totalLessons: 10,
      timeSpent: '3h 45m',
      lastAccessed: '2026-02-03',
      status: 'in_progress',
    },
    {
      id: '4',
      name: 'Communication Skills',
      code: 'VAC-CS-101',
      progress: 0,
      completedLessons: 0,
      totalLessons: 8,
      timeSpent: '0h',
      lastAccessed: null,
      status: 'not_started',
    },
  ];

  const achievements = [
    { title: 'First Course Completed', date: '2026-01-28', icon: Award },
    { title: '10 Hours Learning', date: '2026-02-01', icon: Clock },
    { title: 'Perfect Quiz Score', date: '2026-01-25', icon: CheckCircle },
  ];

  const totalProgress = Math.round(
    enrolledCourses.reduce((sum, c) => sum + c.progress, 0) / enrolledCourses.length
  );

  const completedCourses = enrolledCourses.filter(c => c.status === 'completed').length;

  return (
    <ContentLayout title="My Progress">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'VAC', href: '/vac' },
          { label: 'My Progress' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">My Learning Progress</h1>
          <p className="text-sm text-muted-foreground">
            Track your progress across all enrolled Value-Added Courses
          </p>
        </div>

        {/* Overview Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Overall Progress</CardTitle>
              <GraduationCap className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalProgress}%</div>
              <Progress value={totalProgress} className="mt-2" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Courses Enrolled</CardTitle>
              <Play className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{enrolledCourses.length}</div>
              <p className="text-xs text-muted-foreground">{completedCourses} completed</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Time</CardTitle>
              <Clock className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">24h 30m</div>
              <p className="text-xs text-muted-foreground">Learning time</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Achievements</CardTitle>
              <Award className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{achievements.length}</div>
              <p className="text-xs text-muted-foreground">Earned</p>
            </CardContent>
          </Card>
        </div>

        {/* Course Progress */}
        <Card>
          <CardHeader>
            <CardTitle>Course Progress</CardTitle>
            <CardDescription>Track your progress in each enrolled course</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {enrolledCourses.map((course) => (
                <div key={course.id} className="p-4 rounded-lg border">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-mono bg-muted px-1.5 py-0.5 rounded">
                          {course.code}
                        </code>
                        <Badge
                          variant={
                            course.status === 'completed' ? 'default' :
                            course.status === 'in_progress' ? 'secondary' : 'outline'
                          }
                          className={
                            course.status === 'completed' ? 'bg-green-100 text-green-700' :
                            course.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : ''
                          }
                        >
                          {course.status === 'completed' ? 'Completed' :
                           course.status === 'in_progress' ? 'In Progress' : 'Not Started'}
                        </Badge>
                      </div>
                      <h3 className="font-semibold mt-1">{course.name}</h3>
                    </div>
                    <Button asChild size="sm" variant={course.status === 'completed' ? 'outline' : 'default'}>
                      <Link href={`/vac/${course.id}`}>
                        {course.status === 'completed' ? 'Review' :
                         course.status === 'not_started' ? 'Start' : 'Continue'}
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>{course.completedLessons} of {course.totalLessons} lessons</span>
                      <span className="font-medium">{course.progress}%</span>
                    </div>
                    <Progress value={course.progress} />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Time spent: {course.timeSpent}</span>
                      {course.lastAccessed && (
                        <span>Last accessed: {course.lastAccessed}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Achievements */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5 text-yellow-500" />
              Achievements
            </CardTitle>
            <CardDescription>Milestones you have reached</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              {achievements.map((achievement, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50">
                  <div className="p-2 rounded-full bg-yellow-100">
                    <achievement.icon className="h-5 w-5 text-yellow-600" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{achievement.title}</p>
                    <p className="text-xs text-muted-foreground">{achievement.date}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
