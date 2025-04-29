import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Edit, Trash, UserCog } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { StudentService } from '@/lib/services/student/student-service';
import StudentDetailSkeleton from '../_components/student-detail-skeleton';
import { StudentDetailActions } from '../_components/student-detail-actions';
import { StudentDetail } from '../_components/student-detail';

interface StudentDetailPageProps {
  params: {
    id: string;
  };
}

export default async function StudentDetailPage({
  params
}: StudentDetailPageProps) {
  const { id } = await params;

  try {
    // Use the StudentService directly in server component
    const student = await StudentService.getStudentServer(id);

    if (!student) {
      return notFound();
    }

    return (
      <ContentLayout title={`Student: ${student.student_name}`}>
        <div className='space-y-6'>
          <PageBreadcrumb
            items={[
              { label: 'Home', href: '/' },
              { label: 'Students', href: '/students' },
              { label: student.student_name }
            ]}
          />

          <div className='flex flex-col md:flex-row justify-between items-start md:items-center gap-4'>
            <div>
              <h1 className='text-2xl font-bold tracking-tight'>
                {student.student_name}
              </h1>
              <p className='text-muted-foreground'>
                {student.roll_number
                  ? `Roll No: ${student.roll_number}`
                  : 'No Roll Number Assigned'}
              </p>
            </div>
            <div className='flex items-center gap-2'>
              <Button variant='outline' asChild>
                <Link href='/students'>
                  <ArrowLeft className='mr-2 h-4 w-4' />
                  Back
                </Link>
              </Button>
              <StudentDetailActions student={student} />
            </div>
          </div>

          <Suspense fallback={<StudentDetailSkeleton />}>
            <StudentDetail student={student} />
          </Suspense>
        </div>
      </ContentLayout>
    );
  } catch (error) {
    console.error('Error loading student:', error);
    return (
      <ContentLayout title='Student Details'>
        <div className='flex flex-col items-center justify-center p-8 text-center'>
          <h2 className='text-xl font-semibold mb-2'>Error Loading Student</h2>
          <p className='text-muted-foreground mb-4'>
            There was a problem loading the student details. Please try again.
          </p>
          <Button asChild>
            <Link href='/students'>Back to Students</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }
}
