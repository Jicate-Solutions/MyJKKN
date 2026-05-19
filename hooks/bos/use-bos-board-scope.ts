'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';

// Wire shape for the JSON returned by /api/bos/scope. Arrays at the boundary
// are widened back to Sets in the hook return for O(1) `.has()` checks.
interface BosBoardScopeWire {
  isSuperAdmin: boolean;
  isPrincipal: boolean;
  role: string | null;
  institutionsId: string | null;
  allInstitutionIds: string[];
  userInstitutionId: string | null;
  staffId: string | null;
  memberOf: string[];
  isChairmanIn: string[];
  boardsOf: string[];
  chairmanForBoards: string[];
  // Institutions where the user has at least one active composition. May
  // contain institutions other than their profile.institution_id when a
  // faculty serves on boards across institutions.
  institutionsOf: string[];
}

export interface BosBoardScopeClient {
  isSuperAdmin: boolean;
  isPrincipal: boolean;
  /** Convenience: super-admin OR member of at least one composition. */
  hasAnyAccess: boolean;
  role: string | null;
  institutionsId: string | null;
  allInstitutionIds: string[];
  userInstitutionId: string | null;
  staffId: string | null;
  memberOf: Set<string>;
  isChairmanIn: Set<string>;
  boardsOf: Set<string>;
  chairmanForBoards: Set<string>;
  institutionsOf: Set<string>;
  /** True until the request resolves — UI should treat this as "no access yet". */
  isLoading: boolean;
}

/**
 * Builds the React Query cache key. MUST include the authenticated user.id
 * so a new session doesn't read the previous user's cached scope — without
 * this, switching accounts (or login-out/login-in) briefly showed the prior
 * user's compositions until staleTime expired or a full page refresh wiped
 * the cache. Root cause: providers/query-client-provider.tsx exposes a
 * module-level singleton QueryClient that survives session changes.
 */
export const bosBoardScopeKey = (userId: string | null | undefined) =>
  ['bos-board-scope', userId ?? 'anonymous'] as const;

async function fetchBosBoardScope(): Promise<BosBoardScopeWire> {
  const res = await fetch('/api/bos/scope', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load BoS scope: ${res.status}`);
  return res.json();
}

const EMPTY_SCOPE: BosBoardScopeClient = {
  isSuperAdmin: false,
  isPrincipal: false,
  hasAnyAccess: false,
  role: null,
  institutionsId: null,
  allInstitutionIds: [],
  userInstitutionId: null,
  staffId: null,
  memberOf: new Set(),
  isChairmanIn: new Set(),
  boardsOf: new Set(),
  chairmanForBoards: new Set(),
  institutionsOf: new Set(),
  isLoading: true,
};

/**
 * Single source of truth on the client for BoS authorization decisions.
 * Returns deterministic Sets so guard helpers below can do O(1) membership
 * checks (e.g., scope.isChairmanIn.has(compositionId)).
 *
 * While loading or on error: returns EMPTY_SCOPE with isLoading=true so
 * permission-gated UI defaults to hidden — fail-closed.
 */
export function useBosBoardScope(): BosBoardScopeClient {
  const { profile } = useAuth();
  const userId = profile?.id ?? null;

  const { data, isLoading } = useQuery({
    queryKey: bosBoardScopeKey(userId),
    queryFn: fetchBosBoardScope,
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return useMemo<BosBoardScopeClient>(() => {
    if (!data) return { ...EMPTY_SCOPE, isLoading };
    return {
      isSuperAdmin: data.isSuperAdmin,
      isPrincipal: data.isPrincipal,
      hasAnyAccess: data.isSuperAdmin || data.isPrincipal || data.memberOf.length > 0,
      role: data.role,
      institutionsId: data.institutionsId,
      allInstitutionIds: data.allInstitutionIds,
      userInstitutionId: data.userInstitutionId,
      staffId: data.staffId,
      memberOf: new Set(data.memberOf),
      isChairmanIn: new Set(data.isChairmanIn),
      boardsOf: new Set(data.boardsOf),
      chairmanForBoards: new Set(data.chairmanForBoards),
      institutionsOf: new Set(data.institutionsOf ?? []),
      isLoading: false,
    };
  }, [data, isLoading]);
}

// ── Client-side guard helpers (mirror the server-side bos-access.ts) ─────────
// Pure functions — safe to call in render. Use these instead of inlining the
// check logic so the rules stay consistent with the server.

export function canCreateComposition(scope: BosBoardScopeClient): boolean {
  // While the scope is still loading we used to fail-closed (return false),
  // which hid the New Composition button during the /api/bos/scope round trip.
  // For HOD/Faculty the answer is "true" regardless of scope (only Principal
  // is explicitly denied), so failing-closed produced a visible glitch:
  // permission-passing users saw no button until the scope resolved.
  // We now fail-open during loading and rely on the explicit isPrincipal check
  // once data arrives. The role-permission gate (canAccess('...','create'))
  // upstream still blocks users who lack the perm, and the server still
  // enforces all write authorization, so this is purely a UX softening.
  if (scope.isSuperAdmin) return true;
  // Principals cannot create compositions (read-only on board data). Only
  // applied once we *know* the role — while loading, isPrincipal is false
  // by default, so principals briefly see the button and then it disappears.
  // That's an acceptable trade vs. permanently hiding it for HOD.
  if (!scope.isLoading && scope.isPrincipal) return false;
  // HOD / facilitator etc.: the *first* composition might not exist yet, so
  // we don't require existing membership — the server enforces institution
  // ownership via scope.userInstitutionId. The role-permission system
  // (academic.bos-compositions.create) is the upstream gate; this layer only
  // adds the "no principal" carve-out.
  return true;
}

/**
 * Edit/delete/manage-members for a composition: chairman OR super-admin OR
 * **creator of the row** (bootstrap case — the HOD who just created the comp
 * needs to add the chairman row before isChairmanIn ever contains anything).
 *
 * The creator check requires knowing if the current user authored that
 * specific row, which the scope hook doesn't carry by default. Pass
 * `createdByMe` when the caller has the row's created_by available.
 */
export function canEditComposition(
  scope: BosBoardScopeClient,
  compositionId: string | null | undefined,
  createdByMe?: boolean,
): boolean {
  if (scope.isLoading || !compositionId) return false;
  if (scope.isSuperAdmin) return true;
  if (createdByMe) return true;
  return scope.isChairmanIn.has(compositionId);
}

export function canDeleteComposition(
  scope: BosBoardScopeClient,
  compositionId: string | null | undefined,
  createdByMe?: boolean,
): boolean {
  return canEditComposition(scope, compositionId, createdByMe);
}

export function canManageMembers(
  scope: BosBoardScopeClient,
  compositionId: string | null | undefined,
  createdByMe?: boolean,
): boolean {
  return canEditComposition(scope, compositionId, createdByMe);
}

export function canEditSyllabus(
  scope: BosBoardScopeClient,
  syllabus: { board_id: string | null; created_by: string | null },
  currentAuthUserId: string | null | undefined,
): boolean {
  if (scope.isLoading) return false;
  if (scope.isSuperAdmin) return true;
  if (!syllabus.board_id) return false;
  if (syllabus.created_by && currentAuthUserId && syllabus.created_by === currentAuthUserId) {
    return true;
  }
  return scope.chairmanForBoards.has(syllabus.board_id);
}

/** Can the user write to records owned by the given composition (e.g. meetings, ta-da). */
export function canWriteCompositionData(
  scope: BosBoardScopeClient,
  compositionId: string | null | undefined,
): boolean {
  if (scope.isLoading || !compositionId) return false;
  if (scope.isSuperAdmin) return true;
  if (scope.isPrincipal) return false;
  return scope.memberOf.has(compositionId);
}
