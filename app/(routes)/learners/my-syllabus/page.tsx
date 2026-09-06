/**
 * /learners/my-syllabus
 *
 * Lets a learner read the approved BoS syllabi for their own institution —
 * the first learner-facing surface over the curriculum. Everything a learner
 * needs already existed on the PDE curriculum connector; what was missing was
 * a way in. Scope ("own institution only", spec §4.9) is enforced in the DB by
 * fn_pde_list_approved_syllabi, not here — plain RLS on bos_course_syllabi
 * requires BoS board membership, which a learner never has.
 */

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { listApprovedSyllabi } from '@/lib/services/pde-curriculum-service';
import { SyllabusBrowser } from './_components/syllabus-browser';

export const dynamic = 'force-dynamic';

export default async function MySyllabusPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const adminClient = createServiceRoleClient();
  const { data: profile } = await adminClient
    .from('profiles')
    .select('role, learner_id')
    .eq('id', user.id)
    .single();

  // Rule 27: say why, never bounce silently to a landing page.
  if (profile?.role !== 'student' || !profile.learner_id) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold">My Syllabus</h1>
        <p className="mt-3 max-w-prose text-muted-foreground">
          This page is for enrolled learners. Your account is not linked to a
          learner record, so there is no syllabus to show. If you believe this
          is wrong, contact your department office.
        </p>
      </div>
    );
  }

  let syllabi = [];
  let loadError: string | null = null;
  try {
    syllabi = await listApprovedSyllabi();
  } catch {
    loadError = 'The syllabus list could not be loaded. Please try again.';
  }

  return (
    <div className="p-4 sm:p-6">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">My Syllabus</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Approved syllabi for your institution. Open a course to see what you
          are expected to be able to do by the end of it.
        </p>
      </header>
      {loadError ? (
        <p className="text-sm text-destructive">{loadError}</p>
      ) : (
        <SyllabusBrowser syllabi={syllabi} />
      )}
    </div>
  );
}
