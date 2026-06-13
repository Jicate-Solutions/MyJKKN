/**
 * Server action for form submission.
 *
 * Wave 3 M9 follow-up. formBuilderService.submitForm() is still a stub
 * pending the workflow engine, so this action writes the row directly with
 * a minimal initial approval_history entry. The shape is forward-compatible
 * with the workflow engine landing in a follow-up PR — it can promote the
 * draft action call into the service without changing the wire format.
 */
'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function submitFormAction(
  formId: string,
  submissionData: Record<string, unknown>,
): Promise<Result<{ submissionId: string }>> {
  try {
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) {
      return { ok: false, error: 'You must be signed in to submit a form' };
    }

    const nowIso = new Date().toISOString();
    const initialHistory = [
      {
        step: 1,
        action: 'submit',
        actor_id: user.id,
        reason: 'Initial submission',
        at: nowIso,
      },
    ];

    const { data, error } = await supabase
      .from('hr_form_submissions')
      .insert({
        form_id: formId,
        submitted_by: user.id,
        submission_data: submissionData,
        current_step: 1,
        status: 'submitted',
        approval_history: initialHistory,
      })
      .select('id')
      .single();

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath('/hr/forms/inbox');
    return { ok: true, data: { submissionId: data!.id as string } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Failed to submit form',
    };
  }
}
