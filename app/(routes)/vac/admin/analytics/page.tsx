'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  BarChart3,
  Users,
  GraduationCap,
  TrendingUp,
  Clock,
  Award,
  BookOpen
} from 'lucide-react';

export default function VACAnalyticsPage() {
  // Placeholder analytics data
  const stats = {
    totalEnrollments: 1234,
    activeStudents: 856,
    completedCourses: 378,
    avgCompletionRate: 72,
    totalCourses: 24,
    avgRating: 4.5,
  };

  const courseStats = [
    { name: 'Soft Skills for Workplace', enrollments: 234, completionRate: 78, rating: 4.6 },
    { name: 'Digital Marketing Basics', enrollments: 198, completionRate: 65, rating: 4.3 },
    { name: 'Data Analytics Fundamentals', enrollments: 187, completionRate: 71, rating: 4.7 },
    { name: 'Communication Skills', enrollments: 156, completionRate: 82, rating: 4.4 },
    { name: 'Financial Literacy', enrollments: 142, completionRate: 68, rating: 4.2 },
  ];

  const trackDistribution = [
    { track: 'Professional Development', percentage: 35, count: 432 },
    { track: 'Technical Skills', percentage: 28, count: 345 },
    { track: 'Communication', percentage: 22, count: 271 },
    { track: 'Personal Growth', percentage: 15, count: 186 },
  ];

  return (
    <ContentLayout title="VAC Analytics">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'VAC', href: '/vac' },
          { label: 'Admin', href: '/vac/admin' },
          { label: 'Analytics' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">VAC Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Track course performance, enrollments, and learner progress
          </p>
        </div>

        {/* Key Metrics */}
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Enrollments</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalEnrollments.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Students</CardTitle>
              <GraduationCap className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.activeStudents.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completions</CardTitle>
              <Award className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.completedCourses}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.avgCompletionRate}%</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Courses</CardTitle>
              <BookOpen className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalCourses}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg. Rating</CardTitle>
              <BarChart3 className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">★ {stats.avgRating}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Top Courses */}
          <Card>
            <CardHeader>
              <CardTitle>Top Courses by Enrollment</CardTitle>
              <CardDescription>Most popular VAC courses</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {courseStats.map((course, i) => (
                  <div key={i} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{course.name}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">★ {course.rating}</Badge>
                        <span className="text-sm text-muted-foreground">
                          {course.enrollments} enrolled
                        </span>
                      </div>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${course.completionRate}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground text-right">
                      {course.completionRate}% completion rate
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Track Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Enrollment by Track</CardTitle>
              <CardDescription>Distribution across course tracks</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {trackDistribution.map((track, i) => (
                  <div key={i} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{track.track}</span>
                      <span className="text-sm text-muted-foreground">
                        {track.count} students ({track.percentage}%)
                      </span>
                    </div>
                    <div className="h-3 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          i === 0 ? 'bg-blue-500' :
                          i === 1 ? 'bg-green-500' :
                          i === 2 ? 'bg-purple-500' : 'bg-orange-500'
                        }`}
                        style={{ width: `${track.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Time Spent Analysis */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Learning Time Analysis
            </CardTitle>
            <CardDescription>Average time spent on courses this month</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="text-center p-4 rounded-lg bg-muted">
                <div className="text-3xl font-bold text-primary">12.5h</div>
                <p className="text-sm text-muted-foreground">Avg per Student</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-muted">
                <div className="text-3xl font-bold text-green-600">45min</div>
                <p className="text-sm text-muted-foreground">Avg Session Duration</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-muted">
                <div className="text-3xl font-bold text-blue-600">3.2</div>
                <p className="text-sm text-muted-foreground">Sessions per Week</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-muted">
                <div className="text-3xl font-bold text-purple-600">86%</div>
                <p className="text-sm text-muted-foreground">Video Watch Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
