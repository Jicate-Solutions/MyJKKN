'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Edit,
  Calendar,
  Building2,
  GraduationCap,
  Users,
  BookOpen,
  ClipboardList,
  FileText
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { CourseMappingService } from '@/lib/services/organization/course-mapping-service';
import { CourseMapping } from '@/types/organizations';
import { usePermissions } from '@/hooks/use-permissions';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';

interface CourseMappingDetailViewProps {
  mappingId: string;
}

export function CourseMappingDetailView({
  mappingId
}: CourseMappingDetailViewProps) {
  const router = useRouter();
  const { canAccess, isSuperAdmin } = usePermissions();
  const [mapping, setMapping] = useState<CourseMapping | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canEdit =
    isSuperAdmin || canAccess('organizations.course.mappings', 'edit');

  useEffect(() => {
    async function fetchMapping() {
      try {
        setLoading(true);
        const data = await CourseMappingService.getCourseMapping(mappingId);
        setMapping(data);
      } catch (err) {
        console.error('Error fetching course mapping:', err);
        setError('Failed to load course mapping details');
      } finally {
        setLoading(false);
      }
    }

    fetchMapping();
  }, [mappingId]);

  if (loading) {
    return (
      <ContentLayout title='Loading...'>
        <CourseMappingDetailSkeleton />
      </ContentLayout>
    );
  }

  if (error || !mapping) {
    return (
      <ContentLayout title='Error'>
        <div className='flex flex-col items-center justify-center min-h-[400px] space-y-4'>
          <div className='text-center'>
            <h3 className='text-lg font-semibold'>
              Error Loading Course Mapping
            </h3>
            <p className='text-sm text-muted-foreground'>
              {error || 'Course mapping not found'}
            </p>
          </div>
          <Button
            variant='outline'
            onClick={() => router.push('/organizations/courses/mappings')}
          >
            <ArrowLeft className='mr-2 h-4 w-4' />
            Back
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Course Mapping Details'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/'>Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/organizations'>Organizations</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/organizations/courses'>Courses</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/organizations/courses/mappings'>
                Course Mappings
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Details</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-6'>
        {/* Header Actions */}
        <div className='flex items-center justify-between'>
          <Button
            variant='outline'
            onClick={() => router.push('/organizations/courses/mappings')}
          >
            <ArrowLeft className='h-4 w-4 mr-2' />
            Back
          </Button>
          <div className='flex items-center gap-2'>
            {canEdit && (
              <Button
                onClick={() =>
                  router.push(
                    `/organizations/courses/mappings/${mappingId}/edit`
                  )
                }
              >
                <Edit className='mr-2 h-4 w-4' />
                Edit
              </Button>
            )}
          </div>
        </div>

        {/* Course Information */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <BookOpen className='h-5 w-5' />
              Course Information
            </CardTitle>
            <CardDescription>Details about the mapped course</CardDescription>
          </CardHeader>
          <CardContent className='grid gap-4 md:grid-cols-2'>
            <div className='space-y-1'>
              <p className='text-sm font-medium text-muted-foreground'>
                Course Code
              </p>
              <p className='text-lg font-semibold'>
                {mapping.course?.course_code}
              </p>
            </div>
            <div className='space-y-1'>
              <p className='text-sm font-medium text-muted-foreground'>
                Course Name
              </p>
              <p className='text-lg font-semibold'>
                {mapping.course?.course_name}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Academic Hierarchy */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <GraduationCap className='h-5 w-5' />
              Academic Hierarchy
            </CardTitle>
            <CardDescription>
              Organizational structure for this mapping
            </CardDescription>
          </CardHeader>
          <CardContent className='grid gap-6 md:grid-cols-2 lg:grid-cols-3'>
            {/* Institution */}
            <div className='space-y-2'>
              <div className='flex items-center gap-2 text-sm font-medium text-muted-foreground'>
                <Building2 className='h-4 w-4' />
                Institution
              </div>
              <p className='text-base font-medium'>
                {mapping.institution?.name || 'N/A'}
              </p>
            </div>

            {/* Degree */}
            <div className='space-y-2'>
              <div className='flex items-center gap-2 text-sm font-medium text-muted-foreground'>
                <GraduationCap className='h-4 w-4' />
                Degree
              </div>
              <p className='text-base font-medium'>
                {mapping.degree?.degree_name || 'N/A'}
              </p>
            </div>

            {/* Department */}
            <div className='space-y-2'>
              <div className='flex items-center gap-2 text-sm font-medium text-muted-foreground'>
                <Users className='h-4 w-4' />
                Department
              </div>
              <p className='text-base font-medium'>
                {mapping.department?.department_name || 'N/A'}
              </p>
            </div>

            {/* Program */}
            <div className='space-y-2'>
              <div className='flex items-center gap-2 text-sm font-medium text-muted-foreground'>
                <ClipboardList className='h-4 w-4' />
                Program
              </div>
              <p className='text-base font-medium'>
                {mapping.program?.program_name || 'N/A'}
              </p>
            </div>

            {/* Semester */}
            <div className='space-y-2'>
              <div className='flex items-center gap-2 text-sm font-medium text-muted-foreground'>
                <Calendar className='h-4 w-4' />
                Semester
              </div>
              <p className='text-base font-medium'>
                {mapping.semester?.semester_name || 'N/A'}
              </p>
            </div>

            {/* Status */}
            <div className='space-y-2'>
              <div className='flex items-center gap-2 text-sm font-medium text-muted-foreground'>
                Status
              </div>
              <Badge
                variant={mapping.is_active ? 'default' : 'secondary'}
                className='w-fit'
              >
                {mapping.is_active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Metadata */}
        <Card>
          <CardHeader>
            <CardTitle>Metadata</CardTitle>
            <CardDescription>
              Record creation and update information
            </CardDescription>
          </CardHeader>
          <CardContent className='grid gap-4 md:grid-cols-2'>
            <div className='space-y-1'>
              <p className='text-sm font-medium text-muted-foreground'>
                Created At
              </p>
              <p className='text-base'>
                {new Date(mapping.created_at).toLocaleString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            </div>
            <div className='space-y-1'>
              <p className='text-sm font-medium text-muted-foreground'>
                Last Updated
              </p>
              <p className='text-base'>
                {new Date(mapping.updated_at).toLocaleString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            </div>
            <div className='space-y-1'>
              <p className='text-sm font-medium text-muted-foreground'>
                Mapping ID
              </p>
              <p className='text-base font-mono'>{mapping.id}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}

function CourseMappingDetailSkeleton() {
  return (
    <div className='space-y-6'>
      <div className='flex items-center justify-between'>
        <div className='space-y-2'>
          <Skeleton className='h-4 w-32' />
          <Skeleton className='h-8 w-64' />
          <Skeleton className='h-4 w-48' />
        </div>
        <Skeleton className='h-10 w-24' />
      </div>
      <Separator />
      <div className='grid gap-4'>
        <Skeleton className='h-48' />
        <Skeleton className='h-64' />
        <Skeleton className='h-32' />
      </div>
    </div>
  );
}
