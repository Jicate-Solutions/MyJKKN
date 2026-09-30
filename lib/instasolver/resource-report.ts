// lib/instasolver/resource-report.ts
// ============================================================================
// Shared pieces of "scan a room's or an item's QR sticker to report a problem"
// — used by the scan page (app/(routes)/instasolver/r/[token]) and its API
// (app/api/instasolver/resource-report).
//
// Director ruling (30 Sep – 1 Oct 2026): the fastest way to report is a QR
// sticker in every room — room and item already filled in, a photo, tap send,
// about ten seconds. The list of places and items is Resource Management's
// `resources` table; the sticker carries `resources.qr_code_token`.
//
// Server-only: every read here uses the service-role client handed in by the
// caller, AFTER the caller has checked the person is signed in. The token is
// the only thing taken from the URL, and it is validated before any query.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';

/** A task in one of these states is finished; anything else is still open. */
export const TERMINAL_STATUS_KEYS = ['done', 'cancelled', 'archived'] as const;

/**
 * 'review' = the fixer has sent the finished-work photo and it waits for
 * sign-off (a sent-back job returns to 'in_progress'). A note added then would
 * reach a sign-off that was decided on the earlier photo, so a report in
 * 'review' is NOT joined — the new report gets its own task.
 */
export const AWAITING_SIGN_OFF_STATUS = 'review';

/** True when "Add to the open report" may add to a task in this state. */
export function isJoinableStatus(statusKey: string | null | undefined): boolean {
  if (!statusKey) return false;
  if ((TERMINAL_STATUS_KEYS as readonly string[]).includes(statusKey)) return false;
  return statusKey !== AWAITING_SIGN_OFF_STATUS;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** project_tasks ids are UUIDs; anything else is refused before a query. */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/**
 * Printed stickers always point at the production site. The page that prints
 * them may be opened from a preview or a local address, and a sticker that
 * encodes that address is dead once it is on the wall.
 */
export const STICKER_ORIGIN = 'https://www.jkkn.ai';

/** The URL a sticker's QR code opens. */
export function stickerUrl(token: string): string {
  return `${STICKER_ORIGIN}/instasolver/r/${encodeURIComponent(token)}`;
}
export const REPEAT_WINDOW_DAYS = 90;
/** "Reported N times" shows from this many reports in the window. */
export const REPEAT_BANNER_MIN = 2;
/** Upper bound on rows read for the repeat count — enough to say "50+". */
const REPEAT_READ_LIMIT = 50;

export const DESCRIPTION_MIN = 3;
export const DESCRIPTION_MAX = 500;

/**
 * Sticker tokens are `res_` + hex: 32 hex from the database trigger
 * (tg_resources_set_qr_token), 16 hex from qr-code-service's browser fallback.
 */
const TOKEN_PATTERN = /^res_[0-9a-f]{16,64}$/i;

export function isValidQrToken(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_PATTERN.test(token.trim());
}

export interface ScannedResource {
  id: string;
  name: string;
  institution_id: string | null;
  institution_name: string | null;
  category_name: string | null;
  subcategory_name: string | null;
  building_number: string | null;
  block_number: string | null;
  floor_number: string | null;
  room_number: string | null;
  caretaker_user_id: string | null;
  caretaker_user_ids: string[] | null;
}

/** "Building 2 · Block A · Floor 1 · Room 104" — only the parts that are recorded. */
export function formatPlace(r: {
  building_number?: string | null;
  block_number?: string | null;
  floor_number?: string | null;
  room_number?: string | null;
}): string {
  const part = (label: string, value?: string | null): string | null => {
    const v = (value ?? '').trim();
    if (!v) return null;
    // Don't write "Block Block A" when the value already says it.
    return v.toLowerCase().startsWith(label.toLowerCase()) ? v : `${label} ${v}`;
  };
  return [
    part('Building', r.building_number),
    part('Block', r.block_number),
    part('Floor', r.floor_number),
    part('Room', r.room_number)
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Where the fixer should go, as one line: the place, then the college. */
export function formatLocation(r: ScannedResource): string {
  return [formatPlace(r), r.institution_name].filter(Boolean).join(' — ') || r.name;
}

/** One line for the fix lane's list: item and place first, then what is wrong. */
export function buildReportTitle(r: ScannedResource, description: string): string {
  const place = formatPlace(r);
  const head = place ? `${r.name} (${place})` : r.name;
  const line = `${head} — ${description.trim()}`;
  return line.length > 160 ? `${line.slice(0, 157).trimEnd()}...` : line;
}

export async function loadResourceByToken(
  admin: SupabaseClient,
  token: string
): Promise<ScannedResource | null> {
  if (!isValidQrToken(token)) return null;
  const { data, error } = await admin
    .from('resources')
    .select(
      `id, name, institution_id, building_number, block_number, floor_number, room_number,
       caretaker_user_id, caretaker_user_ids,
       parent_category:resource_parent_categories(name),
       subcategory:resource_sub_categories(name),
       institution:institutions(name)`
    )
    .eq('qr_code_token', token.trim())
    .maybeSingle();
  if (error) {
    console.error('[instasolver] resource lookup by token failed:', error.message);
    throw new Error('lookup_failed');
  }
  if (!data) return null;
  const row = data as Record<string, any>;
  const one = (v: any) => (Array.isArray(v) ? v[0] : v) ?? null;
  return {
    id: row.id,
    name: row.name,
    institution_id: row.institution_id ?? null,
    institution_name: one(row.institution)?.name ?? null,
    category_name: one(row.parent_category)?.name ?? null,
    subcategory_name: one(row.subcategory)?.name ?? null,
    building_number: row.building_number ?? null,
    block_number: row.block_number ?? null,
    floor_number: row.floor_number ?? null,
    room_number: row.room_number ?? null,
    caretaker_user_id: row.caretaker_user_id ?? null,
    caretaker_user_ids: row.caretaker_user_ids ?? null
  };
}

export interface RecentReportRow {
  id: string;
  title: string | null;
  status_key: string;
  created_at: string;
  owner_staff_id: string | null;
}

export interface RecentReports {
  /** Reports on this resource in the last 90 days (capped at the read limit). */
  count: number;
  /** True when the read limit was hit, so the count is "at least". */
  capped: boolean;
  /** The newest report that can still take "Add to the open report", if any. */
  openTask: RecentReportRow | null;
}

/**
 * Pure: the newest row that can still be joined — open and not waiting for
 * sign-off (isJoinableStatus). Rows arrive newest first.
 */
export function pickOpenTask(rows: RecentReportRow[]): RecentReportRow | null {
  return rows.find((r) => isJoinableStatus(r.status_key)) ?? null;
}

/**
 * Campus Walk tasks filed against this resource in the last 90 days. Read
 * with a LIMIT rather than `count: 'exact'` — a jsonb-filtered exact count on
 * project_tasks can time out, and this is a hint on a screen, not a gate.
 */
export async function findRecentResourceReports(
  admin: SupabaseClient,
  resourceId: string,
  now: number = Date.now()
): Promise<RecentReports> {
  const since = new Date(now - REPEAT_WINDOW_DAYS * 86_400_000).toISOString();
  const { data, error } = await admin
    .from('project_tasks')
    .select('id, title, status_key, created_at, owner_staff_id')
    .eq('metadata->>resource_id', resourceId)
    .eq('metadata->>source', 'campus-walk')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(REPEAT_READ_LIMIT);
  if (error) {
    console.warn('[instasolver] recent-report lookup failed:', error.message);
    return { count: 0, capped: false, openTask: null };
  }
  const rows = (data ?? []) as RecentReportRow[];
  return {
    count: rows.length,
    capped: rows.length >= REPEAT_READ_LIMIT,
    openTask: pickOpenTask(rows)
  };
}
