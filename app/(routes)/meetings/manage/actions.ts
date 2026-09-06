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

/** Wave-3: event-type variant. */
export type MeetingKind = 'solo' | 'group' | 'collective' | 'round_robin';

/**
 * One place a meeting type can happen in (meeting_type_locations, migration
 * 20260830030000). A type used to hold exactly one location, which is why the
 * booking page carries records that differ only by where the meeting happens.
 */
export interface ManageEventTypeLocation {
  id: string;
  locationMode: MeetingLocationMode;
  locationText: string | null;
  locationResourceId: string | null;
  /** Resolved on read for display (room name). */
  locationResourceName: string | null;
  sortOrder: number;
}

/** Payload for adding one place to a meeting type. */
export interface EventTypeLocationInput {
  locationMode: MeetingLocationMode;
  /** in_person only: a "Spaces & Venues" resource id. */
  locationResourceId?: string | null;
  /** in_person only: custom place, used when no registry room is picked. */
  locationText?: string | null;
}

/** Subset of meeting-type fields the manage UI renders / round-trips. */
export interface ManageEventType {
  id: string;
  title: string;
  slug: string;
  lengthInMinutes: number;
  hidden: boolean;
  description: string | null;
  /** Grouping label; types sharing one are a single choice on the public page. */
  purposeGroup: string | null;
  locationMode: MeetingLocationMode;
  locationText: string | null;
  // Venue from Resource Management (PR1). When set, the in-person meeting happens
  // in this canonical "Spaces & Venues" room; locationText is the custom fallback.
  locationResourceId: string | null;
  /** Resolved on read for the manage list/picker display (room name). */
  locationResourceName: string | null;
  // M2 slot rules — see the native slot engine (computeSlots).
  bufferBeforeMin: number;
  bufferAfterMin: number;
  minNoticeMin: number;
  /** null = back-to-back (engine uses duration as the step). */
  slotIntervalMin: number | null;
  // ── Wave-3 variants + lifecycle (migration 20260619000100) ─────────────────
  kind: MeetingKind;
  /** group only: seats per slot (null otherwise). */
  capacity: number | null;
  /**
   * The host emails the manage form round-trips for collective (co-hosts) /
   * round_robin (pool). Resolved from profile ids on read.
   */
  hostEmails: string[];
  /** lifecycle: post-booking redirect target (null = default confirmation). */
  redirectUrl: string | null;
  /** lifecycle: free-text shown on the cancel page. */
  cancellationPolicy: string | null;
  // ── Wave-3 (B): paid bookings (migration 20260619100000) ─────────────────────
  /** when true, an attendee pays a Razorpay deposit before the booking confirms. */
  requiresDeposit: boolean;
  /** deposit to collect, in paise (e.g. ₹500 = 50000). null when no deposit. */
  depositAmountPaise: number | null;
  /**
   * Which set of the host's working hours this type is bookable in.
   * null = "my normal working hours" (the host's default schedule).
   */
  scheduleId: string | null;
  /**
   * Every place this type can happen in, in display order.
   *
   * `null` means the places table is not available on this database — migration
   * 20260830030000 ships as a file and is Director-gated, so until it is applied
   * there is nothing to manage and the UI hides the section entirely rather than
   * offering an Add button that cannot work (rule #27: never fail silently).
   */
  locations: ManageEventTypeLocation[] | null;
}

/** Payload accepted by create / update from the client. */
export interface EventTypeFormInput {
  title: string;
  slug: string;
  lengthInMinutes: number;
  description?: string;
  /** Update-only: toggle visibility on the booking page. */
  hidden?: boolean;
  /**
   * Optional grouping label. Types sharing a value are shown on the public
   * page as ONE choice (this text is its label) and the booker picks the
   * format second. Blank/omitted = stands alone under its own title.
   */
  purposeGroup?: string | null;
  /** U3 (D4): defaults to in_person when omitted (matches the DB default). */
  locationMode?: MeetingLocationMode;
  /** Free-text place for in_person (e.g. "Pharmacy block, Room 204"). */
  locationText?: string;
  /**
   * Venue from Resource Management (PR1): a "Spaces & Venues" resource id.
   * For in_person types the host picks a registry room OR types a custom place
   * (locationText) — one of the two is required (validated server-side).
   */
  locationResourceId?: string | null;
  // M2 slot rules (all optional — omitted fields keep the DB default).
  bufferBeforeMin?: number;
  bufferAfterMin?: number;
  minNoticeMin?: number;
  /** null/0 from the form → stored as NULL (back-to-back). */
  slotIntervalMin?: number | null;
  // ── Wave-3 variants + lifecycle ────────────────────────────────────────────
  /** defaults to 'solo' when omitted. */
  kind?: MeetingKind;
  /** group only: seats per slot. */
  capacity?: number | null;
  /** collective co-hosts / round_robin pool, as host emails (resolved server-side). */
  hostEmails?: string[];
  /** lifecycle: post-booking redirect (http(s) or root-relative). */
  redirectUrl?: string;
  /** lifecycle: cancel-page policy text. */
  cancellationPolicy?: string;
  // ── Wave-3 (B): paid bookings ────────────────────────────────────────────────
  /** when true, collect a deposit before confirming. */
  requiresDeposit?: boolean;
  /** deposit in paise (only meaningful when requiresDeposit). */
  depositAmountPaise?: number | null;
  /**
   * Which of the host's schedules this type is bookable in. null/omitted =
   * "my normal working hours" (the host's default schedule). Ownership is
   * verified server-side — a host cannot point a type at someone else's hours.
   */
  scheduleId?: string | null;
}

/** One choice in the "Which hours does this use?" picker. */
export interface ScheduleChoice {
  id: string;
  name: string;
  /** The host's default schedule — the "my normal working hours" option. */
  isDefault: boolean;
  /**
   * false = this schedule has no weekly hours set. A type pinned to it quietly
   * falls back to the host's normal hours (Director ruling, 2026-08-21), which
   * the picker says out loud rather than leaving the host to guess.
   */
  hasHours: boolean;
}

/** What the manage page needs to render the hours picker and the auto-move. */
export interface ScheduleChoices {
  /** The host's own schedules, default first. */
  schedules: ScheduleChoice[];
  /**
   * The one schedule that is clearly the host's ONLINE one, or null when there
   * is no such schedule or more than one candidate (ambiguous → do nothing).
   */
  onlineScheduleId: string | null;
}

/** Result of moving online meeting types onto the host's online hours. */
export interface OnlineHoursMoveResult {
  /** How many meeting types changed. 0 is a normal, non-error outcome. */
  moved: number;
  /** Name of the schedule they moved to; null when nothing moved. */
  scheduleName: string | null;
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
  /** Added 20260809090000 — absent on databases predating that migration. */
  purpose_group?: string | null;
  location_mode: MeetingLocationMode | null;
  location_text: string | null;
  // Venue-from-resource PR1 (migration 20260715000000) — absent pre-migration.
  location_resource_id?: string | null;
  buffer_before_min: number | null;
  buffer_after_min: number | null;
  min_notice_min: number | null;
  slot_interval_min: number | null;
  // Wave-3 columns (migration 20260619000100) — may be absent pre-migration.
  kind?: MeetingKind | null;
  capacity?: number | null;
  host_pool?: string[] | null;
  redirect_url?: string | null;
  cancellation_policy?: string | null;
  // Wave-3 (B) paid bookings (migration 20260619100000) — absent pre-migration.
  requires_deposit?: boolean | null;
  deposit_amount_paise?: number | null;
  /** Which host schedule this type is bookable in; null = the host's default. */
  schedule_id?: string | null;
}

/** Columns the manage actions select / round-trip (kept in one place). */
const MT_COLUMNS =
  'id, title, slug, duration_min, hidden, description, purpose_group, location_mode, location_text, location_resource_id, buffer_before_min, buffer_after_min, min_notice_min, slot_interval_min, kind, capacity, host_pool, redirect_url, cancellation_policy, requires_deposit, deposit_amount_paise, schedule_id';

/**
 * Base mapper; hostEmails (cohosts / pool) and locationResourceName (room name)
 * are enriched separately by the action via lookup.
 */
function toManageEventType(
  row: MeetingTypeRow,
  hostEmails: string[] = [],
  locationResourceName: string | null = null,
  locations: ManageEventTypeLocation[] | null = null,
): ManageEventType {
  const kind = row.kind ?? 'solo';
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    lengthInMinutes: row.duration_min,
    hidden: Boolean(row.hidden),
    description: row.description ?? null,
    purposeGroup: row.purpose_group ?? null,
    locationMode: row.location_mode ?? 'in_person',
    locationText: row.location_text ?? null,
    locationResourceId: row.location_resource_id ?? null,
    locationResourceName,
    bufferBeforeMin: row.buffer_before_min ?? 0,
    bufferAfterMin: row.buffer_after_min ?? 0,
    minNoticeMin: row.min_notice_min ?? 0,
    slotIntervalMin: row.slot_interval_min ?? null,
    kind: (['solo', 'group', 'collective', 'round_robin'] as const).includes(kind as MeetingKind)
      ? (kind as MeetingKind)
      : 'solo',
    capacity: row.capacity ?? null,
    hostEmails,
    redirectUrl: row.redirect_url ?? null,
    cancellationPolicy: row.cancellation_policy ?? null,
    requiresDeposit: Boolean(row.requires_deposit),
    depositAmountPaise: row.deposit_amount_paise ?? null,
    scheduleId: row.schedule_id ?? null,
    locations,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// PLACES — one meeting type, many locations (migration 20260830030000)
// ──────────────────────────────────────────────────────────────────────────

const MTL_COLUMNS =
  'id, meeting_type_id, location_mode, location_resource_id, location_text, sort_order';

interface MeetingTypeLocationRow {
  id: string;
  meeting_type_id: string;
  location_mode: MeetingLocationMode | null;
  location_resource_id: string | null;
  location_text: string | null;
  sort_order: number | null;
}

/** Resolve a batch of resource ids → room names for display (null-safe). */
async function resourceNamesForIds(
  supabase: SupabaseClient,
  ids: string[],
): Promise<Map<string, string>> {
  const clean = [...new Set(ids.filter(Boolean))];
  if (clean.length === 0) return new Map();
  const { data, error } = await supabase.from('resources').select('id, name').in('id', clean);
  if (error) {
    console.error('[meetings/manage] room name batch lookup failed:', error.message);
    return new Map();
  }
  return new Map((data ?? []).map((r) => [r.id as string, r.name as string]));
}

function toManageLocation(
  row: MeetingTypeLocationRow,
  roomNames: Map<string, string>,
): ManageEventTypeLocation {
  return {
    id: row.id,
    locationMode: row.location_mode ?? 'in_person',
    locationText: row.location_text ?? null,
    locationResourceId: row.location_resource_id ?? null,
    locationResourceName: row.location_resource_id
      ? roomNames.get(row.location_resource_id) ?? null
      : null,
    sortOrder: row.sort_order ?? 0,
  };
}

/**
 * Places for a batch of meeting types, grouped by type id.
 *
 * Returns `null` when the table cannot be read — migration 20260830030000 is
 * Director-gated, so on a database where it has not been applied the query
 * errors and the manage UI hides the Places section rather than showing an
 * empty list that is not the truth.
 */
async function placesForTypes(
  supabase: SupabaseClient,
  typeIds: string[],
): Promise<Map<string, ManageEventTypeLocation[]> | null> {
  if (typeIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('meeting_type_locations')
    .select(MTL_COLUMNS)
    .in('meeting_type_id', typeIds)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[meetings/manage] places load failed:', error.message);
    return null;
  }
  const rows = (data ?? []) as MeetingTypeLocationRow[];
  const roomNames = await resourceNamesForIds(
    supabase,
    rows.map((r) => r.location_resource_id).filter((id): id is string => Boolean(id)),
  );
  const byType = new Map<string, ManageEventTypeLocation[]>();
  for (const id of typeIds) byType.set(id, []);
  for (const row of rows) {
    byType.get(row.meeting_type_id)?.push(toManageLocation(row, roomNames));
  }
  return byType;
}

/** Throws unless the signed-in user owns this meeting type (RLS also enforces it). */
async function assertOwnsType(
  supabase: SupabaseClient,
  meetingTypeId: string,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('meeting_types')
    .select('id')
    .eq('id', meetingTypeId)
    .eq('host_profile_id', userId)
    .maybeSingle();
  if (error) {
    console.error('[meetings/manage] ownership check failed:', error.message);
    throw new Error('Could not verify that meeting type. Please try again.');
  }
  if (!data) throw new Error('That meeting type no longer exists. Refresh the list and try again.');
}

/**
 * True when this schedule is one of the signed-in host's own.
 *
 * The meeting_types.schedule_id foreign key points at meeting_host_schedules
 * without checking whose it is, so without this a host could pin a type to
 * someone else's working hours and read them back through the booking page.
 */
async function ownsSchedule(
  supabase: SupabaseClient,
  scheduleId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('meeting_host_schedules')
    .select('id')
    .eq('id', scheduleId)
    .eq('host_profile_id', userId)
    .maybeSingle();
  if (error) {
    console.error('[meetings/manage] schedule ownership check failed:', error.message);
    return false;
  }
  return Boolean(data);
}

/**
 * Normalise a place payload, or return the reason it is not usable.
 *
 * Flat optional-field shape, not a discriminated union — same reason as
 * validateForm above: the repo compiles with strictNullChecks:false, under
 * which `if (!x.ok)` does not narrow a `{ok:true}|{ok:false}` union.
 */
function normalisePlace(input: EventTypeLocationInput): {
  ok: boolean;
  value?: Omit<MeetingTypeLocationRow, 'id' | 'meeting_type_id' | 'sort_order'>;
  error?: string;
} {
  const mode = input.locationMode;
  if (mode !== 'in_person' && mode !== 'phone' && mode !== 'online') {
    return { ok: false, error: 'Pick where this meeting happens.' };
  }
  if (mode !== 'in_person') {
    // Phone and online carry no place of their own.
    return { ok: true, value: { location_mode: mode, location_resource_id: null, location_text: null } };
  }
  const resourceId = (input.locationResourceId ?? '').trim() || null;
  const text = (input.locationText ?? '').trim() || null;
  if (!resourceId && !text) {
    return { ok: false, error: 'Pick a room, or type a custom place, for an in-person meeting.' };
  }
  if (text && text.length > 200) {
    return { ok: false, error: 'Keep the place short (200 characters or fewer).' };
  }
  // A registry room supersedes free text, exactly as the meeting-type form does.
  return {
    ok: true,
    value: { location_mode: mode, location_resource_id: resourceId, location_text: resourceId ? null : text },
  };
}

/** Resolve a list of host emails → existing profile ids (silently drop unknowns). */
async function resolveHostEmails(
  supabase: SupabaseClient,
  emails: string[],
): Promise<string[]> {
  const clean = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (clean.length === 0) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email')
    .in('email', clean);
  if (error) {
    console.error('[meetings/manage] host email resolve failed:', error.message);
    return [];
  }
  return [...new Set((data ?? []).map((p) => p.id as string))];
}

/** Resolve profile ids → emails for round-tripping the manage form. */
async function emailsForProfileIds(
  supabase: SupabaseClient,
  ids: string[],
): Promise<string[]> {
  const clean = [...new Set(ids.filter(Boolean))];
  if (clean.length === 0) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email')
    .in('id', clean);
  if (error) {
    console.error('[meetings/manage] profile email lookup failed:', error.message);
    return [];
  }
  return (data ?? []).map((p) => p.email as string).filter(Boolean);
}

/** Resolve a "Spaces & Venues" resource id → its room name for display (null-safe). */
async function resourceNameForId(
  supabase: SupabaseClient,
  id: string | null | undefined,
): Promise<string | null> {
  if (!id) return null;
  const { data, error } = await supabase
    .from('resources')
    .select('name')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.error('[meetings/manage] resource name lookup failed:', error.message);
    return null;
  }
  return ((data as { name?: string } | null)?.name as string | undefined) ?? null;
}

/**
 * The host emails the manage form should show for a meeting type: collective →
 * its meeting_type_cohosts; round_robin → its host_pool. Excludes the owner.
 */
async function hostEmailsForType(
  supabase: SupabaseClient,
  row: MeetingTypeRow,
  ownerId: string,
): Promise<string[]> {
  const kind = row.kind ?? 'solo';
  if (kind === 'collective') {
    const { data } = await supabase
      .from('meeting_type_cohosts')
      .select('cohost_profile_id')
      .eq('meeting_type_id', row.id);
    const ids = (data ?? [])
      .map((r) => r.cohost_profile_id as string)
      .filter((id) => id !== ownerId);
    return emailsForProfileIds(supabase, ids);
  }
  if (kind === 'round_robin') {
    const ids = (row.host_pool ?? []).filter((id) => id && id !== ownerId);
    return emailsForProfileIds(supabase, ids);
  }
  return [];
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
    purpose_group: string | null;
    location_mode: MeetingLocationMode;
    location_text: string | null;
    location_resource_id: string | null;
    buffer_before_min: number;
    buffer_after_min: number;
    min_notice_min: number;
    slot_interval_min: number | null;
    // Wave-3 columns (host_pool is filled by the action after email resolution).
    kind: MeetingKind;
    capacity: number | null;
    redirect_url: string | null;
    cancellation_policy: string | null;
    requires_deposit: boolean;
    deposit_amount_paise: number | null;
    /** null = the host's default schedule ("my normal working hours"). */
    schedule_id: string | null;
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
  // Blank or whitespace-only means "no group" — store NULL rather than an
  // empty string, or the public page would build a group with a blank label.
  const purposeGroup = (input.purposeGroup ?? '').trim() || null;

  const locationMode = input.locationMode ?? 'in_person';
  if (!['in_person', 'phone', 'online'].includes(locationMode)) {
    return { ok: false, error: 'Invalid meeting location type.' };
  }
  const locationText = input.locationText?.trim().slice(0, 200);

  // Venue-from-resource PR1: a "Spaces & Venues" room id, or a custom place
  // (locationText). One of the two is REQUIRED for in-person meetings so the
  // booking page never shows a bare "In person" with no directions again.
  const rawResourceId = (input.locationResourceId ?? '').trim();
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (rawResourceId && !uuidRe.test(rawResourceId)) {
    return { ok: false, error: 'Invalid venue selection.' };
  }
  // Only in-person meetings carry a venue at all; clear both for phone/online.
  const locationResourceId =
    locationMode === 'in_person' && rawResourceId ? rawResourceId : null;
  const resolvedLocationText =
    locationMode === 'in_person' && locationText ? locationText : null;
  if (locationMode === 'in_person' && !locationResourceId && !resolvedLocationText) {
    return {
      ok: false,
      error: 'Pick a venue from the list, or type a custom place, for in-person meetings.',
    };
  }

  // Which working hours this type is bookable in. Blank/omitted = the host's
  // normal (default) hours, stored as NULL. Shape only here — that the schedule
  // actually belongs to the caller is checked against the database in the
  // create/update actions, where the signed-in user id is known.
  const rawScheduleId = (input.scheduleId ?? '').trim();
  if (rawScheduleId && !uuidRe.test(rawScheduleId)) {
    return { ok: false, error: 'Invalid working-hours selection.' };
  }
  const scheduleId = rawScheduleId || null;

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

  // ── Wave-3 variant + lifecycle ───────────────────────────────────────────────
  const kind = input.kind ?? 'solo';
  if (!['solo', 'group', 'collective', 'round_robin'].includes(kind)) {
    return { ok: false, error: 'Invalid booking type.' };
  }
  // capacity only meaningful for group; clamp + default to 1 there, null otherwise.
  let capacity: number | null = null;
  if (kind === 'group') {
    const c = optInt(input.capacity) ?? 1;
    if (c < 1) return { ok: false, error: 'Group capacity must be at least 1.' };
    if (c > 1000) return { ok: false, error: 'Group capacity cannot exceed 1000.' };
    capacity = c;
  }

  // redirect_url: allow only absolute http(s) or root-relative paths.
  let redirectUrl: string | null = null;
  const rawRedirect = input.redirectUrl?.trim() ?? '';
  if (rawRedirect) {
    if (rawRedirect.length > 2000) {
      return { ok: false, error: 'Redirect URL is too long (max 2000 characters).' };
    }
    if (!/^https?:\/\//i.test(rawRedirect) && !/^\/[^/]/.test(rawRedirect)) {
      return {
        ok: false,
        error: 'Redirect URL must start with http(s):// or be a path beginning with /.',
      };
    }
    redirectUrl = rawRedirect;
  }

  const cancellationPolicy = input.cancellationPolicy?.trim().slice(0, 2000) || null;

  // ── Wave-3 (B): paid bookings ────────────────────────────────────────────────
  // A deposit needs a positive amount; clear both when not required so a type
  // toggled off doesn't carry a stale amount. Range mirrors the DB CHECK
  // (100..10000000 paise = ₹1..₹100000).
  const requiresDeposit = input.requiresDeposit === true;
  let depositAmountPaise: number | null = null;
  if (requiresDeposit) {
    const paise = optInt(input.depositAmountPaise);
    if (paise === null || paise < 100) {
      return { ok: false, error: 'Enter a deposit amount of at least ₹1.' };
    }
    if (paise > 10000000) {
      return { ok: false, error: 'Deposit cannot exceed ₹1,00,000.' };
    }
    depositAmountPaise = paise;
  }

  return {
    ok: true,
    value: {
      title,
      slug,
      duration_min: Math.round(len),
      ...(description ? { description } : {}),
      purpose_group: purposeGroup,
      location_mode: locationMode,
      // Only in-person meetings carry a venue; both cleared otherwise (above).
      location_text: resolvedLocationText,
      location_resource_id: locationResourceId,
      buffer_before_min: bufferBefore,
      buffer_after_min: bufferAfter,
      min_notice_min: minNotice,
      slot_interval_min: slotInterval,
      kind,
      capacity,
      redirect_url: redirectUrl,
      cancellation_policy: cancellationPolicy,
      requires_deposit: requiresDeposit,
      deposit_amount_paise: depositAmountPaise,
      schedule_id: scheduleId,
    },
  };
}

/**
 * Replace a collective meeting type's co-host set with exactly `cohostIds`
 * (the owner is implicit and never stored here). Idempotent: deletes rows no
 * longer present, inserts new ones. Non-fatal on error (the type still saves).
 */
async function syncCohosts(
  supabase: SupabaseClient,
  meetingTypeId: string,
  cohostIds: string[],
): Promise<void> {
  const want = new Set(cohostIds.filter(Boolean));
  const { data: existing } = await supabase
    .from('meeting_type_cohosts')
    .select('cohost_profile_id')
    .eq('meeting_type_id', meetingTypeId);
  const have = new Set((existing ?? []).map((r) => r.cohost_profile_id as string));

  const toAdd = [...want].filter((id) => !have.has(id));
  const toRemove = [...have].filter((id) => !want.has(id));

  if (toRemove.length) {
    await supabase
      .from('meeting_type_cohosts')
      .delete()
      .eq('meeting_type_id', meetingTypeId)
      .in('cohost_profile_id', toRemove);
  }
  if (toAdd.length) {
    await supabase
      .from('meeting_type_cohosts')
      .insert(toAdd.map((cohost_profile_id) => ({ meeting_type_id: meetingTypeId, cohost_profile_id })));
  }
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
    const rows = (data ?? []) as MeetingTypeRow[];
    // One batched read for every type's places (null = migration not applied).
    const placesByType = await placesForTypes(supabase, rows.map((r) => r.id));
    const enriched = await Promise.all(
      rows.map(async (row) => {
        const [hostEmails, locationResourceName] = await Promise.all([
          hostEmailsForType(supabase, row, userId),
          resourceNameForId(supabase, row.location_resource_id),
        ]);
        return toManageEventType(
          row,
          hostEmails,
          locationResourceName,
          placesByType ? placesByType.get(row.id) ?? [] : null,
        );
      }),
    );
    return { success: true, data: enriched };
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

    const pinnedSchedule = validated.value!.schedule_id;
    if (pinnedSchedule && !(await ownsSchedule(supabase, pinnedSchedule, userId))) {
      return { success: false, error: 'Those working hours are not yours to use.' };
    }

    // Resolve collective/round_robin host emails → ids (unknowns dropped),
    // excluding the owner (who is always implicitly included).
    const resolvedIds =
      validated.value!.kind === 'collective' || validated.value!.kind === 'round_robin'
        ? (await resolveHostEmails(supabase, input.hostEmails ?? [])).filter((id) => id !== userId)
        : [];
    const hostPool = validated.value!.kind === 'round_robin' ? resolvedIds : null;

    const { data, error } = await supabase
      .from('meeting_types')
      .insert({ host_profile_id: userId, ...validated.value, host_pool: hostPool })
      .select(MT_COLUMNS)
      .single();
    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'You already have a meeting type with that slug.' };
      }
      console.error('[meetings/manage] create failed:', error.message);
      return { success: false, error: 'Could not create the meeting type. Please try again.' };
    }
    if (validated.value!.kind === 'collective') {
      await syncCohosts(supabase, (data as MeetingTypeRow).id, resolvedIds);
    }
    const [hostEmails, locationResourceName, placesByType] = await Promise.all([
      hostEmailsForType(supabase, data as MeetingTypeRow, userId),
      resourceNameForId(supabase, (data as MeetingTypeRow).location_resource_id),
      placesForTypes(supabase, [(data as MeetingTypeRow).id]),
    ]);
    return {
      success: true,
      data: toManageEventType(
        data as MeetingTypeRow,
        hostEmails,
        locationResourceName,
        placesByType ? placesByType.get((data as MeetingTypeRow).id) ?? [] : null,
      ),
    };
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

    const pinnedSchedule = validated.value!.schedule_id;
    if (pinnedSchedule && !(await ownsSchedule(supabase, pinnedSchedule, userId))) {
      return { success: false, error: 'Those working hours are not yours to use.' };
    }

    const kind = validated.value!.kind;
    const resolvedIds =
      kind === 'collective' || kind === 'round_robin'
        ? (await resolveHostEmails(supabase, input.hostEmails ?? [])).filter((hid) => hid !== userId)
        : [];
    // host_pool is meaningful only for round_robin; clear it for other kinds so
    // a type switched away from round_robin doesn't carry a stale pool.
    const hostPool = kind === 'round_robin' ? resolvedIds : null;

    const patch: Record<string, unknown> = { ...validated.value, host_pool: hostPool };
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
    // Collective → sync co-hosts to exactly resolvedIds; any other kind → clear them.
    await syncCohosts(supabase, id, kind === 'collective' ? resolvedIds : []);
    const [hostEmails, locationResourceName, placesByType] = await Promise.all([
      hostEmailsForType(supabase, data as MeetingTypeRow, userId),
      resourceNameForId(supabase, (data as MeetingTypeRow).location_resource_id),
      placesForTypes(supabase, [(data as MeetingTypeRow).id]),
    ]);
    return {
      success: true,
      data: toManageEventType(
        data as MeetingTypeRow,
        hostEmails,
        locationResourceName,
        placesByType ? placesByType.get((data as MeetingTypeRow).id) ?? [] : null,
      ),
    };
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

// ──────────────────────────────────────────────────────────────────────────
// WORKING HOURS — which schedule a meeting type is bookable in
// ──────────────────────────────────────────────────────────────────────────

/**
 * A schedule name that clearly means "this is where my ONLINE meetings live".
 * Deliberately narrow: the auto-move below only runs when EXACTLY ONE of the
 * host's non-default schedules matches, so a guess is never acted on.
 */
const ONLINE_SCHEDULE_NAME = /\b(online|virtual|remote|meet|zoom|teams)\b/i;

/**
 * The host's own schedules, for the "Which hours does this use?" picker.
 * Default first — that is the "my normal working hours" option.
 */
export async function listMyScheduleChoices(): Promise<ActionResult<ScheduleChoices>> {
  try {
    const supabase = await untypedClient();
    const userId = await getCurrentUserId(supabase);

    const { data, error } = await supabase
      .from('meeting_host_schedules')
      .select('id, name, is_default')
      .eq('host_profile_id', userId)
      .order('created_at', { ascending: true });
    if (error) {
      console.error('[meetings/manage] schedule list failed:', error.message);
      return { success: false, error: 'Could not load your working hours. Please try again.' };
    }
    const rows = (data ?? []) as Array<{ id: string; name: string; is_default: boolean | null }>;

    // One batched read: which of these schedules have any weekly hours at all.
    const withHours = new Set<string>();
    if (rows.length > 0) {
      const { data: windows, error: wErr } = await supabase
        .from('meeting_schedule_windows')
        .select('schedule_id')
        .in('schedule_id', rows.map((r) => r.id));
      if (wErr) {
        console.error('[meetings/manage] schedule hours lookup failed:', wErr.message);
      } else {
        for (const w of windows ?? []) withHours.add(w.schedule_id as string);
      }
    }

    // Stable sort: the default rises to the top, everything else keeps its
    // creation order.
    const schedules: ScheduleChoice[] = rows
      .map((r) => ({
        id: r.id,
        name: r.name,
        isDefault: Boolean(r.is_default),
        hasHours: withHours.has(r.id),
      }))
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));

    const onlineCandidates = schedules.filter(
      (s) => !s.isDefault && ONLINE_SCHEDULE_NAME.test(s.name),
    );

    return {
      success: true,
      data: {
        schedules,
        // Exactly one candidate, or nothing — two candidates is ambiguous and
        // the host must choose for themselves.
        onlineScheduleId: onlineCandidates.length === 1 ? onlineCandidates[0].id : null,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Could not load your working hours.',
    };
  }
}

/**
 * Put the host's ONLINE meeting types on their online working hours.
 *
 * Explicit and host-triggered — never a background sweep, never a migration.
 * Safe to run twice: only types still on "my normal working hours"
 * (schedule_id IS NULL) move, so a second run matches nothing, and a type the
 * host deliberately pinned elsewhere is left exactly where they put it.
 * Scoped to the signed-in host's own types by host_profile_id (and by RLS).
 */
export async function moveOnlineMeetingsToOnlineHours(): Promise<
  ActionResult<OnlineHoursMoveResult>
> {
  try {
    const supabase = await untypedClient();
    const userId = await getCurrentUserId(supabase);

    const choices = await listMyScheduleChoices();
    if (!choices.success) return { success: false, error: choices.error };

    const targetId = choices.data.onlineScheduleId;
    // No online schedule, or more than one candidate → do nothing, and say so.
    if (!targetId) return { success: true, data: { moved: 0, scheduleName: null } };
    const targetName = choices.data.schedules.find((s) => s.id === targetId)?.name ?? null;

    const { data, error } = await supabase
      .from('meeting_types')
      .update({ schedule_id: targetId })
      .eq('host_profile_id', userId)
      .eq('location_mode', 'online')
      .eq('is_active', true)
      .is('schedule_id', null)
      .select('id');
    if (error) {
      console.error('[meetings/manage] online-hours move failed:', error.message);
      return {
        success: false,
        error: 'Could not move your online meeting types. Please try again.',
      };
    }

    const moved = (data ?? []).length;
    return { success: true, data: { moved, scheduleName: moved > 0 ? targetName : null } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Could not move your online meeting types.',
    };
  }
}

// ──────────────────────────────────────────────────────────────────────────
// PLACE ACTIONS — one meeting type, many places
// ──────────────────────────────────────────────────────────────────────────

/**
 * Add one place to a meeting type.
 *
 * Additive only: the type's legacy location_* columns are NOT touched, so the
 * booking page keeps rendering exactly what it renders today. New places sort
 * after the backfilled one (which carries sort_order 0).
 */
export async function addMyEventTypeLocation(
  meetingTypeId: string,
  input: EventTypeLocationInput,
): Promise<ActionResult<ManageEventTypeLocation>> {
  if (!meetingTypeId || typeof meetingTypeId !== 'string') {
    return { success: false, error: 'Invalid meeting type reference.' };
  }
  const place = normalisePlace(input);
  if (!place.ok) return { success: false, error: place.error };

  try {
    const supabase = await untypedClient();
    const userId = await getCurrentUserId(supabase);
    await assertOwnsType(supabase, meetingTypeId, userId);

    // Append after the places already on this type.
    const { data: last } = await supabase
      .from('meeting_type_locations')
      .select('sort_order')
      .eq('meeting_type_id', meetingTypeId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    const sortOrder = ((last as { sort_order?: number } | null)?.sort_order ?? -1) + 1;

    const { data, error } = await supabase
      .from('meeting_type_locations')
      .insert({ meeting_type_id: meetingTypeId, ...place.value, sort_order: sortOrder })
      .select(MTL_COLUMNS)
      .single();
    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'That place is already on this meeting type.' };
      }
      console.error('[meetings/manage] add place failed:', error.message);
      return { success: false, error: 'Could not add that place. Please try again.' };
    }
    const row = data as MeetingTypeLocationRow;
    const roomNames = await resourceNamesForIds(
      supabase,
      row.location_resource_id ? [row.location_resource_id] : [],
    );
    return { success: true, data: toManageLocation(row, roomNames) };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Could not add that place.',
    };
  }
}

/**
 * Remove one place from a meeting type. Hard delete — a place is a choice on
 * the booking page, not a record with history; existing bookings keep their own
 * venue fields on meeting_bookings.
 */
export async function removeMyEventTypeLocation(
  meetingTypeId: string,
  locationId: string,
): Promise<ActionResult<{ id: string }>> {
  if (!meetingTypeId || typeof meetingTypeId !== 'string' || !locationId || typeof locationId !== 'string') {
    return { success: false, error: 'Invalid place reference.' };
  }
  try {
    const supabase = await untypedClient();
    const userId = await getCurrentUserId(supabase);
    await assertOwnsType(supabase, meetingTypeId, userId);

    const { data, error } = await supabase
      .from('meeting_type_locations')
      .delete()
      .eq('id', locationId)
      .eq('meeting_type_id', meetingTypeId)
      .select('id')
      .maybeSingle();
    if (error) {
      console.error('[meetings/manage] remove place failed:', error.message);
      return { success: false, error: 'Could not remove that place. Please try again.' };
    }
    if (!data) {
      return { success: false, error: 'That place is already gone. Refresh and try again.' };
    }
    return { success: true, data: { id: locationId } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Could not remove that place.',
    };
  }
}
