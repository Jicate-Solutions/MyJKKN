'use client';

import { useEffect, useState } from 'react';
import { notFound } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import LearnerLayout from '@/components/layout/learner-layout';
import { Student } from '@/types/student';
import { UserService } from '@/lib/services/users/user-service';
import { StudentService } from '@/lib/services/student/student-service';
import { LearnerProfileSummaryCard } from './_components/learner-profile-summary-card';
import { LearnerProfileDetails } from './_components/learner-profile-details';
import { LearnerPageHeader } from '@/components/layout/learner-page-header';

export default function LearnerProfilePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [student, setStudent] = useState<Student | null>(null);

  useEffect(() => {
    async function fetchLearnerProfile() {
      try {
        setLoading(true);
        setError(null);

        const { data: profile, error: profileError } =
          await UserService.getCurrentUserProfile();

        if (profileError || !profile) {
          throw new Error(
            profileError?.message || 'Could not load user profile.'
          );
        }

        if (profile.role !== 'student' || !profile.student_id) {
          throw new Error('This profile does not belong to a student.');
        }

        const studentDetails = await StudentService.getStudent(
          profile.student_id
        );
        setStudent(studentDetails);
      } catch (err) {
        console.error('Error fetching learner profile:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to fetch profile details'
        );
      } finally {
        setLoading(false);
      }
    }

    fetchLearnerProfile();
  }, []);

  if (loading) {
    return (
      <LearnerLayout>
        <LearnerPageHeader
          title='My Profile'
          subtitle='Loading your details...'
        />
        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin text-primary' />
        </div>
      </LearnerLayout>
    );
  }

  if (error) {
    return (
      <LearnerLayout>
        <LearnerPageHeader
          title='Error'
          subtitle='We ran into an issue loading your profile.'
        />
        <div className='flex flex-col items-center justify-center p-8 text-center bg-red-50/50 rounded-lg'>
          <h2 className='text-xl font-semibold mb-2 text-red-700'>
            Could Not Load Profile
          </h2>
          <p className='text-red-600'>{error}</p>
        </div>
      </LearnerLayout>
    );
  }

  if (!student) {
    notFound();
  }

  return (
    <LearnerLayout>
      <LearnerPageHeader
        title='My Profile'
        subtitle='View and manage your personal and academic information.'
      />
      <div className='p-4 md:p-6 space-y-6'>
        <LearnerProfileSummaryCard student={student} />
        <LearnerProfileDetails student={student} />
      </div>
    </LearnerLayout>
  );
}
