/**
 * RCLTP — who hears about the reading programme's unattended problems.
 *
 * Director decisions 2 and 3 (interview 2026-07-28, specs/rcltp-access-decisions-2026-07-28.md):
 *   #2  Tell the HEAD of the school whose reading material is missing — not every
 *       system administrator, which is what the shipped cron did.
 *   #3  When that school has no active head, or the material is global and belongs
 *       to no single school, FALL BACK to system administrators. Never stay silent.
 *
 * ONE resolver, imported by every RCLTP unattended-notice path, so "who is told"
 * has a single definition. Do not re-derive this rule anywhere else.
 *
 * HOW A HEAD IS IDENTIFIED — by PERMISSION, never by role name. A head is an
 * active profile at the institution holding a role that grants
 * `rcltp.config.manage`. Today that is role_key 'principal' / 'school_principal'
 * (granted in 20260614120000_rcltp_permission_grants.sql), but naming those keys
 * in code would break the moment Role Management re-cuts them — Role Management
 * is the single source of truth for access, and hardcoded role names in logic are
 * prohibited repo-wide.
 *
 * WHY SUPER ADMINS ARE EXCLUDED FROM THE HEAD TIER: the same grant migration gave
 * `rcltp.config.manage` to the platform-admin roles too. Without this exclusion a
 * super admin who happens to carry an institution_id would satisfy the head query
 * and the caller would log via:'head' while nobody at the school had actually been
 * found. The `via` discriminator exists so an operator can tell "the head was told"
 * from "nobody had a head, administrators were told"; a tier that silently admits
 * administrators would make that signal a lie. Institution-scoped administrator /
 * system_admin accounts are deliberately still eligible as heads — they hold the
 * permission, sit at that institution, and can act on the message.
 *
 * Read-only. This module never writes, never sends, and never decides WHETHER or
 * WHEN a notice fires — only WHO receives it.
 */

/** Loose read shape so a plain fake can drive this in unit tests. */
type Admin = { from: (table: string) => any };

/** The permission that marks someone as the reading programme's head at a school. */
export const RCLTP_HEAD_PERMISSION = 'rcltp.config.manage';

/** Which tier answered: a real school head, or the administrator safety net. */
export type RcltpNotifyVia = 'head' | 'admin_fallback';

export interface RcltpNotifyTargets {
  /** De-duplicated profile ids to notify. May be empty — the caller must log that. */
  userIds: string[];
  /** Which tier produced `userIds`. */
  via: RcltpNotifyVia;
  /** The institution the caller asked about, echoed back for logging. */
  institutionId: string | null;
}

function isGranted(value: unknown): boolean {
  return value === true || value === 'true';
}

/**
 * Is `key` granted inside a custom_roles.permissions bag?
 *
 * custom_roles.permissions stores keys BOTH flat ({"rcltp.config.manage": true},
 * which is what the RCLTP grant migration writes) and nested under a module
 * object on some older rows. Flat is checked FIRST because it is the canonical
 * shape; the nested walk is a compatibility net so a role edited through an older
 * surface is not silently read as un-permissioned.
 */
export function permissionGranted(permissions: unknown, key: string): boolean {
  if (!permissions || typeof permissions !== 'object') return false;
  const bag = permissions as Record<string, unknown>;
  if (isGranted(bag[key])) return true;

  const parts = key.split('.');
  for (let i = 1; i < parts.length; i++) {
    const parent = parts.slice(0, i).join('.');
    const rest = parts.slice(i).join('.');
    const child = bag[parent];
    if (child && typeof child === 'object' && permissionGranted(child, rest)) return true;
  }
  return false;
}

interface GrantingRoles {
  roleIds: string[];
  roleKeys: string[];
}

/** Active roles whose permissions bag grants `permission`. */
async function rolesGranting(admin: Admin, permission: string): Promise<GrantingRoles> {
  const { data, error } = await admin
    .from('custom_roles')
    .select('id, role_key, permissions')
    .eq('is_active', true);
  if (error) {
    console.error('[rcltp/notify-targets] role scan failed:', error.message);
    return { roleIds: [], roleKeys: [] };
  }
  const rows = (data ?? []) as Array<{ id: string; role_key: string; permissions: unknown }>;
  const granting = rows.filter((r) => permissionGranted(r.permissions, permission));
  return {
    roleIds: granting.map((r) => r.id).filter(Boolean),
    roleKeys: granting.map((r) => r.role_key).filter(Boolean),
  };
}

/**
 * PostgREST puts `.in()` values in the QUERY STRING, so a large list becomes a
 * URL long enough for the request to be rejected outright — `fetch failed`, not
 * a Postgres error, so it does not even arrive as a row-level problem.
 *
 * This is not hypothetical. `rcltp.config.manage` is held by roles carrying 515
 * distinct users in production today; a single `.in()` over them is ~19 KB of
 * query string and fails every time. And because every read below LOGS AND
 * CONTINUES rather than throwing, that failure is silent: resolveHeads returns
 * empty, the caller falls through to `via: 'admin_fallback'`, and decision 2's
 * head is never told while the JSON reports a clean fallback. Chunking keeps
 * each URL small — 150 ids ≈ 6 KB, well inside every limit in the path.
 *
 * Same constant and helper as lib/services/rcltp/review-chaser.ts, which hit
 * this first; do not invent a second shape for it.
 */
const IN_FILTER_CHUNK = 150;

function chunk<T>(values: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

/**
 * Active, non-super-admin profiles at `institutionId` holding `permission`.
 *
 * Both assignment routes are read, because the platform supports both: the
 * many-to-many `user_roles` table AND the legacy single `profiles.role` column
 * that the multi-role migration kept for backwards compatibility. Reading only
 * one of them would miss whichever way that school's head happens to be wired.
 *
 * Every `.in()` here is chunked — see IN_FILTER_CHUNK.
 */
async function resolveHeads(
  admin: Admin,
  institutionId: string,
  permission: string,
): Promise<string[]> {
  const { roleIds, roleKeys } = await rolesGranting(admin, permission);
  if (roleIds.length === 0 && roleKeys.length === 0) return [];

  const candidateIds = new Set<string>();
  for (const ids of chunk(roleIds, IN_FILTER_CHUNK)) {
    const { data, error } = await admin.from('user_roles').select('user_id').in('role_id', ids);
    if (error) {
      console.error('[rcltp/notify-targets] user_roles scan failed:', error.message);
    } else {
      for (const row of (data ?? []) as Array<{ user_id: string }>) {
        if (row.user_id) candidateIds.add(row.user_id);
      }
    }
  }

  const heads = new Set<string>();

  for (const ids of chunk(Array.from(candidateIds), IN_FILTER_CHUNK)) {
    const { data, error } = await admin
      .from('profiles')
      .select('id, is_super_admin')
      .in('id', ids)
      .eq('institution_id', institutionId)
      .eq('is_active', true);
    if (error) {
      console.error('[rcltp/notify-targets] head profile scan failed:', error.message);
    } else {
      for (const row of (data ?? []) as Array<{ id: string; is_super_admin?: boolean | null }>) {
        if (row.id && row.is_super_admin !== true) heads.add(row.id);
      }
    }
  }

  for (const keys of chunk(roleKeys, IN_FILTER_CHUNK)) {
    const { data, error } = await admin
      .from('profiles')
      .select('id, is_super_admin')
      .in('role', keys)
      .eq('institution_id', institutionId)
      .eq('is_active', true);
    if (error) {
      console.error('[rcltp/notify-targets] legacy-role profile scan failed:', error.message);
    } else {
      for (const row of (data ?? []) as Array<{ id: string; is_super_admin?: boolean | null }>) {
        if (row.id && row.is_super_admin !== true) heads.add(row.id);
      }
    }
  }

  return Array.from(heads);
}

/** Decision 3's safety net: active platform administrators. */
async function resolveAdminFallback(admin: Admin): Promise<string[]> {
  const { data, error } = await admin
    .from('profiles')
    .select('id')
    .eq('is_super_admin', true)
    .eq('is_active', true);
  if (error) {
    console.error('[rcltp/notify-targets] admin fallback scan failed:', error.message);
    return [];
  }
  return Array.from(
    new Set(((data ?? []) as Array<{ id: string }>).map((r) => r.id).filter(Boolean)),
  );
}

/**
 * Decisions 2 + 3 in one call. Head of the owning school first; administrators
 * when there is no active head, or when nothing owns the material.
 *
 * Never throws — a failed read degrades to the administrator tier rather than
 * dropping the message, because silence is the exact failure these decisions
 * were taken to end.
 */
export async function resolveRcltpNotifyTargets(
  admin: Admin,
  opts: { institutionId?: string | null } = {},
): Promise<RcltpNotifyTargets> {
  const institutionId = opts.institutionId ?? null;

  if (institutionId) {
    try {
      const heads = await resolveHeads(admin, institutionId, RCLTP_HEAD_PERMISSION);
      if (heads.length > 0) {
        return { userIds: heads, via: 'head', institutionId };
      }
    } catch (e) {
      console.error(
        '[rcltp/notify-targets] head resolution threw, falling back to administrators:',
        e instanceof Error ? e.message : e,
      );
    }
  }

  let userIds: string[] = [];
  try {
    userIds = await resolveAdminFallback(admin);
  } catch (e) {
    console.error(
      '[rcltp/notify-targets] admin fallback threw:',
      e instanceof Error ? e.message : e,
    );
  }
  return { userIds, via: 'admin_fallback', institutionId };
}

/**
 * Which school the reading programme belongs to, for notices that are about the
 * programme as a whole rather than about one passage.
 *
 * The overnight empty-night notice has no passage to key from — its whole point
 * is that there was nothing to work on. The only signal available for "whose
 * reading material is missing" is the passage bank itself, so this returns the
 * institution of the most recently added passage THE SWEEP WOULD CONSIDER. A
 * school with no such passages yields null, which resolveRcltpNotifyTargets
 * turns into the administrator fallback — exactly decision 3.
 *
 * THE FILTER HERE MUST MATCH findCandidatePassages() — is_active AND
 * status='approved' AND language='en'. Filtering on is_active alone answered a
 * different question from the sweep it reports on: the content console saves a
 * new passage as a DRAFT, which is exactly what this notice asks people to go
 * and do, so the first draft typed at ANY school would become "the most recent
 * active passage" and redirect the notice to that school's head — while the
 * school actually in drought heard nothing. Non-English passages are excluded
 * for the same reason: the sweep never looks at them, so they cannot be the
 * reason it found nothing.
 *
 * LIMITATION, stated plainly: with more than one school running the programme
 * this names the most recently active one, not all of them. Today only Nattraja
 * Vidhyalya has reading material, so it resolves to that school. Widening to a
 * multi-school fan-out needs a multi-institution variant of the resolver above,
 * and is deliberately not built here.
 */
export async function resolveRcltpProgrammeInstitutionId(admin: Admin): Promise<string | null> {
  const { data, error } = await admin
    .from('rcltp_passages')
    .select('institution_id')
    .eq('is_active', true)
    .eq('status', 'approved')
    .eq('language', 'en')
    .not('institution_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) {
    console.error('[rcltp/notify-targets] programme institution read failed:', error.message);
    return null;
  }
  const row = (data ?? [])[0] as { institution_id?: string | null } | undefined;
  return row?.institution_id ?? null;
}
