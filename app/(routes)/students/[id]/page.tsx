'use client';

import { use } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { notFound, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { StudentService } from '@/lib/services/student/student-service';
import StudentDetailSkeleton from '../_components/student-detail-skeleton';
import { StudentDetailActions } from '../_components/student-detail-actions';
import { StudentDetail } from '../_components/student-detail';
import { Student } from '@/types/student';
import { usePermissions } from '@/hooks/use-permissions';

interface StudentDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function StudentDetailPage({ params }: StudentDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  // Check for permission to view student details
  useEffect(() => {
    // Skip permission check while permissions are still loading
    if (permissionsLoading) {
      console.log('Permissions are still loading...');
      return;
    }

    const shouldRedirect = !isSuperAdmin && !canAccess('students', 'view');

    if (shouldRedirect) {
      console.log('Access denied for student details page');
      router.push('/unauthorized');
    }
  }, [isSuperAdmin, canAccess, router, permissionsLoading]);

  useEffect(() => {
    async function fetchStudent() {
      try {
        setLoading(true);
        setError(null);
        const data = await StudentService.getStudent(id);
        setStudent(data);
      } catch (err) {
        console.error('Error fetching student:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to fetch student details'
        );
      } finally {
        setLoading(false);
      }
    }

    fetchStudent();
  }, [id]);

  if (loading) {
    return (
      <ContentLayout title='Student Details'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin' />
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title='Student Details'>
        <div className='flex flex-col items-center justify-center p-8 text-center'>
          <h2 className='text-xl font-semibold mb-2'>Error Loading Student</h2>
          <p className='text-muted-foreground mb-4'>{error}</p>
          <Button asChild>
            <Link href='/students'>Back to Students</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  if (!student) {
    return (
      <ContentLayout title='Student Details'>
        <div className='flex flex-col items-center justify-center p-8 text-center'>
          <h2 className='text-xl font-semibold mb-2'>Student Not Found</h2>
          <p className='text-muted-foreground mb-4'>
            The requested student could not be found.
          </p>
          <Button asChild>
            <Link href='/students'>Back to Students</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout
      title={`Student: ${student.first_name} ${student.last_name || ''}`.trim()}
    >
      <div className='space-y-6'>
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Students', href: '/students' },
            {
              label: `${student.first_name} ${student.last_name || ''}`.trim()
            }
          ]}
        />

        <div className='flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>
              {`${student.first_name} ${student.last_name || ''}`.trim()}
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

        <div className='flex flex-col lg:flex-row gap-8'>
          <StudentDetail student={student} />
        </div>
      </div>
    </ContentLayout>
  );
}
