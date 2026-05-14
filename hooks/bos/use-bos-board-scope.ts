'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

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
  /** True until the request resolves — UI should treat this as "no access yet". */
  isLoading: boolean;
}

export const bosBoardScopeKey = ['bos-board-scope'] as const;

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
  const { data, isLoading } = useQuery({
    queryKey: bosBoardScopeKey,
    queryFn: fetchBosBoardScope,
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
      isLoading: false,
    };
  }, [data, isLoading]);
}

// ── Client-side guard helpers (mirror the server-side bos-access.ts) ─────────
// Pure functions — safe to call in render. Use these instead of inlining the
// check logic so the rules stay consistent with the server.

export function canCreateComposition(scope: BosBoardScopeClient): boolean {
  if (scope.isLoading) return false;
  if (scope.isSuperAdmin) return true;
  // Principals cannot create compositions (read-only on board data).
  if (scope.isPrincipal) return false;
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
