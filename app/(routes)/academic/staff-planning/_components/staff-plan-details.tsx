'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { Edit } from 'lucide-react';
import { StaffPlan, StaffPlanCourse } from '@/types/staff-planning';
import { StaffPlanService } from '@/lib/services/academic/staff-plan-service';
import { Button } from '@/components/ui/button';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BeatLoader } from 'react-spinners';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';

interface StaffPlanDetailsProps {
  id: string;
  canEdit?: boolean;
  canDelete?: boolean;
}

export function StaffPlanDetailsPage({
  id,
  canEdit = true,
  canDelete = true
}: StaffPlanDetailsProps) {
  const router = useRouter();
  const [staffPlan, setStaffPlan] = useState<StaffPlan | null>(null);
  const [courses, setCourses] = useState<StaffPlanCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);

        // First try to load individual staff plan
        try {
          const planData = await StaffPlanService.getStaffPlan(id);
          setStaffPlan(planData);

          // Try to load consolidated view for this semester
          try {
            const consolidatedData =
              await StaffPlanService.getConsolidatedStaffPlan(
                planData.institution_id,
                planData.program_id,
                planData.semester_id,
                planData.academic_year_id
              );

            // Use consolidated data if available
            setStaffPlan(consolidatedData);
            setCourses(consolidatedData.all_courses);
          } catch (consolidatedError) {
            console.log(
              'Consolidated view not available, using individual plan'
            );
            // Fallback to individual course data
            const coursesData = await StaffPlanService.getStaffPlanCourses(id);
            setCourses(coursesData);
          }
        } catch (planError) {
          console.error('Error loading staff plan:', planError);
          setError('Failed to load staff plan details');
          setLoading(false);
          return;
        }
      } catch (error) {
        console.error('Error loading staff plan:', error);
        setError('Failed to load staff plan details');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [id]);

  if (loading) {
    return (
      <ContentLayout title='Staff Plan Details'>
        <div className='flex justify-center items-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (error || !staffPlan) {
    return (
      <ContentLayout title='Staff Plan Details'>
        <div className='text-center py-8'>
          <p className='text-destructive'>{error || 'Staff plan not found'}</p>
          <Button
            variant='outline'
            onClick={() => router.back()}
            className='mt-4'
          >
            Go Back
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Staff Plan Details'>
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
              <Link href='/academic/staff-planning'>Academic</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/academic/staff-planning'>Staff Planning</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Staff Plan Details</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex justify-between items-start'>
          <div>
            <h1 className='text-2xl font-bold'>
              {courses.length > 1 ? 'Consolidated ' : ''}Staff Plan Details
            </h1>
            <p className='text-muted-foreground'>
              {courses.length > 0
                ? `Complete semester view with ${courses.length} courses and ${
                    staffPlan.total_staff || 0
                  } staff assignments`
                : 'View staff plan details and course assignments'}
            </p>
            {courses.length > 1 && (
              <Badge variant='secondary' className='mt-2'>
                Consolidated View
              </Badge>
            )}
          </div>
          {canEdit ? (
            <Button asChild>
              <Link href={`/academic/staff-planning/${staffPlan.id}/edit`}>
                <Edit className='mr-2 h-4 w-4' />
                Edit Plan
              </Link>
            </Button>
          ) : (
            <Button variant='outline' disabled className='opacity-50'>
              <Edit className='mr-2 h-4 w-4' />
              Edit Plan
            </Button>
          )}
        </div>

        <div className='grid gap-6 md:grid-cols-2'>
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div>
                <p className='font-medium'>Institution</p>
                <p className='text-muted-foreground'>
                  {staffPlan.institution?.name}
                </p>
              </div>
              <div>
                <p className='font-medium'>Program</p>
                <p className='text-muted-foreground'>
                  {staffPlan.program?.program_name}
                </p>
              </div>
              <div>
                <p className='font-medium'>Semester</p>
                <p className='text-muted-foreground'>
                  {staffPlan.semester?.semester_name}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Plan Details</CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div>
                <p className='font-medium'>Academic Year</p>
                <p className='text-muted-foreground'>
                  {staffPlan.academic_year?.academic_year_name}
                </p>
              </div>
              <div>
                <p className='font-medium'>Period</p>
                <p className='text-muted-foreground'>
                  {format(new Date(staffPlan.start_date), 'PPP')} -{' '}
                  {format(new Date(staffPlan.end_date), 'PPP')}
                </p>
              </div>
              <div>
                <p className='font-medium'>Status</p>
                <Badge variant={staffPlan.is_active ? 'success' : 'secondary'}>
                  {staffPlan.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              Course Assignments
              {courses.length > 0 && (
                <Badge variant='outline' className='ml-2'>
                  {courses.length} courses
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {courses.length === 0 ? (
              <div className='text-center text-muted-foreground h-24 flex items-center justify-center'>
                No course assignments found
              </div>
            ) : (
              <div className='space-y-6'>
                {(() => {
                  // Group courses by course_id to show all staff for each course
                  const groupedCourses = courses.reduce((acc, course) => {
                    const courseId = course.course_id;
                    if (!acc[courseId]) {
                      acc[courseId] = {
                        course: course.course,
                        assignments: []
                      };
                    }
                    acc[courseId].assignments.push(course);
                    return acc;
                  }, {} as Record<string, { course: any; assignments: any[] }>);

                  return Object.entries(groupedCourses).map(
                    ([courseId, data]) => (
                      <Card
                        key={courseId}
                        className='border-l-4 border-l-primary/20'
                      >
                        <CardHeader className='pb-3'>
                          <div className='flex items-center justify-between'>
                            <div>
                              <CardTitle className='text-lg'>
                                {data.course?.course_name || 'Unknown Course'}
                              </CardTitle>
                              <p className='text-sm text-muted-foreground'>
                                {data.course?.course_code || 'No code'} •{' '}
                                {data.assignments.length} staff assigned
                              </p>
                            </div>
                            <Badge variant='secondary'>
                              {data.assignments.length} staff
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className='pt-0'>
                          <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
                            {data.assignments.map((assignment) => (
                              <div
                                key={assignment.id}
                                className='flex items-center justify-between p-3 bg-muted/50 rounded-lg'
                              >
                                <div>
                                  <p className='font-medium text-sm'>
                                    {assignment.staff?.first_name}{' '}
                                    {assignment.staff?.last_name}
                                  </p>
                                  <p className='text-xs text-muted-foreground'>
                                    {assignment.staff?.staff_id || 'No ID'}
                                  </p>
                                </div>
                                <Badge variant='outline' className='text-xs'>
                                  {assignment.staff_type
                                    .split('_')
                                    .map(
                                      (word: string) =>
                                        word.charAt(0).toUpperCase() +
                                        word.slice(1)
                                    )
                                    .join(' ')}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )
                  );
                })()}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
