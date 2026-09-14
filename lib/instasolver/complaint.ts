// lib/instasolver/complaint.ts
// ============================================================================
// Insta Solver — the shared rules behind "a complaint from any login".
//
// Decisions this file implements (Director, 2026-09-14):
//   I1  everybody who can sign in may file — learners, Senior Learners, every
//       team-member role, and parents. Not one door per persona.
//   I7  a filing may be made without a name attached, and the person is handed
//       a private code to follow it with.
//   I8  a complaint about the filer's OWN head of department or manager is
//       routed past them, to the profile named by the platform policy key
//       below, and that head of department is not told.
//
// It lives outside app/api/instasolver/complaint/route.ts because Next.js
// type-checks App Router route modules against a fixed export shape — a named
// helper exported from route.ts fails the build — and these rules need to be
// reachable from the page, the client component and the tests.
//
// ── WHAT IS ACTUALLY IN THE DATABASE TODAY (verified 2026-09-14) ────────────
// types/supabase.ts is generated from the live database, so it is the only
// honest statement of what exists. Against jicate/main it says:
//   grievance_tickets.is_anonymous       PRESENT
//   grievance_tickets.anonymous_token    PRESENT
//   grievance_categories.allow_anonymous ABSENT
//   fn_track_issue_by_token()            ABSENT
//   fn_get_policy()                      PRESENT
// The last two are written by supabase/migrations/20261103000000_instasolver_
// substrate.sql, which is committed to main and whose own header records that
// it has never applied (a version-string collision with
// 20260504_ai_pulse_rls_hardening.sql meant it was recorded as done without
// ever running). So every read below that touches the two absent objects is
// written to survive their absence and to say so in words, rather than to
// throw or to render a blank screen.
// ============================================================================

/** Stamped as `metadata.source` on every ticket this lane creates. */
export const INSTASOLVER_SOURCE = 'instasolver';

/**
 * Platform policy naming the profile a complaint-about-my-own-superior is
 * handed to. Read through fn_get_policy, the resolver this repo already uses
 * for exactly this shape of setting (lib/campus-walk/reporters.ts,
 * lib/learners-council/broadcast-server.ts). Passed as a literal key for the
 * same reason those two files pass theirs as literals.
 */
export const SUPERIOR_ROUTE_POLICY_KEY = 'instasolver.complaint.superior_route_to';

export const SUBJECT_MIN_LENGTH = 5;
export const SUBJECT_MAX_LENGTH = 120;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Counts the way Postgres char_length() does — code points, not UTF-16 code
 * units — so an entry made of emoji is measured here exactly as the database
 * measures it. Same reasoning as lib/validations/grievance-ticket.ts.
 */
export function characterCount(value: string): number {
  return Array.from(value).length;
}

/** Returns the message to show beside the subject field, or null when it fits. */
export function validateSubject(value: string): string | null {
  const n = characterCount(value.trim());
  if (n < SUBJECT_MIN_LENGTH) {
    return `Please give this a title of at least ${SUBJECT_MIN_LENGTH} characters.`;
  }
  if (n > SUBJECT_MAX_LENGTH) {
    return `Please keep the title to ${SUBJECT_MAX_LENGTH} characters or fewer.`;
  }
  return null;
}

/**
 * profiles.role → grievance_tickets.raised_by_type.
 *
 * The board's own mapping (LCIssueService.createLCIssue) predates the current
 * user_role enum and tests for six values that the enum no longer contains
 * ('admin', 'hod', 'principal', 'teacher', 'parent', 'alumni'), so on today's
 * data an administrator or a Senior Learner filing from the board is recorded
 * as a learner. That mapping is deliberately LEFT ALONE — correcting it would
 * change what the board writes, which is not this lane's job. This lane passes
 * its own answer in through the `raisedByType` option instead.
 *
 * The enum as generated from the live database is:
 *   super_admin | administrator | faculty | student | test | accounts |
 *   guest | driver | staff
 * 'parent' is not in it. It is still mapped, because the column is plain text
 * and a parent portal login is decision I1's fourth persona; if such a role
 * value ever reaches this function the answer should be the right one rather
 * than a silent fallback to learner.
 */
const TEAM_MEMBER_ROLES = new Set([
  'staff',
  'administrator',
  'admin',
  'super_admin',
  'accounts',
  'driver',
  'hod',
  'principal',
]);

const SENIOR_LEARNER_ROLES = new Set(['faculty', 'teacher', 'professor', 'instructor']);

export function mapRoleToRaisedByType(role: string | null | undefined): string {
  const r = (role ?? '').trim().toLowerCase();
  if (r === 'parent') return 'parent';
  if (r === 'alumni') return 'alumni';
  if (SENIOR_LEARNER_ROLES.has(r)) return 'faculty';
  if (TEAM_MEMBER_ROLES.has(r)) return 'staff';
  return 'learner';
}

/**
 * The private code handed to somebody who files without a name.
 *
 * Shape is dictated by the reader, not by taste: fn_track_issue_by_token()
 * refuses anything that does not match `anon\\_%` and is at least 20
 * characters, because both existing writers mint `'anon_' + crypto.randomUUID()`.
 * 32 characters drawn from a 64-symbol alphabet is 192 bits — more than the
 * UUID it replaces — and the required prefix brings the code to 37.
 *
 * Web Crypto rather than node:crypto: this module is also imported by the form
 * component, and a bare `node:crypto` import at the top of it would be pulled
 * into the browser bundle. getRandomValues is cryptographically strong in both
 * places. Indexing a 64-symbol alphabet with `byte & 63` is uniform — 64
 * divides 256 exactly, so there is no modulo bias to correct for.
 */
const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function mintAnonymousToken(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += TOKEN_ALPHABET[b & 63];
  return `anon_${out}`;
}

/** Postgres SQLSTATE / PostgREST code for "column does not exist". */
const UNDEFINED_COLUMN = '42703';

export interface ComplaintCategory {
  id: string;
  name: string;
  /**
   * False whenever the per-category setting cannot be read — including the
   * case where the column is not in the database yet. Anonymous filing is a
   * promise of concealment; the safe direction when the rule is unknown is to
   * not make that promise.
   */
  allow_anonymous: boolean;
}

interface MinimalQueryClient {
  from: (table: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => any;
}

/**
 * The categories a person may file against, with the anonymous rule attached.
 *
 * grievance_categories.institution_id is NOT NULL in the live schema, so there
 * is no platform-wide category to include — the list is exactly this person's
 * institution. Asked for once here so the page, the client and the API all
 * agree on the same rule rather than each deciding for itself.
 */
export async function readComplaintCategories(
  client: MinimalQueryClient,
  institutionId: string
): Promise<{ categories: ComplaintCategory[]; anonymousColumnPresent: boolean }> {
  const withColumn = await client
    .from('grievance_categories')
    .select('id, name, allow_anonymous')
    .eq('institution_id', institutionId)
    .eq('is_active', true)
    .order('sort_order');

  if (!withColumn.error) {
    const rows = (withColumn.data ?? []) as Array<{ id: string; name: string; allow_anonymous: boolean | null }>;
    return {
      anonymousColumnPresent: true,
      categories: rows.map((c) => ({ id: c.id, name: c.name, allow_anonymous: c.allow_anonymous === true })),
    };
  }

  if (withColumn.error?.code !== UNDEFINED_COLUMN) {
    console.error('[instasolver/complaint] category read failed:', withColumn.error?.message);
    return { categories: [], anonymousColumnPresent: false };
  }

  // The column is not there yet. Read the list without it and mark every
  // category as not offering anonymous filing.
  const plain = await client
    .from('grievance_categories')
    .select('id, name')
    .eq('institution_id', institutionId)
    .eq('is_active', true)
    .order('sort_order');

  if (plain.error) {
    console.error('[instasolver/complaint] category read failed:', plain.error.message);
    return { categories: [], anonymousColumnPresent: false };
  }

  const rows = (plain.data ?? []) as Array<{ id: string; name: string }>;
  return {
    anonymousColumnPresent: false,
    categories: rows.map((c) => ({ id: c.id, name: c.name, allow_anonymous: false })),
  };
}

/**
 * Reads {@link SUPERIOR_ROUTE_POLICY_KEY} and returns the profile id to hand
 * the complaint to, or null.
 *
 * FAILS CLOSED, and "closed" here means UNASSIGNED — never "assign it to the
 * head of department anyway", which is the one outcome decision I8 exists to
 * prevent. A null answer makes the caller stamp `metadata.route_pending_policy`
 * and tell the person in the response that assignment is pending, so a missing
 * configuration row is visible instead of quietly turning into an ordinary
 * ticket sitting in the queue of the person it is about.
 *
 * Accepts the two shapes an admin could plausibly save the row in: a bare id
 * string, or an object carrying `profile_id` / `id`.
 */
export async function resolveSuperiorRouteProfileId(
  client: MinimalQueryClient
): Promise<string | null> {
  let raw: unknown;
  try {
    // p_scope_id named explicitly rather than defaulted, to keep PostgREST's
    // overload resolution unambiguous — the call shape proven in production by
    // lib/policies/get-policy.ts and lib/campus-walk/reporters.ts.
    const { data, error } = await client.rpc('fn_get_policy', {
      p_key: SUPERIOR_ROUTE_POLICY_KEY,
      p_scope_id: null,
    });
    if (error) {
      console.error('[instasolver/complaint] superior-route policy read failed:', error.message);
      return null;
    }
    raw = data;
  } catch (err) {
    console.error('[instasolver/complaint] superior-route policy read threw:', err);
    return null;
  }

  const candidate =
    typeof raw === 'string'
      ? raw
      : raw && typeof raw === 'object'
        ? ((raw as Record<string, unknown>).profile_id ?? (raw as Record<string, unknown>).id)
        : null;

  if (typeof candidate !== 'string') return null;
  const id = candidate.trim();
  return UUID_RE.test(id) ? id : null;
}
