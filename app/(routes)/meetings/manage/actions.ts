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

/** U1 (D4): where a meeting of this type happens. */
export type MeetingLocationMode = 'in_person' | 'phone' | 'online';

/** Subset of meeting-type fields the manage UI renders / round-trips. */
export interface ManageEventType {
  id: string;
  title: string;
  slug: string;
  lengthInMinutes: number;
  hidden: boolean;
  description: string | null;
  locationMode: MeetingLocationMode;
  locationText: string | null;
  // M2 slot rules — see the native slot engine (computeSlots).
  bufferBeforeMin: number;
  bufferAfterMin: number;
  minNoticeMin: number;
  /** null = back-to-back (engine uses duration as the step). */
  slotIntervalMin: number | null;
}

/** Payload accepted by create / update from the client. */
export interface EventTypeFormInput {
  title: string;
  slug: string;
  lengthInMinutes: number;
  description?: string;
  /** Update-only: toggle visibility on the booking page. */
  hidden?: boolean;
  /** U3 (D4): defaults to in_person when omitted (matches the DB default). */
  locationMode?: MeetingLocationMode;
  /** Free-text place for in_person (e.g. "Pharmacy block, Room 204"). */
  locationText?: string;
  // M2 slot rules (all optional — omitted fields keep the DB default).
  bufferBeforeMin?: number;
  bufferAfterMin?: number;
  minNoticeMin?: number;
  /** null/0 from the form → stored as NULL (back-to-back). */
  slotIntervalMin?: number | null;
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
  location_mode: MeetingLocationMode | null;
  location_text: string | null;
  buffer_before_min: number | null;
  buffer_after_min: number | null;
  min_notice_min: number | null;
  slot_interval_min: number | null;
}

/** Columns the manage actions select / round-trip (kept in one place). */
const MT_COLUMNS =
  'id, title, slug, duration_min, hidden, description, location_mode, location_text, buffer_before_min, buffer_after_min, min_notice_min, slot_interval_min';

function toManageEventType(row: MeetingTypeRow): ManageEventType {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    lengthInMinutes: row.duration_min,
    hidden: Boolean(row.hidden),
    description: row.description ?? null,
    locationMode: row.location_mode ?? 'in_person',
    locationText: row.location_text ?? null,
    bufferBeforeMin: row.buffer_before_min ?? 0,
    bufferAfterMin: row.buffer_after_min ?? 0,
    minNoticeMin: row.min_notice_min ?? 0,
    slotIntervalMin: row.slot_interval_min ?? null,
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

/** Coerce an optional integer field; returns null on null/undefined/non-number. */
function optInt(v: number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function validateForm(
  input: EventTypeFormInput,
): {
  ok: boolean;
  value?: {
    title: string;
    slug: string;
    duration_min: number;
    description?: string;
    location_mode: MeetingLocationMode;
    location_text: string | null;
    buffer_before_min: number;
    buffer_after_min: number;
    min_notice_min: number;
    slot_interval_min: number | null;
  };
  error?: string;
} {
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

  const locationMode = input.locationMode ?? 'in_person';
  if (!['in_person', 'phone', 'online'].includes(locationMode)) {
    return { ok: false, error: 'Invalid meeting location type.' };
  }
  const locationText = input.locationText?.trim().slice(0, 200);

  // ── M2 slot rules ──────────────────────────────────────────────────────────
  const bufferBefore = optInt(input.bufferBeforeMin) ?? 0;
  const bufferAfter = optInt(input.bufferAfterMin) ?? 0;
  const minNotice = optInt(input.minNoticeMin) ?? 0;
  if (bufferBefore < 0 || bufferAfter < 0) {
    return { ok: false, error: 'Buffers cannot be negative.' };
  }
  if (bufferBefore > 1440 || bufferAfter > 1440) {
    return { ok: false, error: 'A buffer cannot exceed 24 hours (1440 minutes).' };
  }
  if (minNotice < 0) {
    return { ok: false, error: 'Minimum notice cannot be negative.' };
  }
  if (minNotice > 525600) {
    return { ok: false, error: 'Minimum notice cannot exceed one year.' };
  }
  // 0 / blank → NULL = back-to-back (engine uses duration as the step).
  let slotInterval = optInt(input.slotIntervalMin);
  if (slotInterval !== null) {
    if (slotInterval <= 0) slotInterval = null;
    else if (slotInterval > 1440) {
      return { ok: false, error: 'Slot increment cannot exceed 24 hours (1440 minutes).' };
    }
  }

  return {
    ok: true,
    value: {
      title,
      slug,
      duration_min: Math.round(len),
      ...(description ? { description } : {}),
      location_mode: locationMode,
      // Only in-person meetings carry a free-text place; clear it otherwise.
      location_text: locationMode === 'in_person' && locationText ? locationText : null,
      buffer_before_min: bufferBefore,
      buffer_after_min: bufferAfter,
      min_notice_min: minNotice,
      slot_interval_min: slotInterval,
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
      .select(MT_COLUMNS)
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
      .select(MT_COLUMNS)
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
      .select(MT_COLUMNS)
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
