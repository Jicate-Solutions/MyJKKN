'use client';

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
import { Skeleton } from '@/components/ui/skeleton';
import { useVACCourses } from '@/hooks/vac/use-vac';
import { BookOpen, Clock, GraduationCap, IndianRupee } from 'lucide-react';
import { useState } from 'react';

export default function VACCoursesPage() {
  const [trackFilter, setTrackFilter] = useState<string | undefined>(undefined);
  const { data, isLoading, isError, error } = useVACCourses({ track: trackFilter });

  const courses = data?.courses || [];

  return (
    <ContentLayout title="Value-Added Courses">
      <div className="space-y-6">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Value-Added Courses</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">Value-Added Courses</h1>
          <p className="text-muted-foreground mt-2">
            JKKN Institutions - Expand your skills with our curated courses
          </p>
        </div>

        {/* Track Filter */}
        <div className="flex gap-2 flex-wrap">
          <Badge
            variant={trackFilter === undefined ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setTrackFilter(undefined)}
          >
            All Courses
          </Badge>
          <Badge
            variant={trackFilter === 'matlab' ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setTrackFilter('matlab')}
          >
            MATLAB Track
          </Badge>
          <Badge
            variant={trackFilter === 'ai' ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setTrackFilter('ai')}
          >
            AI Track
          </Badge>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-1/2 mt-2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Error State */}
        {isError && (
          <div className="text-center py-12">
            <p className="text-destructive">
              Failed to load courses: {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !isError && courses.length === 0 && (
          <div className="text-center py-12">
            <BookOpen className="h-12 w-12 mx-auto text-muted-foreground" />
            <p className="mt-4 text-muted-foreground">No courses available yet.</p>
          </div>
        )}

        {/* Course Grid */}
        {!isLoading && !isError && courses.length > 0 && (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => (
              <Link key={course.id} href={`/vac/${course.id}`}>
                <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <Badge variant="secondary">{course.institution}</Badge>
                      <div className="flex gap-1">
                        {course.track && (
                          <Badge variant="outline" className="capitalize">
                            {course.track}
                          </Badge>
                        )}
                        <Badge variant="outline">{course.code}</Badge>
                      </div>
                    </div>
                    <CardTitle className="mt-3">{course.name}</CardTitle>
                    <CardDescription className="line-clamp-2">
                      {course.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        <span>{course.duration_hours} hours</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <GraduationCap className="h-4 w-4" />
                        <span>{course.weeks} weeks</span>
                      </div>
                      <div className="flex items-center gap-2 col-span-2">
                        <IndianRupee className="h-4 w-4" />
                        <span className="font-medium">₹{course.fee}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
