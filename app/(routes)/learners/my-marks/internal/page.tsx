/**
 * /learners/my-marks/internal
 *
 * Server component shell. Validates student access, prefetches the
 * registrations index, and renders the client-side <InternalMarksShell />
 * with that data. URL search params drive every selection (semester,
 * sub-tab, CIA setting, round) — fully bookmarkable.
 */

import { redirect } from 'next/navigation';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { StudentValidationService } from '@/lib/services/auth/student-validation-service';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { InternalMarksShell } from '../_components/internal-marks-shell';

interface PageProps {
  searchParams: Promise<{
    semester?: string;
    subview?: string;
    setting?: string;
    round?: string;
  }>;
}

export default async function InternalMarksPage({ searchParams }: PageProps) {
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
        ]}
      />
      <div className="mt-0">
        <InternalMarksShell
          initialSemester={params.semester}
          initialSubview={(params.subview as 'assessment' | 'final') ?? 'assessment'}
          initialSetting={params.setting}
          initialRound={params.round ? Number(params.round) : undefined}
        />
      </div>
    </ContentLayout>
  );
}
