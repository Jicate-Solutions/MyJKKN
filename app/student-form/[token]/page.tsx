// app/student-form/[token]/page.tsx
//
// Public — no auth required. Validates the token server-side; renders
// the wizard if valid; redirects to /expired with a reason if not.
// The /expired page deliberately leaks no learner data, so even with
// a malformed token the URL response is identical.

import { redirect } from 'next/navigation';
import { StudentFormService } from '@/lib/services/admission/student-form-service';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { WizardShell } from './_components/wizard-shell';
import { STUDENT_WRITABLE_COLUMNS } from '@/lib/services/admission/student-form-write-whitelist';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const READABLE_COLUMNS = [
  ...STUDENT_WRITABLE_COLUMNS.basic,
  ...STUDENT_WRITABLE_COLUMNS.academic,
  ...STUDENT_WRITABLE_COLUMNS.contact,
];

export default async function StudentFormPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let ctx;
  try {
    ctx = await StudentFormService.validateToken(decodeURIComponent(token));
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'invalid';
    redirect(`/student-form/${encodeURIComponent(token)}/expired?reason=${reason}`);
  }

  const svc = createServiceRoleClient();
  const { data: learner } = await (svc as any)
    .from('learners_profiles')
    .select(READABLE_COLUMNS.join(','))
    .eq('id', ctx.learner_profile_id)
    .single();

  return (
    <WizardShell
      token={decodeURIComponent(token)}
      learner={learner ?? {}}
      sectionProgress={ctx.section_progress}
      expiresAt={ctx.expires_at}
    />
  );
}
