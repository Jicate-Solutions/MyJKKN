// app/(routes)/learners/my-profile/status/[id]/page.tsx
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { StudentValidationService } from '@/lib/services/auth/student-validation-service';
import { LearnerProfileChangeService } from '@/lib/services/learner-profile-change-service';
import { RequestDetailView } from './_components/request-detail-view';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';

export const metadata = {
  title: 'Request Details | Profile Status',
  description: 'View details of your profile change request',
};

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function RequestDetailPage({ params }: PageProps) {
  const supabase = await createClient();
  const { id } = await params;

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

  // Fetch the change request
  const request = await LearnerProfileChangeService.getChangeRequest(id);

  if (!request) {
    notFound();
  }

  // Verify the request belongs to this student
  if (request.learner_id !== profile.learner_id) {
    redirect('/learners/my-profile/status');
  }

  return (
    <ContentLayout title="Request Details">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learners Management' },
          { label: 'My Profile', href: '/learners/my-profile' },
          { label: 'Status & History', href: '/learners/my-profile/status' },
          { label: 'Request Details' },
        ]}
      />
      <div className="mt-6">
        <RequestDetailView request={request} />
      </div>
    </ContentLayout>
  );
}
