// app/(routes)/learners/my-profile/status/page.tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { StudentValidationService } from '@/lib/services/auth/student-validation-service';
import { ProfileStatusClient } from './_components/profile-status-client';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';

export const metadata = {
  title: 'Profile Change Status | My Profile',
  description: 'View the status and history of your profile change requests',
};

export default async function ProfileStatusPage() {
  const supabase = await createClient();

  // Get authenticated user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/auth/login');
  }

  // Verify user is a student
  const { data: profile } = await supabase
    .from('profiles')
    .select('learner_id, role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'student' || !profile.learner_id) {
    redirect('/');
  }

  // Validate lifecycle status
  const validation = await StudentValidationService.validateStudentAccess(user.id);

  if (!validation.allowed) {
    redirect(`/auth/login?reason=${validation.reason}`);
  }

  // Get student's learner profile
  const { data: learner } = await supabase
    .from('learners_profiles')
    .select('id')
    .eq('id', profile.learner_id)
    .single();

  if (!learner) {
    redirect('/');
  }

  return (
    <ContentLayout title="Profile Change Status">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learners Management' },
          { label: 'My Profile', href: '/learners/my-profile' },
          { label: 'Status & History' },
        ]}
      />
      <div className="mt-6">
        <ProfileStatusClient learnerId={learner.id} />
      </div>
    </ContentLayout>
  );
}
