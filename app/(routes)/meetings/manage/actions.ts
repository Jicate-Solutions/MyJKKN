'use server';

// app/(routes)/meetings/manage/actions.ts
//
// Server actions for the native "Manage Meeting Types" page — Phase N2: now
// CRUD on the IN-HOUSE meeting_types table (migration 20260611190000) instead
// of Cal.com's event-types API. No provisioning, no vaulted keys: the MyJKKN
// profile is the host identity and RLS (mt_host_all) scopes every operation
// to the signed-in user.
//
// The manager component's contract is preserved: listMyEventTypes /
// createMyEventType / updateMyEventType / deleteMyEventType returning
// ActionResult<ManageEventType>. ManageEventType.id changed number → string
// (native uuid).

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

// NOTE: repo compiles with strictNullChecks:false — flat optional-field shape,
// not a discriminated union.
export interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/** Subset of meeting-type fields the manage UI renders / round-trips. */
export interface ManageEventType {
  id: string;
  title: string;
  slug: string;
  lengthInMinutes: number;
  hidden: boolean;
  description: string | null;
}

/** Payload accepted by create / update from the client. */
export interface EventTypeFormInput {
  title: string;
  slug: string;
  lengthInMinutes: number;
  description?: string;
  /** Update-only: toggle visibility on the booking page. */
  hidden?: boolean;
}

// The native tables aren't in generated types yet — untyped client (TS2589 class).
async function untypedClient(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient;
}

async function getCurrentUserId(supabase: SupabaseClient): Promise<string> {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error('You are signed out. Please sign in to MyJKKN and try again.');
  }
  return user.id;
}

interface MeetingTypeRow {
  id: string;
  title: string;
  slug: string;
  duration_min: number;
  hidden: boolean;
  description: string | null;
}

function toManageEventType(row: MeetingTypeRow): ManageEventType {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    lengthInMinutes: row.duration_min,
    hidden: Boolean(row.hidden),
    description: row.description ?? null,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// INPUT NORMALISATION (unchanged from the Path-W version)
// ──────────────────────────────────────────────────────────────────────────

function normaliseSlug(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function validateForm(
  input: EventTypeFormInput,
): { ok: boolean; value?: { title: string; slug: string; duration_min: number; description?: string }; error?: string } {
  const title = input.title?.trim() ?? '';
  if (title.length === 0) return { ok: false, error: 'Title is required.' };
  if (title.length > 200) return { ok: false, error: 'Title is too long (max 200 characters).' };

  const slug = normaliseSlug(input.slug || title);
  if (slug.length === 0) {
    return { ok: false, error: 'Slug must contain at least one letter or number.' };
  }

  const len = Number(input.lengthInMinutes);
  if (!Number.isFinite(len) || len <= 0) {
    return { ok: false, error: 'Duration must be a positive number of minutes.' };
  }
  if (len > 1440) {
    return { ok: false, error: 'Duration cannot exceed 24 hours (1440 minutes).' };
  }

  const description = input.description?.trim();

  return {
    ok: true,
    value: {
      title,
      slug,
      duration_min: Math.round(len),
      ...(description ? { description } : {}),
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────
// ACTIONS
// ──────────────────────────────────────────────────────────────────────────

/** List the current user's meeting types (lean shape). */
export async function listMyEventTypes(): Promise<ActionResult<ManageEventType[]>> {
  try {
    const supabase = await untypedClient();
    const userId = await getCurrentUserId(supabase);

    const { data, error } = await supabase
      .from('meeting_types')
      .select('id, title, slug, duration_min, hidden, description')
      .eq('host_profile_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: true });
    if (error) {
      console.error('[meetings/manage] list failed:', error.message);
      return { success: false, error: 'Could not load your meeting types. Please try again.' };
    }
    return { success: true, data: (data ?? []).map(toManageEventType) };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Could not load your meeting types.',
    };
  }
}

/** Create a new meeting type for the current user. */
export async function createMyEventType(
  input: EventTypeFormInput,
): Promise<ActionResult<ManageEventType>> {
  const validated = validateForm(input);
  if (!validated.ok) return { success: false, error: validated.error };

  try {
    const supabase = await untypedClient();
    const userId = await getCurrentUserId(supabase);

    const { data, error } = await supabase
      .from('meeting_types')
      .insert({ host_profile_id: userId, ...validated.value })
      .select('id, title, slug, duration_min, hidden, description')
      .single();
    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'You already have a meeting type with that slug.' };
      }
      console.error('[meetings/manage] create failed:', error.message);
      return { success: false, error: 'Could not create the meeting type. Please try again.' };
    }
    return { success: true, data: toManageEventType(data) };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Could not create the meeting type.',
    };
  }
}

/** Update an existing meeting type. Partial — only provided fields change. */
export async function updateMyEventType(
  id: string,
  input: EventTypeFormInput,
): Promise<ActionResult<ManageEventType>> {
  if (!id || typeof id !== 'string') {
    return { success: false, error: 'Invalid meeting type reference.' };
  }
  const validated = validateForm(input);
  if (!validated.ok) return { success: false, error: validated.error };

  try {
    const supabase = await untypedClient();
    const userId = await getCurrentUserId(supabase);

    const patch: Record<string, unknown> = { ...validated.value };
    if (typeof input.hidden === 'boolean') patch.hidden = input.hidden;

    const { data, error } = await supabase
      .from('meeting_types')
      .update(patch)
      .eq('id', id)
      .eq('host_profile_id', userId)
      .select('id, title, slug, duration_min, hidden, description')
      .maybeSingle();
    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'You already have a meeting type with that slug.' };
      }
      console.error('[meetings/manage] update failed:', error.message);
      return { success: false, error: 'Could not update the meeting type. Please try again.' };
    }
    if (!data) {
      return { success: false, error: 'That meeting type no longer exists. Refresh the list and try again.' };
    }
    return { success: true, data: toManageEventType(data) };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Could not update the meeting type.',
    };
  }
}

/**
 * Delete a meeting type. Soft-delete (is_active = false) so historical
 * bookings keep their reference; the list action filters on is_active.
 */
export async function deleteMyEventType(id: string): Promise<ActionResult<{ id: string }>> {
  if (!id || typeof id !== 'string') {
    return { success: false, error: 'Invalid meeting type reference.' };
  }
  try {
    const supabase = await untypedClient();
    const userId = await getCurrentUserId(supabase);

    const { data, error } = await supabase
      .from('meeting_types')
      .update({ is_active: false })
      .eq('id', id)
      .eq('host_profile_id', userId)
      .select('id')
      .maybeSingle();
    if (error) {
      console.error('[meetings/manage] delete failed:', error.message);
      return { success: false, error: 'Could not delete the meeting type. Please try again.' };
    }
    if (!data) {
      return { success: false, error: 'That meeting type no longer exists. Refresh the list and try again.' };
    }
    return { success: true, data: { id } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Could not delete the meeting type.',
    };
  }
}
