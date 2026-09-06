/**
 * Server actions for the form builder client.
 *
 * Wave 3 M9 follow-up. Wraps formBuilderService with the server-side Supabase
 * client so RLS enforces the super_admin gate per Director lock R5-Q2.
 */
'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { formBuilderService } from '@/lib/services/hr/form-builder-service';
import type { Widget } from '@/types/hr-forms';

type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function saveDraftAction(
  formId: string,
  widgets: Widget[],
  reason: string,
): Promise<Result<{ formId: string }>> {
  try {
    const supabase = await createClient();
    await formBuilderService.updateFormSchema(supabase, formId, widgets, reason);
    revalidatePath(`/hr/admin/forms/${formId}/builder`);
    return { ok: true, data: { formId } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Failed to save draft',
    };
  }
}

export async function publishAction(
  formId: string,
  reason: string,
): Promise<Result<{ formId: string }>> {
  try {
    const supabase = await createClient();
    await formBuilderService.publishForm(supabase, formId, reason);
    revalidatePath(`/hr/admin/forms/${formId}/builder`);
    revalidatePath('/hr/admin/forms');
    return { ok: true, data: { formId } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Failed to publish',
    };
  }
}
