'use server';

// app/(routes)/meetings/routing-forms/actions.ts
//
// Server actions for the Routing Forms admin — Universal Booking M1.
// Wraps RoutingFormService with the RLS-scoped server client. The signed-in
// MyJKKN profile is the host identity (host_profile_id = auth.uid()); RLS
// (routing_forms_* policies) scopes every operation. New tables aren't in
// generated types yet, so the service uses an untyped client internally
// (TS2589 class — feedback_ts2589_untyped_tables_and_strictnull_narrowing).

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import {
  RoutingFormService,
  type RoutingForm,
  type RoutingFormWithRules,
  type RoutingFormResponse,
  type RoutingField,
  type RuleInput,
  type UpdateRoutingFormInput,
} from '@/lib/services/meetings/routing-form-service';

export interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function rlsClient(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient;
}

async function requireUser(supabase: SupabaseClient): Promise<{ id: string; institutionId: string | null }> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error('You are signed out. Please sign in to MyJKKN and try again.');
  }
  // Best-effort institution for new forms (RLS still enforces scope).
  const { data: profile } = await supabase
    .from('profiles')
    .select('institution_id')
    .eq('id', user.id)
    .maybeSingle();
  return {
    id: user.id,
    institutionId: (profile?.institution_id as string | undefined) ?? null,
  };
}

export async function listRoutingForms(): Promise<ActionResult<RoutingForm[]>> {
  try {
    const supabase = await rlsClient();
    return await RoutingFormService.listForms(supabase);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to load forms.' };
  }
}

export async function getRoutingForm(id: string): Promise<ActionResult<RoutingFormWithRules>> {
  try {
    const supabase = await rlsClient();
    return await RoutingFormService.getFormWithRules(supabase, id);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to load form.' };
  }
}

export async function createRoutingForm(input: {
  slug: string;
  title: string;
  headline?: string;
  description?: string;
  fields?: RoutingField[];
}): Promise<ActionResult<RoutingForm>> {
  try {
    const supabase = await rlsClient();
    const user = await requireUser(supabase);

    if (!input.slug?.trim()) return { success: false, error: 'A URL slug is required.' };
    if (!input.title?.trim()) return { success: false, error: 'A title is required.' };

    const result = await RoutingFormService.createForm(supabase, {
      host_profile_id: user.id,
      institution_id: user.institutionId,
      slug: input.slug,
      title: input.title,
      headline: input.headline ?? null,
      description: input.description ?? null,
      fields: input.fields ?? [],
    });
    if (result.success) revalidatePath('/meetings/routing-forms');
    return result;
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to create form.' };
  }
}

export async function updateRoutingForm(
  id: string,
  patch: UpdateRoutingFormInput,
): Promise<ActionResult<RoutingForm>> {
  try {
    const supabase = await rlsClient();
    await requireUser(supabase);
    const result = await RoutingFormService.updateForm(supabase, id, patch);
    if (result.success) {
      revalidatePath('/meetings/routing-forms');
      revalidatePath(`/meetings/routing-forms/${id}`);
    }
    return result;
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to update form.' };
  }
}

export async function saveRoutingRules(
  formId: string,
  rules: RuleInput[],
): Promise<ActionResult<RoutingFormWithRules>> {
  try {
    const supabase = await rlsClient();
    await requireUser(supabase);
    const replaced = await RoutingFormService.replaceRules(supabase, formId, rules);
    if (!replaced.success) return { success: false, error: replaced.error };
    revalidatePath(`/meetings/routing-forms/${formId}`);
    return await RoutingFormService.getFormWithRules(supabase, formId);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to save rules.' };
  }
}

export async function deleteRoutingForm(id: string): Promise<ActionResult<true>> {
  try {
    const supabase = await rlsClient();
    await requireUser(supabase);
    const result = await RoutingFormService.deleteForm(supabase, id);
    if (result.success) revalidatePath('/meetings/routing-forms');
    return result;
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to delete form.' };
  }
}

export async function listRoutingResponses(
  formId: string,
): Promise<ActionResult<RoutingFormResponse[]>> {
  try {
    const supabase = await rlsClient();
    await requireUser(supabase);
    return await RoutingFormService.listResponses(supabase, formId);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to load responses.' };
  }
}
