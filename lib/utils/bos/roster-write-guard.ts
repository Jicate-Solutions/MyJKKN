// lib/utils/bos/roster-write-guard.ts
//
// Shared authorization gate for "manage this composition's roster" actions.
//
// It is the exact rule POST /api/bos/members and PUT/DELETE
// /api/bos/members/[id] already implement inline:
//
//   • super-admin                          → always allowed
//   • Academic Council / Governing Body    → the PRINCIPAL of the owning
//                                            institution (not a board chairman)
//   • ordinary BoS composition             → the composition's chairman, or its
//                                            creator while the chairman seat is
//                                            still empty (bootstrap)
//
// Extracted so newer roster endpoints (refresh, reorder) can't drift from that
// rule. The pre-existing routes were intentionally left on their inline copies
// — changing their behaviour is not this helper's job.

import type { createClient } from '@/lib/supabase/server';
import {
  resolveBosBoardScope,
  guardCompositionChairman,
  guardAcademicCouncilWrite,
  guardGoverningBodyWrite,
} from '@/lib/utils/bos/bos-access';

export interface RosterWriteGate {
  /** Set when the caller may NOT write; hand straight back as the response. */
  deny?: { error: string; status: number };
  /** Parent is an Academic Council or Governing Body composition. */
  isCouncil: boolean;
  isSuperAdmin: boolean;
}

export async function guardRosterWrite(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  compositionId: string,
): Promise<RosterWriteGate> {
  const scope = await resolveBosBoardScope(userId);
  if (scope.isSuperAdmin) {
    return { isCouncil: false, isSuperAdmin: true };
  }

  const { data, error } = await supabase
    .from('bos_compositions')
    .select('created_by, is_academic_council, is_governing_body, institutions_id')
    .eq('id', compositionId)
    .maybeSingle();
  if (error) throw error;

  const comp = data as {
    created_by?: string | null;
    is_academic_council?: boolean;
    is_governing_body?: boolean;
    institutions_id?: string | null;
  } | null;

  if (!comp) {
    return {
      deny: { error: 'Composition not found', status: 404 },
      isCouncil: false,
      isSuperAdmin: false,
    };
  }

  const isGb = comp.is_governing_body === true;
  const isCouncil = comp.is_academic_council === true || isGb;

  if (isCouncil) {
    const deny = isGb
      ? guardGoverningBodyWrite(scope, comp.institutions_id)
      : guardAcademicCouncilWrite(scope, comp.institutions_id);
    return deny
      ? { deny: { error: deny, status: 403 }, isCouncil, isSuperAdmin: false }
      : { isCouncil, isSuperAdmin: false };
  }

  // Creator carve-out: the HOD who just created the composition can manage the
  // roster until a chairman exists to take over.
  if (comp.created_by === userId) {
    return { isCouncil, isSuperAdmin: false };
  }

  const deny = guardCompositionChairman(scope, compositionId);
  return deny
    ? { deny: { error: deny, status: 403 }, isCouncil, isSuperAdmin: false }
    : { isCouncil, isSuperAdmin: false };
}
