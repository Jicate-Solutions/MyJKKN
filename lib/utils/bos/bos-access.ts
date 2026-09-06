import { createClient } from '@/lib/supabase/server';
import { isBosChairmanRow } from '@/types/bos';

export interface BosAccessScope {
  isSuperAdmin: boolean;
  institutionsId: string | null;
  /**
   * All MyJKKN institution UUIDs that belong to the same COE institution.
   * For most institutions this is [institutionsId]. For CAS it contains both
   * the Aided and Self-Financing UUIDs so queries don't miss cross-ID records.
   */
  allInstitutionIds: string[];
  /** The user's own institution regardless of super_admin status. Use as a default when creating records without an explicit institution. */
  userInstitutionId: string | null;
  role: string | null;
}

export async function resolveBosAccess(userId: string): Promise<BosAccessScope> {
  const supabase = await createClient();

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role, is_super_admin, institution_id')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    return { isSuperAdmin: false, institutionsId: null, allInstitutionIds: [], userInstitutionId: null, role: null };
  }

  const isSuperAdmin =
    profile.is_super_admin === true || profile.role === 'super_admin';

  if (isSuperAdmin) {
    return {
      isSuperAdmin: true,
      institutionsId: null,
      allInstitutionIds: [],
      userInstitutionId: profile.institution_id ?? null,
      role: profile.role,
    };
  }

  const institutionId: string | null = profile.institution_id ?? null;

  // For CAS institutions, two MyJKKN UUIDs (Aided + Self) share the same
  // counselling_code. Resolve sibling IDs from the COE API (authoritative MDM source)
  // which caches the result for 10 minutes — no network penalty after first call.
  // Falls back to the Supabase counselling_code join if the COE lookup fails.
  let allInstitutionIds: string[] = institutionId ? [institutionId] : [];
  if (institutionId) {
    try {
      const { resolveInstitutionContext } = await import('@/lib/utils/institutions/institution-resolver');
      const ctx = await resolveInstitutionContext(institutionId, supabase);
      if (ctx?.myjkkn_institution_ids && ctx.myjkkn_institution_ids.length > 0) {
        allInstitutionIds = ctx.myjkkn_institution_ids;
      }
    } catch {
      // COE unavailable — fall back to Supabase counselling_code siblings
      const { data: inst } = await supabase
        .from('institutions')
        .select('counselling_code')
        .eq('id', institutionId)
        .single();

      if (inst?.counselling_code) {
        const { data: siblings } = await supabase
          .from('institutions')
          .select('id')
          .eq('counselling_code', inst.counselling_code)
          .eq('is_active', true);

        if (siblings && siblings.length > 0) {
          allInstitutionIds = siblings.map((s: { id: string }) => s.id);
        }
      }
    }
  }

  return {
    isSuperAdmin: false,
    institutionsId: institutionId,
    allInstitutionIds,
    userInstitutionId: institutionId,
    role: profile.role,
  };
}

/**
 * Expands an arbitrary institution UUID to all of its CAS siblings — every
 * institution that shares its counselling_code (Aided + Self for a CAS college;
 * just itself for everyone else). Always includes the input id, even if the
 * counselling_code lookup returns nothing.
 *
 * Unlike resolveBosAccess (which expands the *caller's* institution), this
 * takes any institution id, so it works for super-admins creating records for
 * other institutions. Use it wherever a per-institution DB constraint needs to
 * be enforced across the CAS pair — e.g. the member-type name uniqueness check.
 */
export async function casSiblingInstitutionIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  institutionsId: string
): Promise<string[]> {
  const { data: inst } = await supabase
    .from('institutions')
    .select('counselling_code')
    .eq('id', institutionsId)
    .maybeSingle();

  const code = (inst?.counselling_code as string | undefined) ?? null;
  if (!code) return [institutionsId];

  const { data: siblings } = await supabase
    .from('institutions')
    .select('id')
    .eq('counselling_code', code);

  const ids = new Set<string>([institutionsId]);
  for (const s of (siblings ?? []) as { id: string }[]) ids.add(s.id);
  return [...ids];
}

export function guardInstitutionWrite(
  scope: BosAccessScope,
  targetInstitutionsId: string | undefined | null
): string | null {
  if (scope.isSuperAdmin) return null;
  if (!targetInstitutionsId) return null;
  // CAS-aware: a user whose primary institution is one sibling of a CAS pair
  // (Aided/SF) is allowed to write to either sibling — BoS treats the pair as
  // one logical institution per counselling_code. Without this, the strict
  // equality check rejected legitimate writes to the sibling UUID.
  const allowed = new Set<string>([
    ...(scope.institutionsId ? [scope.institutionsId] : []),
    ...scope.allInstitutionIds,
  ]);
  if (allowed.size === 0) return null; // No scope to enforce (super-admin handled above).
  if (!allowed.has(targetInstitutionsId)) {
    return 'Forbidden: you can only manage BoS records for your own institution';
  }
  return null;
}

/**
 * Returns the list of institution_id values the caller is allowed to READ.
 *
 * Use this on every list/detail GET that filters by institutions_id.
 * Apply it as:
 *   const ids = readableInstitutionIds(scope);
 *   if (ids === null) // super-admin → no filter
 *   else if (ids.length === 0) // no institution → empty result
 *   else if (ids.length === 1) query.eq('institutions_id', ids[0])
 *   else query.in('institutions_id', ids)
 *
 * Returns:
 *  - null for super-admin OR a read-all observer (no filter — caller may apply its own).
 *  - [] when the user has no institution at all (deny).
 *  - [id] for a normal single-institution user.
 *  - [aided, self] for CAS users (so they see records under either UUID).
 *
 * `canReadAll` (default false) lifts the institution filter for a read-only
 * observer — a role that holds the module's `*.view` grant. See hasBosPermission.
 * READ-ONLY: never wire this into a write guard.
 */
export function readableInstitutionIds(scope: BosAccessScope, canReadAll = false): string[] | null {
  if (scope.isSuperAdmin || canReadAll) return null;
  if (scope.allInstitutionIds.length > 0) return scope.allInstitutionIds;
  return scope.institutionsId ? [scope.institutionsId] : [];
}

/**
 * Counselling-code counterpart of `readableInstitutionIds`, for reads that
 * filter on the denormalized `bos_*.counselling_code` column (added 2026-06-18).
 *
 * Because both CAS siblings share one counselling_code, we only need the user's
 * OWN institution's code — no sibling-pair reconstruction. Apply as:
 *   const codes = await readableCounsellingCodes(scope);
 *   if (codes === null) { /* super-admin → no filter *\/ }
 *   else if (codes.length === 0) { /* deny → empty *\/ }
 *   else query = query.in('counselling_code', codes);
 *
 * Returns:
 *  - null for super-admin OR a read-all observer (no filter).
 *  - [] when the user has no institution (deny).
 *  - [code] for a normal user (covers the CAS pair via the shared code).
 *
 * `canReadAll` (default false) lifts the filter for a read-only observer.
 * READ-ONLY: never wire this into a write guard.
 */
export async function readableCounsellingCodes(scope: BosAccessScope, canReadAll = false): Promise<string[] | null> {
  if (scope.isSuperAdmin || canReadAll) return null;
  if (!scope.institutionsId) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('institutions')
    .select('counselling_code')
    .eq('id', scope.institutionsId)
    .maybeSingle();
  const code = (data?.counselling_code as string | undefined) ?? null;
  return code ? [code] : [];
}

export function applyInstitutionScope(
  scope: BosAccessScope,
  clientInstitutionsId: string | null | undefined
): string | null {
  if (scope.isSuperAdmin) return clientInstitutionsId ?? null;
  return scope.institutionsId;
}

// ── Module/action-style RBAC for new BoS tabs (Courses, Course Scheme) ────────
// The legacy helpers above (resolveBosAccess, guardInstitutionWrite,
// applyInstitutionScope) operate on institution-scoping. The helper below
// adds explicit module+action checks used by /api/bos/courses-master and
// /api/bos/course-mapping proxy routes.

// Module strings match the runtime convention used elsewhere in this codebase
// (see BOS_MODULES in lib/services/bos/bos-role-permissions.ts).
export type BosModule = 'academic.bos-courses' | 'academic.bos-scheme';
export type BosAction = 'view' | 'create' | 'edit' | 'delete' | 'import';

/**
 * Server-side check: does this user hold a specific permission key?
 * Super-admin short-circuits to true. Otherwise RPC into user_has_permission()
 * — the canonical check that reads the JSONB `custom_roles.permissions` field
 * (same source RLS uses, and the same source `lib/services/bos/bos-role-permissions`
 * seeds via flat keys like 'academic.bos-courses.view'). Using this over the
 * unseeded `role_permissions` table avoids the dual-permission-system mismatch
 * we hit on bos_members earlier.
 *
 * This is the engine behind the read-only observer tier: read GET handlers call
 * it with their module's `*.view` key to decide whether the caller may READ all
 * institutions' data. READ-ONLY — never gate a write on the result of a
 * `.view` check.
 */
export async function hasBosPermission(userId: string, permissionKey: string): Promise<boolean> {
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_super_admin, role')
    .eq('id', userId)
    .single();

  if (profile?.is_super_admin === true || profile?.role === 'super_admin') {
    return true;
  }

  const { data: hasPerm, error } = await supabase.rpc('user_has_permission', {
    permission_name: permissionKey,
  });

  if (error) {
    console.error('[hasBosPermission] user_has_permission RPC error:', { permissionKey, error });
    return false;
  }

  return hasPerm === true;
}

/**
 * View-grant keys that unlock the read-all observer tier on the shared BoS
 * lookup routes (institutions / boards / programs dropdowns). Any ONE of these
 * is sufficient: the dropdowns feed multiple tabs (Courses, Course Scheme,
 * Syllabus), so a user granted only e.g. `academic.bos-scheme.view` must still
 * get populated dropdowns on /bos/course-scheme. Checking only
 * `academic.bos-courses.view` (the original key) left scheme/syllabus-only
 * grants with disabled dropdowns.
 */
export const BOS_LOOKUP_VIEW_KEYS = [
  'academic.bos-courses.view',
  'academic.bos-scheme.view',
  'academic.bos-syllabus.view',
] as const;

/**
 * True when the user holds ANY of the given permission keys.
 * Fetches the profile once (super-admin short-circuit), then probes the
 * user_has_permission RPC per key until one hits. Use with
 * BOS_LOOKUP_VIEW_KEYS on shared lookup routes; single-module routes should
 * keep calling hasBosPermission with their own key.
 */
export async function hasAnyBosPermission(userId: string, permissionKeys: readonly string[]): Promise<boolean> {
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_super_admin, role')
    .eq('id', userId)
    .single();

  if (profile?.is_super_admin === true || profile?.role === 'super_admin') {
    return true;
  }

  for (const permissionKey of permissionKeys) {
    const { data: hasPerm, error } = await supabase.rpc('user_has_permission', {
      permission_name: permissionKey,
    });
    if (error) {
      console.error('[hasAnyBosPermission] user_has_permission RPC error:', { permissionKey, error });
      continue;
    }
    if (hasPerm === true) return true;
  }
  return false;
}

/**
 * Server-side permission check for BoS modules.
 * Mirrors the client-side usePermissions().canAccess() but runs in API routes.
 * Super-admin short-circuits to true via profiles.is_super_admin.
 */
export async function canAccessBos(
  userId: string,
  module: BosModule,
  action: BosAction
): Promise<boolean> {
  return hasBosPermission(userId, `${module}.${action}`);
}

/**
 * Re-export — COE institution mapping is shared with Internal Marks.
 */
export { resolveCoeInstitutionId, resolveCoeInstitutionCode, resolveCoeInstitutionById } from '@/lib/utils/internal-marks/internal-marks-access';

// ── Board-level scoping (Phase 1 of BOS access tightening) ──────────────────
// Layers on top of resolveBosAccess / guardInstitutionWrite. Adds two new
// scoping dimensions inside an institution:
//   1. Board membership   — bos_members.staff_id = me → composition_id(s)
//   2. Record ownership   — created_by = me (used by syllabus edit guard)
// Plus a Principal carve-out: principals see every composition in their
// institution(s) but can only run status/approve mutations, never field edits.

export interface BosBoardScope extends BosAccessScope {
  /** True when profile.role === 'principal' (the "governor" in BoS terms). */
  isPrincipal: boolean;
  /** This user's staff.id (joined via staff.user_id). Null if no staff row. */
  staffId: string | null;
  /** composition_ids the user appears in (bos_members.staff_id = me, both rows + composition active). */
  memberOf: Set<string>;
  /** composition_ids the user chairs (member_type='chairman'). Subset of memberOf. */
  isChairmanIn: Set<string>;
  /**
   * board_ids derived from memberOf compositions. Needed because some local
   * tables (bos_course_syllabi) carry board_id but not composition_id, so
   * we filter them via the union of boards across the user's active comps.
   */
  boardsOf: Set<string>;
  /**
   * Subset of boardsOf where the user is chairman of at least one active
   * composition tied to that board. Used by guardSyllabusEdit to grant
   * board-chairman edit rights on syllabi (which only carry board_id).
   */
  chairmanForBoards: Set<string>;
  /**
   * MyJKKN institution_ids derived from the user's active compositions
   * (bos_compositions.institution_id for every composition in memberOf).
   *
   * Use this instead of `institutionsId` (single) when a query needs to span
   * every institution the user has board membership in — e.g. a faculty
   * member who serves on Board A under Institution X and Board B under
   * Institution Y must see courses from both. See
   * /api/bos/courses-master GET for the fan-out pattern.
   */
  institutionsOf: Set<string>;
}

/**
 * Discriminated-union describing how a caller should filter composition-scoped
 * queries. Designed so route handlers can write a single switch:
 *
 *   const f = compositionScopeFilter(scope);
 *   switch (f.kind) {
 *     case 'all':            // no filter — super-admin
 *     case 'byInstitution':  // query.in('institution_id', f.ids)        — principal
 *     case 'byComposition':  // query.in('composition_id', f.ids)        — chairman/member
 *     case 'none':           // return [] — user has no BoS access at all
 *   }
 */
export type CompositionScopeFilter =
  | { kind: 'all' }
  | { kind: 'byInstitution'; ids: string[] }
  | { kind: 'byComposition'; ids: string[] }
  | { kind: 'none' };

/**
 * Resolves the full board-level scope for a user. One extra round-trip vs.
 * resolveBosAccess (staff lookup + bos_members lookup). Returns empty sets
 * (not null) when there is no membership so callers can pass them to
 * compositionScopeFilter without null-guards.
 *
 * Principal note: we still resolve memberOf/isChairmanIn even for principals
 * because a principal who also chairs a specific board should still be
 * treated as chairman for that one record (rare but supported).
 */
export async function resolveBosBoardScope(userId: string): Promise<BosBoardScope> {
  const baseScope = await resolveBosAccess(userId);

  const emptyExtension = {
    isPrincipal: false,
    staffId: null as string | null,
    memberOf: new Set<string>(),
    isChairmanIn: new Set<string>(),
    boardsOf: new Set<string>(),
    chairmanForBoards: new Set<string>(),
    institutionsOf: new Set<string>(),
  };

  // Super-admin: short-circuit. No need to resolve staff_id or memberships
  // because compositionScopeFilter returns { kind: 'all' } for them.
  if (baseScope.isSuperAdmin) {
    return { ...baseScope, ...emptyExtension };
  }

  const supabase = await createClient();
  const isPrincipal = baseScope.role === 'principal';

  // Find this user's staff record. Pre-registered users may have no staff row;
  // they fall through to "no memberships" which compositionScopeFilter maps to
  // { kind: 'none' } (zero data visible) for non-principals.
  // NOTE: staff.profile_id is the canonical link to auth.users.id (via
  // profiles.id = auth.users.id) — added by 20250121_add_profile_id_to_staff.
  // Earlier services that used .eq('user_id', ...) on staff were silently
  // returning null because the column doesn't exist.
  const { data: staffRow } = await supabase
    .from('staff')
    .select('id')
    .eq('profile_id', userId)
    .maybeSingle();

  const staffId = (staffRow?.id as string | undefined) ?? null;

  if (!staffId) {
    return { ...baseScope, ...emptyExtension, isPrincipal };
  }

  // Embedded inner-join filter: only active members of active compositions.
  // PostgREST recognises bos_members.composition_id → bos_compositions(id) FK
  // and lets us filter the parent by an embedded column with !inner + .eq.
  // Also select institutions_id (plural — renamed by migration 20260424 from
  // the original singular `institution_id`) from the embedded composition so
  // we can build institutionsOf. Needed for cross-institution membership (a
  // faculty on boards under multiple institutions). Without it, downstream
  // API routes collapse the user to a single institution and silently drop
  // the rest.
  const { data: memberRows } = await supabase
    .from('bos_members')
    .select('composition_id, member_type, member_type_rec:bos_member_types(base_type), bos_compositions!inner(id, board_id, institutions_id, is_active)')
    .eq('staff_id', staffId)
    .eq('is_active', true)
    .eq('bos_compositions.is_active', true);

  const memberOf = new Set<string>();
  const isChairmanIn = new Set<string>();
  const boardsOf = new Set<string>();
  const chairmanForBoards = new Set<string>();
  const institutionsOf = new Set<string>();
  type EmbeddedRow = {
    composition_id: string;
    member_type: string | null;
    member_type_rec: { base_type: string | null } | null;
    // Supabase returns the embed as a single object for many-to-one FKs.
    bos_compositions: { id: string; board_id: string | null; institutions_id: string | null; is_active: boolean } | null;
  };
  for (const row of (memberRows ?? []) as EmbeddedRow[]) {
    if (!row.composition_id) continue;
    memberOf.add(row.composition_id);
    const boardId = row.bos_compositions?.board_id ?? null;
    const compInstitutionId = row.bos_compositions?.institutions_id ?? null;
    if (boardId) boardsOf.add(boardId);
    if (compInstitutionId) institutionsOf.add(compInstitutionId);
    // member_type stores the catalog type NAME since 20260710150000 — chairman
    // is recognised via the catalog base_type, with a case-insensitive literal
    // fallback for legacy/unlinked rows. Mirrors the DB helper predicate.
    if (isBosChairmanRow(row)) {
      isChairmanIn.add(row.composition_id);
      if (boardId) chairmanForBoards.add(boardId);
    }
  }

  // Multi-board: a composition may govern MULTIPLE boards via the
  // bos_composition_boards junction (the embedded board_id above is only the
  // PRIMARY board). Expand boardsOf/chairmanForBoards to every board of the
  // user's compositions so a member of a multi-board composition reaches all
  // those boards' courses/syllabi/programmes across /bos/* (those read paths
  // gate on boardsOf). Additive — the primary board is already in the sets.
  if (memberOf.size > 0) {
    const { data: compBoards } = await supabase
      .from('bos_composition_boards')
      .select('composition_id, board_id')
      .in('composition_id', Array.from(memberOf));
    for (const row of (compBoards ?? []) as { composition_id: string; board_id: string }[]) {
      if (!row.board_id) continue;
      boardsOf.add(row.board_id);
      if (isChairmanIn.has(row.composition_id)) chairmanForBoards.add(row.board_id);
    }
  }

  return {
    ...baseScope,
    isPrincipal,
    staffId,
    memberOf,
    isChairmanIn,
    boardsOf,
    chairmanForBoards,
    institutionsOf,
  };
}

/**
 * Derives the right query filter for a composition-scoped GET handler.
 * Super-admin OR read-all observer → 'all'. Principal → 'byInstitution'
 * (CAS-aware via allInstitutionIds). Members/chairman → 'byComposition' over
 * their memberships. Anyone else → 'none' (return empty list).
 *
 * `canReadAll` (default false) lifts scoping to 'all' for a read-only observer
 * — a role holding the module's `*.view` grant. READ-ONLY: never wire this into
 * a write guard.
 */
/**
 * Read-all resolver — the single source of truth for the BoS "read-all" tier.
 *
 * Pure permission-driven (chosen 2026-07-11): ANY role that holds the module's
 * `*.view` grant reads that module's data across ALL institutions — VIEW ONLY.
 * There is deliberately NO membership/principal gate. A board member or
 * principal who also holds the grant therefore sees every institution's data
 * (read-only); their WRITE scope is unchanged because writes are gated
 * separately by guard*Write, never by this flag.
 *
 * Grant access purely by toggling `academic.bos-*.view` on a role in the RBAC
 * dialog — no code change per role.
 *
 * Super-admin returns false here because their own path already yields read-all;
 * callers combine as `scope.isSuperAdmin || isBosReadAllObserver(...)`.
 *
 * READ-ONLY: never pass the result of this into a write guard.
 *
 * NB: `scope` stays in the signature (only isSuperAdmin is read) so a
 * membership gate could be reintroduced later without touching ~19 call sites.
 */
export function isBosReadAllObserver(scope: BosBoardScope, hasViewGrant: boolean): boolean {
  if (scope.isSuperAdmin) return false;
  // Pure permission-driven: holding the view grant is sufficient. No membership
  // or principal gate — see the doc comment above.
  return hasViewGrant;
}

export function compositionScopeFilter(scope: BosBoardScope, canReadAll = false): CompositionScopeFilter {
  if (scope.isSuperAdmin || canReadAll) return { kind: 'all' };

  if (scope.isPrincipal) {
    const ids = scope.allInstitutionIds.length > 0
      ? scope.allInstitutionIds
      : scope.institutionsId
        ? [scope.institutionsId]
        : [];
    return ids.length > 0 ? { kind: 'byInstitution', ids } : { kind: 'none' };
  }

  if (scope.memberOf.size === 0) return { kind: 'none' };
  return { kind: 'byComposition', ids: Array.from(scope.memberOf) };
}

/**
 * Write-gate for any mutation that targets a specific composition (courses,
 * meetings, ta-da, members, the composition itself).
 *   - super-admin → allowed
 *   - principal → DENIED (use guardPrincipalApprovalOnly for status/approve ops)
 *   - everyone else → must be in bos_members for that composition_id
 *
 * Pass-through when compositionId is null/undefined so callers can use this
 * before the FK is known (e.g., bulk endpoints) — they should call again per-row.
 */
export function guardCompositionWrite(
  scope: BosBoardScope,
  compositionId: string | null | undefined
): string | null {
  if (scope.isSuperAdmin) return null;
  if (!compositionId) return null;
  if (scope.isPrincipal) {
    return 'Forbidden: principals have read-only access to board data (use approval endpoints for status changes)';
  }
  if (!scope.memberOf.has(compositionId)) {
    return 'Forbidden: you can only modify data for compositions you belong to';
  }
  return null;
}

/**
 * Course-write authorization for /api/bos/courses-master {POST, PUT, DELETE}.
 *
 * Allow when:
 *   - super-admin, OR
 *   - target institution is the user's own primary (allInstitutionIds — CAS-aware), OR
 *   - target institution is in scope.institutionsOf (user has an active
 *     composition under that institution — multi-institution membership).
 *
 * The third clause is the only difference from guardInstitutionWrite: course
 * writes are gated by board membership, so any institution where the user
 * serves on a board is fair game. Used in lieu of guardInstitutionWrite for
 * the courses routes; leave the legacy helper alone for routes that still
 * mean "must be your own institution" (members, meetings, ta-da).
 */
export function guardCourseInstitutionWrite(
  scope: BosBoardScope,
  targetInstitutionId: string | undefined | null,
): string | null {
  if (scope.isSuperAdmin) return null;
  if (!targetInstitutionId) return null;
  const allowed = new Set<string>([
    ...(scope.institutionsId ? [scope.institutionsId] : []),
    ...scope.allInstitutionIds,
    ...scope.institutionsOf,
  ]);
  if (allowed.size === 0) return null;
  if (!allowed.has(targetInstitutionId)) {
    return 'Forbidden: you can only manage courses for institutions where you serve on a board';
  }
  return null;
}

/**
 * Stricter variant of guardCompositionWrite for operations that must be limited
 * to the board chairman (a.k.a. HOD): editing the composition record itself,
 * adding/removing members, deleting the composition.
 *
 *   - super-admin → allowed
 *   - principal → denied (they're read-only on board data)
 *   - chairman of this composition → allowed
 *   - any other member → denied
 */
export function guardCompositionChairman(
  scope: BosBoardScope,
  compositionId: string | null | undefined
): string | null {
  if (scope.isSuperAdmin) return null;
  if (!compositionId) return null;
  if (scope.isPrincipal) {
    return 'Forbidden: principals have read-only access to board data';
  }
  if (!scope.isChairmanIn.has(compositionId)) {
    return 'Forbidden: only the board chairman can modify this composition';
  }
  return null;
}

/**
 * Write-gate for Academic Council (AC) bodies and meetings.
 *
 * This is the deliberate INVERSE of guardCompositionChairman: for a subject-
 * level BoS, the chairman schedules and the principal only approves; for the
 * institution-level Academic Council, the PRINCIPAL is the convener/scheduler
 * and there is no separate approval step.
 *
 *   - super-admin → allowed
 *   - principal (within scope of the target institution) → allowed
 *   - anyone else (including BoS chairmen, who are AC *members*) → denied
 *
 * CAS-aware: a principal of one sibling UUID (Aided/SF) may manage AC records
 * for either sibling, mirroring guardInstitutionWrite.
 */
export function guardAcademicCouncilWrite(
  scope: BosBoardScope,
  targetInstitutionsId: string | null | undefined
): string | null {
  if (scope.isSuperAdmin) return null;
  if (!scope.isPrincipal) {
    return 'Forbidden: only the principal (or a super admin) can manage Academic Council meetings';
  }
  if (targetInstitutionsId) {
    const inScope =
      scope.allInstitutionIds.includes(targetInstitutionsId) ||
      scope.institutionsId === targetInstitutionsId;
    if (!inScope) {
      return 'Forbidden: you can only manage the Academic Council of your own institution';
    }
  }
  return null;
}

/**
 * Write-gate for Governing Body (GB) bodies and meetings.
 *
 * Identical policy to guardAcademicCouncilWrite (the Governing Body is modelled
 * "all as same" as the Academic Council): super-admin OR the institution's
 * principal (CAS-aware) may manage GB records; everyone else is denied. Kept as
 * a separate function so the denial messages read correctly for the GB module.
 */
export function guardGoverningBodyWrite(
  scope: BosBoardScope,
  targetInstitutionsId: string | null | undefined
): string | null {
  if (scope.isSuperAdmin) return null;
  if (!scope.isPrincipal) {
    return 'Forbidden: only the principal (or a super admin) can manage Governing Body meetings';
  }
  if (targetInstitutionsId) {
    const inScope =
      scope.allInstitutionIds.includes(targetInstitutionsId) ||
      scope.institutionsId === targetInstitutionsId;
    if (!inScope) {
      return 'Forbidden: you can only manage the Governing Body of your own institution';
    }
  }
  return null;
}

/**
 * Special-case write-gate for syllabus records.
 *
 * Syllabi (bos_course_syllabi) carry board_id (not composition_id), and the
 * created_by column references auth.users(id) — NOT staff.id. So this guard
 * takes both the syllabus row and the current auth user id explicitly.
 *
 * Allow when:
 *   - super-admin, OR
 *   - this user authored the syllabus (created_by = currentUserId), OR
 *   - this user chairs any active composition tied to the syllabus's board.
 * Board members who didn't author are explicitly view-only per spec.
 */
export function guardSyllabusEdit(
  scope: BosBoardScope,
  syllabus: { board_id: string | null; created_by: string | null },
  currentUserId: string,
): string | null {
  if (scope.isSuperAdmin) return null;
  if (!syllabus.board_id) {
    return 'Forbidden: syllabus has no board assignment';
  }
  if (syllabus.created_by && syllabus.created_by === currentUserId) {
    return null;
  }
  if (scope.chairmanForBoards.has(syllabus.board_id)) return null;
  return 'Forbidden: only the syllabus creator, the board chairman, or a super admin can edit this syllabus';
}

export type PrincipalApprovalOp = 'status' | 'approve' | 'field-edit';

/**
 * Approval-only carve-out for principals.
 *
 * Intended call pattern in routes that accept both principal approvals AND
 * board-member writes (meeting status transitions, agenda actions, syllabus
 * status flips):
 *
 *   if (scope.isPrincipal) {
 *     const deny = guardPrincipalApprovalOnly(scope, 'status', record.institution_id);
 *     if (deny) return 403;
 *   } else {
 *     const deny = guardCompositionWrite(scope, record.composition_id);
 *     if (deny) return 403;
 *   }
 *
 * Returns null (allow) when the user is not a principal — those callers
 * fall through to the normal guardCompositionWrite path.
 */
export function guardPrincipalApprovalOnly(
  scope: BosBoardScope,
  op: PrincipalApprovalOp,
  targetInstitutionsId: string | null | undefined
): string | null {
  if (scope.isSuperAdmin) return null;
  if (!scope.isPrincipal) return null;

  if (op === 'field-edit') {
    return 'Forbidden: principals can approve workflow actions but cannot edit field data';
  }

  if (targetInstitutionsId) {
    const inScope =
      scope.allInstitutionIds.includes(targetInstitutionsId) ||
      scope.institutionsId === targetInstitutionsId;
    if (!inScope) {
      return 'Forbidden: you can only approve actions within your own institution';
    }
  }
  return null;
}
