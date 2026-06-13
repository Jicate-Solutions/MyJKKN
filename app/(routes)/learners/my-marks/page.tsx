/**
 * /learners/my-marks
 *
 * Server-rendered shell. Validates the student session, then redirects to
 * the Internal Marks tab (the only Phase 1 surface). The Result tab will
 * land alongside this when COE's final API is ready.
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { StudentValidationService } from '@/lib/services/auth/student-validation-service';

export default async function MyMarksRootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const validation = await StudentValidationService.validateStudentAccess(user.id);
  if (!validation.allowed) {
    redirect(`/auth/login?reason=${validation.reason}`);
  }

  redirect('/learners/my-marks/internal');
}
