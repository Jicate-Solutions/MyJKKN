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
//   grievance_tickets.is_anonymous       PRESENT — ALREADY LIVE
//   grievance_tickets.anonymous_token    PRESENT — ALREADY LIVE
//   grievance_categories.allow_anonymous ABSENT  — pending
//   fn_track_issue_by_token()            ABSENT  — pending
//   fn_get_policy()                      PRESENT
//
// The two live columns were added by
// supabase/migrations/20260417000001_compliance_unification_substrate.sql
// (lines 282-314), which HAS applied — so an anonymous filing can be WRITTEN
// today. Only the two ABSENT objects are still pending, and they are written by
// supabase/migrations/20261213100000_instasolver_substrate_v2.sql, which is
// PR #3751's migration and not yet merged. (The earlier
// 20261103000000_instasolver_substrate.sql is superseded by that v2 file and is
// not the citation to follow.)
//
// So the split matters: writing an anonymous ticket works now; reading it back
// by its code, and knowing WHICH categories permit it, do not. Every read below
// that touches the two absent objects is written to survive their absence and
// to say so in words, rather than to throw or to render a blank screen.
// ============================================================================

import type { RaisedByType } from '@/lib/types/grievance';

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
 * The ANSWER SET IS NOT FREE. `RaisedByType` in lib/types/grievance.ts is
 * exactly `learner | parent | staff | alumni`, imported above rather than
 * retyped so it cannot drift, and no row in grievance_tickets has ever carried
 * any other value. A live CHECK constraint on the column cannot be ruled out
 * from here, so a Senior Learner is recorded as `staff` — the value the column
 * is known to accept — and NOT as `faculty`, which would be a value this
 * platform has never written. The persona distinction that matters for a
 * complaint is filer-versus-team-member, and `staff` carries it.
 *
 * `parent` is kept because it IS in the union and decision I1 names parents as
 * a persona; today no parent login can reach this lane (the parent portal is a
 * separate auth domain — proxy.ts handleParentPortal, a parent_session JWT, and
 * /parent/* only), so this branch is the correct answer waiting for the route
 * rather than a live path.
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
  // Senior Learners. Same answer as every other team-member role, deliberately
  // — see the note above on why `faculty` is not written to this column.
  'faculty',
  'teacher',
  'professor',
  'instructor',
]);

export function mapRoleToRaisedByType(role: string | null | undefined): RaisedByType {
  const r = (role ?? '').trim().toLowerCase();
  if (r === 'parent') return 'parent';
  if (r === 'alumni') return 'alumni';
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

/**
 * Why this is discriminated rather than a bare array.
 *
 * An empty list and a failed read are DIFFERENT facts and the person needs
 * different sentences for them: "your college has not set any up" is a thing to
 * phone the helpdesk about, "we could not load them" is a thing to retry. The
 * earlier shape returned `[]` for both, so a transient outage rendered as a
 * settled configuration statement.
 *
 * `reason?: never` on the success arm is not decoration. tsconfig.json sets
 * `strictNullChecks: false` for the Next 16 migration, and WITHOUT it TypeScript
 * will not narrow a union by a BOOLEAN discriminant — `result.ok ? … : result
 * .reason` is a TS2339 even inside the false arm (checked, not guessed). The
 * optional-never keeps `ok` as the readable discriminant every call site already
 * wants while letting the compiler see the property.
 */
export type ComplaintCategoriesResult =
  | { ok: true; categories: ComplaintCategory[]; anonymousColumnPresent: boolean; reason?: never }
  | { ok: false; reason: 'empty' | 'error' };

/**
 * The two calls these helpers make, and nothing else, so they can be handed
 * either the caller's session client, the service-role client, or a stub in a
 * test. Written with METHOD syntax deliberately: method signatures are
 * bivariant, so a generated client whose `from()` accepts only a union of real
 * table names still satisfies this. A property-style `from: (t: string) => …`
 * would be contravariant under strictFunctionTypes and reject every real
 * client.
 */
interface MinimalQueryClient {
  from(table: string): any;
  rpc(fn: string, args: Record<string, unknown>): any;
}

/**
 * The categories a person may file against, with the anonymous rule attached.
 *
 * grievance_categories.institution_id is NOT NULL in the live schema, so there
 * is no platform-wide category to include — the list is exactly this person's
 * institution. Asked for once here so the page, the client and the API all
 * agree on the same rule rather than each deciding for itself.
 *
 * CALL IT WITH THE SERVICE-ROLE CLIENT. The page and the API route must agree
 * on the list, and they cannot if one reads under RLS and the other does not:
 * an RLS policy that hides categories from a student would render an empty form
 * and then accept nothing. The list is not a secret — it is the set of things
 * the college invites complaints about — so reading it elevated costs no
 * confidentiality, and it buys page-and-API agreement.
 */
export async function readComplaintCategories(
  client: MinimalQueryClient,
  institutionId: string
): Promise<ComplaintCategoriesResult> {
  const withColumn = await client
    .from('grievance_categories')
    .select('id, name, allow_anonymous')
    .eq('institution_id', institutionId)
    .eq('is_active', true)
    .order('sort_order');

  if (!withColumn.error) {
    const rows = (withColumn.data ?? []) as Array<{ id: string; name: string; allow_anonymous: boolean | null }>;
    if (rows.length === 0) return { ok: false, reason: 'empty' };
    return {
      ok: true,
      anonymousColumnPresent: true,
      categories: rows.map((c) => ({ id: c.id, name: c.name, allow_anonymous: c.allow_anonymous === true })),
    };
  }

  if (withColumn.error?.code !== UNDEFINED_COLUMN) {
    console.error('[instasolver/complaint] category read failed:', withColumn.error?.message);
    return { ok: false, reason: 'error' };
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
    return { ok: false, reason: 'error' };
  }

  const rows = (plain.data ?? []) as Array<{ id: string; name: string }>;
  if (rows.length === 0) return { ok: false, reason: 'empty' };
  return {
    ok: true,
    anonymousColumnPresent: false,
    categories: rows.map((c) => ({ id: c.id, name: c.name, allow_anonymous: false })),
  };
}

/**
 * What the no-name checkbox should be after a category has been chosen.
 *
 * Pure, and in this module rather than in the component, because the rule is a
 * PROMISE and a promise that is quietly withdrawn is worse than one never made.
 * The earlier form unmounted the checkbox when the chosen category did not
 * permit anonymous filing, which left `anonymous` true in state, silently
 * ignored at submit time: the person believed they had filed without a name and
 * had not. This function makes the retraction a value the component must
 * render.
 */
export interface AnonymousChoice {
  /** Whether the no-name option can be honoured for the chosen category. */
  allowed: boolean;
  /** What the checkbox must now be set to. */
  anonymous: boolean;
  /** True when a tick the person had already made has just been taken away. */
  retracted: boolean;
}

export function resolveAnonymousChoice(input: {
  anonymousAvailable: boolean;
  category: ComplaintCategory | null;
  ticked: boolean;
}): AnonymousChoice {
  const allowed = input.anonymousAvailable && input.category?.allow_anonymous === true;
  if (allowed) return { allowed: true, anonymous: input.ticked, retracted: false };
  return { allowed: false, anonymous: false, retracted: input.ticked };
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
 *
 * A UUID-SHAPED ANSWER IS NOT ENOUGH — see {@link confirmProfileExists}.
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

/**
 * Confirms the profile a policy names is actually there.
 *
 * WHY THE UUID SHAPE IS NOT SUFFICIENT. grievance_tickets.assigned_to carries a
 * foreign key to profiles. A policy row still naming somebody who has left, or
 * naming a profile in another institution that has since been removed, is
 * perfectly UUID-shaped and raises SQLSTATE 23503 at INSERT — which fails the
 * WHOLE insert. The complaint is then lost as a 400, and it is lost precisely
 * in the I8 case: the complaint about the filer's own head of department, the
 * one thing this lane exists to get right. Checking first turns a stale policy
 * value into the unassigned-plus-notice branch, which the work-item generator
 * hands to the institution's Director.
 *
 * MUST be given the SERVICE-ROLE client: the target is deliberately somebody
 * senior and possibly outside the filer's institution, so a session-client read
 * would return nothing under RLS and this would report "missing" for a profile
 * that is present.
 *
 * Returns false on any error, for the same fail-closed reason as the policy
 * read: an unassigned ticket is recoverable, a lost one is not.
 */
export async function confirmProfileExists(
  client: MinimalQueryClient,
  profileId: string
): Promise<boolean> {
  try {
    const { data, error } = await client
      .from('profiles')
      .select('id')
      .eq('id', profileId)
      .maybeSingle();

    if (error) {
      console.error('[instasolver/complaint] superior-route profile check failed:', error.message);
      return false;
    }
    return Boolean(data);
  } catch (err) {
    console.error('[instasolver/complaint] superior-route profile check threw:', err);
    return false;
  }
}
