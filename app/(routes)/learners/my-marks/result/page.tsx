/**
 * /learners/my-marks/result
 *
 * Phase 1 stub for Semester Result. The page renders the same top tab
 * switcher (Internal | Result) and a "Coming Soon" card. Phase 2 will
 * replace the card body with real subject-by-subject result data when
 * the COE result endpoint is shared.
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { StudentValidationService } from '@/lib/services/auth/student-validation-service';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { ResultShell } from '../_components/result-shell';

export default async function ResultPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const validation = await StudentValidationService.validateStudentAccess(user.id);
  if (!validation.allowed) {
    redirect(`/auth/login?reason=${validation.reason}`);
  }

  return (
    <ContentLayout title="Marks">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learners' },
          { label: 'Marks' },
          { label: 'Result' },
        ]}
      />
      <div className="mt-2">
        <ResultShell />
      </div>
    </ContentLayout>
  );
}
