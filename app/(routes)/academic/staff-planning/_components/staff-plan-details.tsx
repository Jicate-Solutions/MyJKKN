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

        // Load staff plan data
        try {
          const planData = await StaffPlanService.getStaffPlan(id);
          setStaffPlan(planData);
        } catch (planError) {
          console.error('Error loading staff plan:', planError);
          setError('Failed to load staff plan details');
          setLoading(false);
          return;
        }

        // Load course data separately, so page can still load if this fails
        try {
          const coursesData = await StaffPlanService.getStaffPlanCourses(id);
          setCourses(coursesData);
        } catch (coursesError) {
          console.error('Error loading course assignments:', coursesError);
          // Don't set the main error state, just show empty courses
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
            <h1 className='text-2xl font-bold'>Staff Plan Details</h1>
            <p className='text-muted-foreground'>
              View staff plan details and course assignments
            </p>
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
            <CardTitle>Course Assignments</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Course</TableHead>
                  <TableHead>Staff Member</TableHead>
                  <TableHead>Staff Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {courses.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className='text-center text-muted-foreground h-24'
                    >
                      No course assignments found
                    </TableCell>
                  </TableRow>
                ) : (
                  courses.map((course) => (
                    <TableRow key={course.id}>
                      <TableCell>
                        <div>
                          <p className='font-medium'>
                            {course.course?.course_name}
                          </p>
                          <p className='text-sm text-muted-foreground'>
                            {course.course?.course_code}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {course.staff?.first_name} {course.staff?.last_name}
                      </TableCell>
                      <TableCell>
                        <Badge variant='outline'>
                          {course.staff_type
                            .split('_')
                            .map(
                              (word) =>
                                word.charAt(0).toUpperCase() + word.slice(1)
                            )
                            .join(' ')}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
