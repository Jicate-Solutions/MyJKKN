/**
 * /learners/my-marks/result
 *
 * Server component shell. Validates student access, then renders the
 * client-side <ResultShell /> which loads the registration index and shows
 * published semester results semester-by-semester. The active semester is
 * driven by the `?semester=` search param — fully bookmarkable.
 */

import { redirect } from 'next/navigation';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { StudentValidationService } from '@/lib/services/auth/student-validation-service';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { ResultShell } from '../_components/result-shell';

interface PageProps {
  searchParams: Promise<{
    semester?: string;
  }>;
}

export default async function ResultPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const validation = await StudentValidationService.validateStudentAccess(user.id);
  if (!validation.allowed) {
    redirect(`/auth/login?reason=${validation.reason}`);
  }

  // Quick role check (avoid showing a "no profile" flash for non-students).
  const adminClient = createServiceRoleClient();
  const { data: profile } = await adminClient
    .from('profiles')
    .select('role, learner_id')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'student' || !profile.learner_id) {
    redirect('/');
  }

  return (
    <ContentLayout title="Marks" fullWidth>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learners' },
          { label: 'Marks' },
          { label: 'Result' },
        ]}
      />
      <div className="mt-0">
        <ResultShell initialSemester={params.semester} />
      </div>
    </ContentLayout>
  );
}
