// lib/mcp/personal-door.ts
//
// The outside-AI door for PERSONAL keys (jkkn_pk_…), made by a person for
// themselves on /ai-query/connect.
//
// What differs from an administrator's key (lib/mcp/auth-bridge.ts):
//   - The tools come from the catalog (fn_ai_tool_menu 'door'), filtered to
//     what the key's OWNER may use — not the 12 hand-written tools.
//   - Every tool runs AS THE OWNER through their own minted session
//     (lib/ai-tools/run-as-user.ts). The service-role client is used for ONE
//     thing only: looking the key up by its hash, the same way every other key
//     is verified. It never runs a tool.
//   - Every tool call is audit-logged (who = the key, which tool, when, the
//     outcome — never the arguments or the data) and every request is
//     rate-limited, with the existing logger and limiter.
//   - ONE write exists (8 Oct 2026): schedule_meeting, listed only when the
//     owner switched booking on for THIS key (ai_personal_key_booking_grants,
//     20271008150000). It books on the OWNER's calendar only — the host is the
//     key's user_id, never a value from the caller — through
//     HostSchedulingService.scheduleDirect, the same path as /meetings/schedule.
//     That service needs the service-role client by design (it writes
//     meeting_bookings for the host and reads invitees' profiles); it is used
//     only after the owner's identity and meetings access are fixed.

import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/api-keys/rate-limiter';
import { logApiUsage } from '@/lib/api-keys/audit-logger';
import { AccountOffError, getUserSessionClient } from '@/lib/ai-tools/run-as-user';
import {
  callRpcTool,
  fetchToolMenu,
  publicInputSchema,
  ToolArgsError,
  type CatalogTool,
} from '@/lib/ai-tools/catalog';
import { mcpError, mcpSuccess, type McpToolResult } from '@/lib/mcp/tool-helpers';
import {
  CAMPUS_TZ,
  HostSchedulingService,
  type HostMeetingLocationMode,
  type ScheduleAttendee,
} from '@/lib/services/meetings/host-scheduling-service';
import { zonedToUtc } from '@/lib/services/meetings/native-slot-engine';
import { after } from 'next/server';

/** Every personal key starts with this; admin keys are `jkkn_` + 32 hex characters. */
export const PERSONAL_KEY_PREFIX = 'jkkn_pk_';

/** Largest tool answer handed back, in characters. Bigger answers are cut with a note. */
export const MAX_RESULT_CHARS = 100_000;

/**
 * Most rows one door call may ask for. Many functions default p_limit to
 * 10,000; the door sends at most this many (and this many when the outside AI
 * leaves p_limit out). The character cut above stays as a second guard.
 */
export const DOOR_MAX_LIMIT = 500;

/** A refusal the door returns to the outside AI as a tool error (never a crash). */
export class DoorRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DoorRefusal';
  }
}

export function isPersonalKeyToken(token: string | undefined | null): token is string {
  return typeof token === 'string' && token.startsWith(PERSONAL_KEY_PREFIX);
}

export interface PersonalKeyContext {
  keyId: string;
  keyName: string;
  ownerId: string;
  institutionId: string | null;
  /** The owner switched booking on for this key (fails closed to false). */
  canBookMeetings: boolean;
}

/**
 * Looks a personal key up by its SHA-256 hash. Returns undefined for an
 * unknown, turned-off, expired or non-personal key.
 */
export async function verifyPersonalMcpToken(token: string): Promise<PersonalKeyContext | undefined> {
  if (!isPersonalKeyToken(token)) return undefined;

  const hashedKey = createHash('sha256').update(token).digest('hex');
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from('api_keys')
    .select('id, name, user_id, institution_id, is_active, expires_at, key_kind')
    .eq('key_value', hashedKey)
    .eq('key_kind', 'personal')
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) return undefined;
  const row = data as {
    id: string;
    name: string;
    user_id: string | null;
    institution_id: string | null;
    is_active: boolean | null;
    expires_at: string | null;
    key_kind: string;
  };
  if (row.key_kind !== 'personal' || row.is_active !== true || !row.user_id) return undefined;
  if (!row.expires_at || new Date(row.expires_at).getTime() <= Date.now()) return undefined;

  void Promise.resolve(
    supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', row.id)
  )
    .then(() => {})
    .catch(() => {});

  return {
    keyId: row.id,
    keyName: row.name,
    ownerId: row.user_id,
    institutionId: row.institution_id,
    canBookMeetings: await keyMayBook(supabase as unknown as SupabaseClient, row.id),
  };
}

/** Whether the owner switched booking on for this key. Any error reads as no. */
async function keyMayBook(supabase: SupabaseClient, keyId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('ai_personal_key_booking_grants')
      .select('active')
      .eq('key_id', keyId)
      .maybeSingle();
    return !error && (data as { active?: boolean } | null)?.active === true;
  } catch {
    return false;
  }
}

// ─── schedule_meeting ──────────────────────────────────────────────────────

export const SCHEDULE_TOOL_NAME = 'schedule_meeting';

const LOCATION_MODES: HostMeetingLocationMode[] = ['online', 'phone', 'in_person'];
const MAX_DURATION_MIN = 480;

/**
 * Limits on the one write the door allows (deep review, 8 Oct 2026). A leaked
 * booking key must not be able to flood a calendar or mass-invite people.
 *   - per booking: at most MAX_ATTENDEES invitees, of whom at most
 *     MAX_OUTSIDE are outside JKKN, and only when allow_outside is true;
 *   - per key: at most BOOKINGS_PER_HOUR / BOOKINGS_PER_DAY bookings;
 *   - per owner: at most INVITEES_PER_DAY invitees through the door in 24 h.
 * The per-key and per-owner limits are RESERVED in the database before booking
 * (fn_ai_booking_reserve, per-owner advisory lock), so parallel or retried
 * calls cannot all pass. A reservation is released only when booking
 * definitely wrote nothing; an error or a timeout keeps it counted.
 */
export const BOOKING_LIMITS = {
  MAX_ATTENDEES: 20,
  MAX_OUTSIDE: 5,
  BOOKINGS_PER_HOUR: 20,
  BOOKINGS_PER_DAY: 60,
  INVITEES_PER_DAY: 150,
  MAX_TITLE: 200,
  MAX_NOTE: 2000,
  MAX_NAME: 120,
  MAX_DAYS_AHEAD: 366,
  /** How long the door waits for the booking before saying "check the inbox". */
  BOOKING_TIMEOUT_MS: 25_000,
  /** How long the steps BEFORE booking (reserve, link invitees, re-check) may take. */
  PREPARE_TIMEOUT_MS: 15_000,
} as const;
const MAX_ATTENDEES = BOOKING_LIMITS.MAX_ATTENDEES;
/** Invitees at these domains are JKKN people; anyone else is "outside". */
const JKKN_DOMAINS = ['jkkn.ac.in'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isOutsideJkkn(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  return !JKKN_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/** The tool as the outside AI sees it. Listed only for a key allowed to book. */
export const SCHEDULE_TOOL = {
  name: SCHEDULE_TOOL_NAME,
  description:
    "Book a meeting on the key owner's own MyJKKN calendar and send the invitations, exactly as the owner would on Meetings > Schedule. " +
    'Times are India time (Asia/Kolkata). Fails with "slot taken" when the owner already has a meeting then.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      title: { type: 'string', description: 'What the meeting is called.' },
      start_local: {
        type: 'string',
        description: 'Start in India time, as YYYY-MM-DDTHH:MM, for example 2026-10-08T15:30.',
      },
      duration_min: { type: 'integer', minimum: 5, maximum: MAX_DURATION_MIN, description: 'Length in minutes.' },
      location_mode: { type: 'string', enum: LOCATION_MODES, description: 'online makes a Google Meet link.' },
      location_text: { type: 'string', description: 'Where, required for in_person.' },
      note: { type: 'string', description: 'Text the invitees see in the invitation.' },
      allow_outside: {
        type: 'boolean',
        description: `Must be true to invite anyone outside jkkn.ac.in (at most ${BOOKING_LIMITS.MAX_OUTSIDE} per meeting).`,
      },
      attendees: {
        type: 'array',
        minItems: 1,
        maxItems: MAX_ATTENDEES,
        items: {
          type: 'object',
          properties: { email: { type: 'string' }, name: { type: 'string' } },
          required: ['email'],
        },
      },
    },
    required: ['title', 'start_local', 'duration_min', 'location_mode', 'attendees'],
  },
};

export interface ScheduleArgs {
  title: string;
  startIso: string;
  durationMin: number;
  locationMode: HostMeetingLocationMode;
  locationText: string | null;
  note: string | null;
  attendees: { email: string; name: string }[];
  /** Invitees outside JKKN (already allowed and within the cap). */
  outside: string[];
}

/** Reads India wall-clock "YYYY-MM-DDTHH:MM" as a real instant. */
export function indiaLocalToIso(local: unknown): string | null {
  if (typeof local !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/.exec(local.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59) return null;
  // Refuse a day the month does not have (31 February would otherwise roll
  // into March): the calendar date must survive a round trip unchanged.
  const cal = new Date(Date.UTC(y, mo - 1, d));
  if (cal.getUTCFullYear() !== y || cal.getUTCMonth() !== mo - 1 || cal.getUTCDate() !== d) return null;
  return zonedToUtc(y, mo, d, h * 60 + mi, CAMPUS_TZ).toISOString();
}

/** The first `max` letters (grapheme clusters) of `text`. */
type GraphemeSegmenter = new (l?: string, o?: { granularity: string }) => {
  segment(t: string): Iterable<{ segment: string }>;
};
const Segmenter = (Intl as unknown as { Segmenter?: GraphemeSegmenter }).Segmenter;
/** No letter is longer than this many UTF-16 units (bounds the work on hostile input). */
const MAX_UNITS_PER_LETTER = 16;

/** The letters (grapheme clusters) of `text`, stopping after `limit` of them. */
function letters(text: string, limit: number): string[] {
  // Never segment more raw text than `limit` letters could possibly need.
  const head = text.slice(0, limit * MAX_UNITS_PER_LETTER);
  const out: string[] = [];
  const it = Segmenter ? new Segmenter(undefined, { granularity: 'grapheme' }).segment(head) : head;
  for (const part of it as Iterable<string | { segment: string }>) {
    out.push(typeof part === 'string' ? part : part.segment);
    if (out.length >= limit) break;
  }
  return out;
}

export function cutToLetters(text: string, max: number): string {
  return letters(text, max).join('');
}

/** True when `text` has more than `max` letters as people see them. */
export function longerThanLetters(text: string, max: number): boolean {
  if (text.length <= max) return false; // fewer UTF-16 units than max means fewer letters too
  return text.length > max * MAX_UNITS_PER_LETTER || letters(text, max + 1).length > max;
}

/** Checks and shapes the outside AI's arguments. Throws ToolArgsError in plain words. */
export function parseScheduleArgs(input: Record<string, unknown> | undefined): ScheduleArgs {
  const a = input ?? {};
  const title = typeof a.title === 'string' ? a.title.trim() : '';
  if (!title) throw new ToolArgsError('Give the meeting a title.');
  if (longerThanLetters(title, BOOKING_LIMITS.MAX_TITLE)) {
    throw new ToolArgsError(`The title can be at most ${BOOKING_LIMITS.MAX_TITLE} letters.`);
  }
  const startIso = indiaLocalToIso(a.start_local);
  if (!startIso) throw new ToolArgsError('start_local must be India time as YYYY-MM-DDTHH:MM.');
  if (new Date(startIso).getTime() < Date.now() - 5 * 60_000) {
    throw new ToolArgsError('That start time has already passed.');
  }
  if (new Date(startIso).getTime() > Date.now() + BOOKING_LIMITS.MAX_DAYS_AHEAD * 86_400_000) {
    throw new ToolArgsError('That start time is more than a year away.');
  }
  const durationMin = Number(a.duration_min);
  if (!Number.isInteger(durationMin) || durationMin < 5 || durationMin > MAX_DURATION_MIN) {
    throw new ToolArgsError(`duration_min must be a whole number from 5 to ${MAX_DURATION_MIN}.`);
  }
  const locationMode = a.location_mode as HostMeetingLocationMode;
  if (!LOCATION_MODES.includes(locationMode)) {
    throw new ToolArgsError('location_mode must be online, phone or in_person.');
  }
  if (!Array.isArray(a.attendees) || a.attendees.length < 1 || a.attendees.length > MAX_ATTENDEES) {
    throw new ToolArgsError(`attendees must list 1 to ${MAX_ATTENDEES} people.`);
  }
  // Every invitee needs a real address; a repeated address is kept once.
  const seen = new Set<string>();
  const attendees: { email: string; name: string }[] = [];
  for (const p of a.attendees) {
    const o = (p ?? {}) as Record<string, unknown>;
    const email = typeof o.email === 'string' ? o.email.trim() : '';
    // '*' is a wildcard in the people lookup, so it is never accepted.
    if (!EMAIL_RE.test(email) || email.includes('*')) {
      throw new ToolArgsError(`Every attendee needs a valid email address; "${email}" is not one.`);
    }
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    // Cut by letters as people see them, so a Tamil syllable or an emoji is never split.
    const name = typeof o.name === 'string' ? cutToLetters(o.name.trim(), BOOKING_LIMITS.MAX_NAME) : '';
    attendees.push({ email, name: name || email });
  }
  const outside = attendees.map((p) => p.email).filter(isOutsideJkkn);
  if (outside.length && a.allow_outside !== true) {
    throw new ToolArgsError(
      `${outside.join(', ')} ${outside.length === 1 ? 'is' : 'are'} outside JKKN. Ask the owner, then send allow_outside: true to invite them.`
    );
  }
  if (outside.length > BOOKING_LIMITS.MAX_OUTSIDE) {
    throw new ToolArgsError(`At most ${BOOKING_LIMITS.MAX_OUTSIDE} people outside JKKN per meeting.`);
  }
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const note = text(a.note);
  if (note && longerThanLetters(note, BOOKING_LIMITS.MAX_NOTE)) {
    throw new ToolArgsError(`The note can be at most ${BOOKING_LIMITS.MAX_NOTE} letters.`);
  }
  const locationText = text(a.location_text);
  if (locationText && longerThanLetters(locationText, BOOKING_LIMITS.MAX_TITLE)) {
    throw new ToolArgsError(`location_text can be at most ${BOOKING_LIMITS.MAX_TITLE} letters.`);
  }
  return {
    title,
    startIso,
    durationMin,
    locationMode,
    locationText,
    note,
    attendees,
    outside,
  };
}

/** A LIKE pattern that matches the text exactly (case-insensitive under ilike). */
function exactLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const LIMIT_MESSAGES: Record<string, (n: number) => string> = {
  attempts: (n) => `This key has tried to book ${n} times in the last hour. Wait a while before trying again.`,
  not_allowed: () => 'This key is not allowed to book meetings right now. The owner can switch booking on for it on the Connect page.',
  per_hour: (n) => `This key has booked ${n} meetings in the last hour. Try again later.`,
  per_day: (n) => `This key has booked ${n} meetings in the last 24 hours. Try again tomorrow.`,
  invitees_per_day: (n) =>
    `That would take the owner past ${n} invitations through this door in 24 hours. Book it on the Meetings page instead.`,
};

/**
 * Reserves one booking slot in the database, atomically, before anything is
 * booked. Fails CLOSED: if the reservation cannot be made, nothing is booked.
 * Returns the reservation id.
 */
async function reserveBookingSlot(
  db: SupabaseClient,
  keyId: string,
  ownerId: string,
  inviting: number
): Promise<string> {
  const { data, error } = await db.rpc('fn_ai_booking_reserve', {
    p_key_id: keyId,
    p_owner_id: ownerId,
    p_invitees: inviting,
    p_per_hour: BOOKING_LIMITS.BOOKINGS_PER_HOUR,
    p_per_day: BOOKING_LIMITS.BOOKINGS_PER_DAY,
    p_invitees_per_day: BOOKING_LIMITS.INVITEES_PER_DAY,
  });
  const r = (data ?? {}) as { ok?: boolean; id?: string; reason?: string; limit?: number };
  if (error || typeof r.ok !== 'boolean') {
    throw new DoorRefusal('MyJKKN could not check the booking limits just now, so nothing was booked. Try again shortly.');
  }
  if (!r.ok || !r.id) {
    const msg = LIMIT_MESSAGES[r.reason ?? ''];
    throw new DoorRefusal(msg ? msg(Number(r.limit)) : 'This key has reached its booking limit for now.');
  }
  return r.id;
}

/**
 * Re-reads, right before booking, that the key is still a working personal key
 * of this owner AND still allowed to book. The reservation's own check runs in
 * an earlier transaction, so a switch-off (or a key turned off) after it must
 * still stop the booking. Any error reads as "no".
 */
async function stillAllowedToBook(db: SupabaseClient, keyId: string, ownerId: string): Promise<boolean> {
  try {
    const { data: key, error } = await db
      .from('api_keys')
      .select('user_id, is_active, expires_at, key_kind')
      .eq('id', keyId)
      .maybeSingle();
    const k = key as { user_id?: string; is_active?: boolean; expires_at?: string; key_kind?: string } | null;
    if (error || !k || k.key_kind !== 'personal' || k.user_id !== ownerId || k.is_active !== true) return false;
    if (!k.expires_at || new Date(k.expires_at).getTime() <= Date.now()) return false;
    return await keyMayBook(db, keyId);
  } catch {
    return false;
  }
}

/** Gives a reservation back when booking definitely wrote nothing. Best effort. */
async function releaseBookingSlot(db: SupabaseClient, reservationId: string): Promise<void> {
  try {
    await db.rpc('fn_ai_booking_release', { p_reservation_id: reservationId });
  } catch {
    // A failed release only means the slot stays counted until it ages out.
  }
}

/** The steps before booking ran out of time; nothing was booked. */
export class PrepareTimeout extends Error {
  constructor() {
    super('prepare timed out');
    this.name = 'PrepareTimeout';
  }
}

export class BookingTimeout extends Error {
  constructor() {
    super('booking timed out');
    this.name = 'BookingTimeout';
  }
}

/**
 * After a timeout the booking may still be half-way (row written, invitations
 * not yet sent). Ask the platform to keep it running after the answer is sent,
 * so it finishes rather than being cut off. Outside a request (tests) this is
 * a no-op.
 */
function keepRunningAfterResponse(work: Promise<unknown>): void {
  try {
    after(() => work.catch(() => undefined));
  } catch {
    void work.catch(() => undefined);
  }
}

/** Resolves with the promise, or rejects with BookingTimeout after `ms`. */
export function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new BookingTimeout()), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

/**
 * Which colleges' people the owner may see — the same rule the Schedule page's
 * people search uses: super admins and roles with institution_scope 'all' see
 * everyone; everyone else only their own college. Fails CLOSED to own college.
 */
async function ownerPeopleScope(
  db: SupabaseClient,
  ownerId: string
): Promise<{ crossInstitution: boolean; institutionId: string | null }> {
  const { data: profile } = await db
    .from('profiles')
    .select('institution_id, is_super_admin')
    .eq('id', ownerId)
    .maybeSingle();
  const institutionId = ((profile as { institution_id?: string | null } | null)?.institution_id ?? null) as string | null;
  if ((profile as { is_super_admin?: boolean } | null)?.is_super_admin === true) {
    return { crossInstitution: true, institutionId };
  }
  const { data: roles, error } = await db
    .from('user_roles')
    .select('custom_roles!inner(institution_scope, is_active)')
    .eq('user_id', ownerId);
  if (error) return { crossInstitution: false, institutionId };
  const crossInstitution = ((roles ?? []) as { custom_roles: unknown }[]).some((r) => {
    const role = (Array.isArray(r.custom_roles) ? r.custom_roles[0] : r.custom_roles) as
      | { institution_scope?: string; is_active?: boolean }
      | undefined;
    return role?.is_active !== false && role?.institution_scope === 'all';
  });
  return { crossInstitution, institutionId };
}

/**
 * Links an invitee to a MyJKKN person only on ONE unambiguous, case-insensitive
 * match among people the owner may see. No match or several matches leave it a
 * plain email address (the invitation still goes out).
 */
async function linkInvitees(
  db: SupabaseClient,
  ownerId: string,
  people: { email: string; name: string }[]
): Promise<ScheduleAttendee[]> {
  const { crossInstitution, institutionId } = await ownerPeopleScope(db, ownerId);
  const canSearch = crossInstitution || Boolean(institutionId);
  return Promise.all(
    people.map(async (p) => {
      if (!canSearch) return { ...p, profileId: null };
      let q = db
        .from('profiles')
        .select('id')
        .eq('is_active', true)
        .ilike('email', exactLike(p.email))
        .limit(2);
      if (!crossInstitution) q = q.eq('institution_id', institutionId as string);
      const { data, error } = await q;
      const rows = (data ?? []) as { id: string }[];
      return { ...p, profileId: !error && rows.length === 1 ? rows[0].id : null };
    })
  );
}

/**
 * Books for the key's owner. The owner's meetings access is re-checked AS the
 * owner on every call, so taking Meetings away stops the key at once.
 */
async function runScheduleTool(
  ownerClient: SupabaseClient,
  ownerId: string,
  keyId: string,
  input: Record<string, unknown> | undefined
): Promise<unknown> {
  const args = parseScheduleArgs(input);

  const [{ data: isSuper }, { data: canMeet }] = await Promise.all([
    ownerClient.rpc('is_super_admin'),
    ownerClient.rpc('user_has_permission', { permission_name: 'meetings.view' }),
  ]);
  if (isSuper !== true && canMeet !== true) {
    throw new DoorRefusal('The owner of this key no longer has access to Meetings in MyJKKN.');
  }

  const db = createServiceRoleClient() as unknown as SupabaseClient;

  // Everything before booking runs under its own deadline, so a stuck lock or
  // a slow database is answered (and audited) well inside maxDuration.
  const prepareDeadline = Date.now() + BOOKING_LIMITS.PREPARE_TIMEOUT_MS;
  const inTime = <T,>(p: Promise<T>) =>
    withDeadline(p, Math.max(1, prepareDeadline - Date.now())).catch((err) => {
      throw err instanceof BookingTimeout ? new PrepareTimeout() : err;
    });

  const reservationId = await inTime(reserveBookingSlot(db, keyId, ownerId, args.attendees.length));

  // Link invitees who are MyJKKN people, as the Schedule page does when someone
  // is picked from its list. Unknown or ambiguous addresses stay plain emails.
  let attendees: ScheduleAttendee[];
  try {
    attendees = await inTime(linkInvitees(db, ownerId, args.attendees));
  } catch (err) {
    // Nothing has been booked yet: give the slot back.
    await releaseBookingSlot(db, reservationId);
    throw err;
  }

  // Last check before anything is written: the owner may have switched booking
  // off, or turned the key off, since the slot was reserved. This narrows the
  // window to the moment between this read and the booking's own insert; it
  // does not close it (HostSchedulingService is shared with the Schedule page
  // and takes no grant). A switch-off in that sub-second gap still lets one
  // booking through, on the owner's own calendar.
  let allowed = false;
  try {
    allowed = await inTime(stillAllowedToBook(db, keyId, ownerId));
  } catch (err) {
    await releaseBookingSlot(db, reservationId);
    throw err;
  }
  if (!allowed) {
    await releaseBookingSlot(db, reservationId);
    throw new DoorRefusal('Booking was switched off for this key, so nothing was booked.');
  }

  // From here the outcome may be unknown (an error or a timeout after the row
  // was written), so the reservation is kept unless booking says it wrote nothing.
  const booking = HostSchedulingService.scheduleDirect(db, {
    hostProfileId: ownerId,
    title: args.title,
    startIso: args.startIso,
    durationMin: args.durationMin,
    locationMode: args.locationMode,
    locationText: args.locationText,
    note: args.note,
    attendees,
  });
  let outcome: Awaited<typeof booking>;
  try {
    outcome = await withDeadline(booking, BOOKING_LIMITS.BOOKING_TIMEOUT_MS);
  } catch (err) {
    if (err instanceof BookingTimeout) keepRunningAfterResponse(booking);
    throw err;
  }
  if (!outcome.ok) {
    const code = outcome.error?.code;
    if (code === 'VALIDATION' || code === 'SLOT_TAKEN') {
      // Both are decided before anything is written.
      await releaseBookingSlot(db, reservationId);
      if (code === 'VALIDATION') throw new ToolArgsError(outcome.error.message);
      throw new DoorRefusal(outcome.error.message);
    }
    throw new Error(outcome.error?.message ?? 'not booked');
  }
  const warning = outcome.data.warning;
  return {
    booked: true,
    // Put first so an outside AI cannot miss it: the meeting exists, but the
    // calendar or invitation step did not fully succeed.
    ...(warning
      ? { attention: `Booked, but not complete: ${warning} Tell the person who asked before booking anything else.` }
      : {}),
    uid: outcome.data.uid,
    ...(args.outside.length ? { outside_invitees: args.outside } : {}),
    start: outcome.data.startIso,
    end: outcome.data.endIso,
    meet_link: outcome.data.videoUrl,
    warning,
  };
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/** The one answer for an unknown, turned-off or expired key — and for a switched-off owner. */
function revokedKeyResponse(): Response {
  return jsonResponse(401, {
    error: 'invalid_token',
    error_description: 'This key is not valid, has been turned off, or has expired.',
  });
}

function requestMeta(req: Request): { ipAddress: string | null; userAgent: string | null } {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return {
    ipAddress: forwarded || req.headers.get('x-real-ip') || null,
    userAgent: req.headers.get('user-agent') || null,
  };
}

function capped(data: unknown): McpToolResult {
  const result = mcpSuccess(data);
  const text = result.content[0]?.text ?? '';
  if (text.length <= MAX_RESULT_CHARS) return result;
  return {
    content: [
      {
        type: 'text',
        text:
          text.slice(0, MAX_RESULT_CHARS) +
          `\n\n[Cut at ${MAX_RESULT_CHARS} characters. Ask again with a smaller p_limit or a narrower filter.]`,
      },
    ],
  };
}

/**
 * Caps p_limit for any tool that takes one: min(asked, DOOR_MAX_LIMIT), and
 * DOOR_MAX_LIMIT when the outside AI leaves it out. Other arguments pass
 * through untouched (buildRpcArgs still decides what is kept).
 */
export function withDoorLimit(
  tool: CatalogTool,
  input: Record<string, unknown> | undefined
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(input ?? {}) };
  const declared = tool.params?.properties ?? {};
  if (!Object.prototype.hasOwnProperty.call(declared, 'p_limit')) return out;
  const asked = Number(out.p_limit);
  out.p_limit =
    Number.isFinite(asked) && asked >= 1 ? Math.min(Math.floor(asked), DOOR_MAX_LIMIT) : DOOR_MAX_LIMIT;
  return out;
}

/**
 * Several ai_rpc_* functions honour a caller-supplied p_institution_id without
 * checking that the caller may see that college (measured live 2026-09-23:
 * students_summary, students_by_department, admission_referrers). Until their
 * SQL is fixed, the door refuses any p_institution_id the key OWNER cannot
 * access — asked AS the owner, through role_has_institution_access, the same
 * function MyJKKN's own row rules use (and the same guard the Mac standby
 * answerer applies). A missing or empty p_institution_id is not checked: the
 * functions then fall back to the person's own college.
 */
export async function assertInstitutionAllowed(
  client: SupabaseClient,
  tool: CatalogTool,
  input: Record<string, unknown> | undefined
): Promise<void> {
  const declared = tool.params?.properties ?? {};
  if (!Object.prototype.hasOwnProperty.call(declared, 'p_institution_id')) return;
  const value = input?.p_institution_id;
  if (value === undefined || value === null) return;
  if (typeof value === 'string' && value.trim() === '') return;
  if (typeof value !== 'string') throw new DoorRefusal('p_institution_id must be a college id.');

  const { data, error } = await client.rpc('role_has_institution_access', {
    check_institution_id: value.trim(),
  });
  if (error || data !== true) {
    throw new DoorRefusal(
      'You do not have access to that college in MyJKKN. Ask only about the colleges you can see.'
    );
  }
}

/** The door's tool list for this person: rpc tools only, and never a write. */
export function doorTools(menu: CatalogTool[]): CatalogTool[] {
  return menu.filter((t) => t.kind === 'rpc' && t.is_write !== true);
}

/**
 * Handles one MCP request made with a personal key. Stateless, like the admin
 * path: a fresh server per request.
 */
export async function handlePersonalKeyRequest(req: Request, token: string): Promise<Response> {
  const ctx = await verifyPersonalMcpToken(token);
  if (!ctx) return revokedKeyResponse();

  const limit = checkRateLimit(ctx.keyId);
  if (!limit.allowed) {
    const retryAfter = Math.max(1, Math.ceil((limit.resetAt.getTime() - Date.now()) / 1000));
    return jsonResponse(
      429,
      { error: 'rate_limited', error_description: 'Too many requests. Try again shortly.' },
      { 'Retry-After': String(retryAfter) }
    );
  }

  let tools: CatalogTool[];
  let client: Awaited<ReturnType<typeof getUserSessionClient>>;
  try {
    client = await getUserSessionClient(ctx.ownerId);
    tools = doorTools(await fetchToolMenu(client, 'door'));
  } catch (err) {
    console.warn('[MCP personal] could not act as key owner', {
      keyId: ctx.keyId,
      error: err instanceof Error ? err.name : 'unknown',
    });
    // The owner's account is switched off in MyJKKN: answer exactly as for a
    // turned-off key, so the holder learns nothing about why.
    if (err instanceof AccountOffError) return revokedKeyResponse();
    return jsonResponse(401, {
      error: 'invalid_token',
      error_description: 'This key cannot be used right now. Make a new key on the Connect an outside AI page.',
    });
  }

  const meta = requestMeta(req);
  const audit = (toolName: string, statusCode: number, startTime: number) =>
    logApiUsage({
      apiKeyId: ctx.keyId,
      endpoint: `mcp:${toolName}`,
      module: 'ai',
      institutionId: ctx.institutionId,
      statusCode,
      responseTimeMs: Date.now() - startTime,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

  const server = new Server(
    { name: 'MyJKKN MCP Server', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      ...tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: publicInputSchema(t.params) as { type: 'object'; [k: string]: unknown },
      })),
      ...(ctx.canBookMeetings ? [SCHEDULE_TOOL] : []),
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const startTime = Date.now();
    const name = request.params.name;
    if (name === SCHEDULE_TOOL_NAME && ctx.canBookMeetings) {
      try {
        const data = await runScheduleTool(
          client as unknown as SupabaseClient,
          ctx.ownerId,
          ctx.keyId,
          request.params.arguments as Record<string, unknown> | undefined
        );
        audit(name, 200, startTime);
        return mcpSuccess(data);
      } catch (err) {
        if (err instanceof DoorRefusal) {
          audit(name, 403, startTime);
          return mcpError(err.message);
        }
        if (err instanceof PrepareTimeout) {
          audit(name, 504, startTime);
          return mcpError('MyJKKN was too slow to start the booking, so nothing was booked. Try again in a minute.');
        }
        if (err instanceof BookingTimeout) {
          audit(name, 504, startTime);
          return mcpError(
            "MyJKKN did not confirm the booking in time. It may still have been made: check the owner's Meetings inbox before trying again."
          );
        }
        const isArgs = err instanceof ToolArgsError;
        audit(name, isArgs ? 400 : 500, startTime);
        if (!isArgs) {
          console.error('[MCP personal] schedule_meeting failed', {
            keyId: ctx.keyId,
            error: err instanceof Error ? err.message : 'unknown',
          });
        }
        return mcpError(isArgs ? err.message : "MyJKKN could not confirm that booking. Check the owner's Meetings inbox before trying again.");
      }
    }
    const tool = tools.find((t) => t.name === name);
    if (!tool) {
      audit(name, 404, startTime);
      return mcpError(`Unknown tool: ${name}`);
    }
    try {
      const input = withDoorLimit(tool, request.params.arguments as Record<string, unknown> | undefined);
      await assertInstitutionAllowed(client, tool, input);
      const data = await callRpcTool(client, tool, input, ctx.ownerId);
      audit(name, 200, startTime);
      return capped(data);
    } catch (err) {
      if (err instanceof DoorRefusal) {
        audit(name, 403, startTime);
        return mcpError(err.message);
      }
      const isArgs = err instanceof ToolArgsError;
      audit(name, isArgs ? 400 : 500, startTime);
      return mcpError(isArgs ? err.message : `MyJKKN could not run ${name}. Try different filters.`);
    }
  });

  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } catch (err) {
    console.error('[MCP personal] handleRequest error:', err instanceof Error ? err.message : 'unknown');
    return jsonResponse(500, { jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null });
  }
}
