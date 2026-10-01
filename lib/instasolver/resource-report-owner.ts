// lib/instasolver/resource-report-owner.ts
// ============================================================================
// Who owns a problem reported by scanning a room's or an item's QR sticker.
//
// Director ruling (30 Sep – 1 Oct 2026): the owner of a report is the item's
// CARETAKER first, else the estate office (the Executive Admin Officer), else
// the college principal.
//
// WHY THIS IS RESOLVED HERE AND NOT LEFT TO createWalkTask:
//   createWalkTask (lib/services/campus-walk/campus-walk-service.ts) takes one
//   candidate owner. When that candidate has no ACTIVE staff row it silently
//   swaps in the EAO, and when no EAO resolves either it leaves the task
//   unassigned — it has no principal step at all. So this file:
//     1. only ever returns someone who HAS an active staff row, so the label
//        it returns ("caretaker" / "estate office" / "principal") is the
//        person the task actually lands on, never a quiet substitution;
//     2. adds the principal step createWalkTask does not have.
//   Returning `profileId: null` is still legal: createWalkTask then runs its
//   own EAO lookup (which also tries the eao@ fallback email) and, failing
//   that, files the task unowned — the receipt says so.
//
// FACTS THIS DEPENDS ON (read on main, 1 Oct 2026):
//   - resources.caretaker_user_id and resources.caretaker_user_ids hold
//     STAFF ids, not profile ids (migrations 20250116000001, 20250130).
//   - The EAO is one cluster-wide role, profiles.role = 'executive_admin_officer'.
//     There is no per-college estate-office role in the schema. When several
//     people hold the role, one from the item's own college is preferred.
//   - Principals come from resolvePrincipalsByInstitution — the Role
//     Management holders plus the legacy profiles.role = 'principal' string.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolvePrincipalsByInstitution } from '@/lib/services/academic/intake-readiness-alarm';

export type ReportOwnerSource = 'caretaker' | 'estate_office' | 'principal' | 'none';

export interface ReportOwner {
  /** profiles.id of the owner, or null when nobody in the chain resolved. */
  profileId: string | null;
  source: ReportOwnerSource;
  /**
   * True only when the caretaker step RAN and found nobody active: no
   * caretaker recorded, or every recorded one has left / is inactive / has no
   * active staff row. False when a caretaker resolved, and false when the
   * caretaker lookup itself FAILED — a database blip must never tell the
   * estate office "this item has no caretaker" (Director ruling, 1 Oct 2026).
   */
  caretakerMissing: boolean;
}

export interface ResourceOwnerFacts {
  caretaker_user_id?: string | null;
  caretaker_user_ids?: string[] | null;
  institution_id?: string | null;
}

const EAO_ROLE = 'executive_admin_officer';

/** Caretaker staff ids in the order they should be tried: the single column first. */
export function orderedCaretakerStaffIds(resource: ResourceOwnerFacts): string[] {
  const out: string[] = [];
  const push = (id: unknown) => {
    if (typeof id !== 'string') return;
    const trimmed = id.trim();
    if (trimmed && !out.includes(trimmed)) out.push(trimmed);
  };
  push(resource.caretaker_user_id);
  for (const id of resource.caretaker_user_ids ?? []) push(id);
  return out;
}

/** profiles.id -> true when the person has an ACTIVE staff row. */
async function profilesWithActiveStaff(
  db: SupabaseClient,
  profileIds: string[]
): Promise<Set<string>> {
  const out = new Set<string>();
  if (profileIds.length === 0) return out;
  const { data } = await db
    .from('staff')
    .select('id, profile_id, is_active')
    .in('profile_id', profileIds);
  for (const row of (data ?? []) as Array<{ profile_id: string | null; is_active: boolean | null }>) {
    if (row.profile_id && row.is_active === true) out.add(row.profile_id);
  }
  return out;
}

async function resolveCaretaker(
  db: SupabaseClient,
  staffIds: string[]
): Promise<string | null> {
  if (staffIds.length === 0) return null;
  const { data: staffRows, error: staffErr } = await db
    .from('staff')
    .select('id, profile_id, is_active')
    .in('id', staffIds);
  // A failed read is "could not tell", not "no caretaker" — throw so the
  // caller falls through WITHOUT flagging the item as caretaker-less.
  if (staffErr) throw new Error(`caretaker staff lookup failed: ${staffErr.message}`);
  const profileByStaff = new Map<string, string>();
  for (const row of (staffRows ?? []) as Array<{
    id: string;
    profile_id: string | null;
    is_active: boolean | null;
  }>) {
    if (row.is_active === true && row.profile_id) profileByStaff.set(row.id, row.profile_id);
  }
  const candidateProfiles = staffIds
    .map((sid) => profileByStaff.get(sid))
    .filter((p): p is string => Boolean(p));
  if (candidateProfiles.length === 0) return null;

  const { data: profiles, error: profilesErr } = await db
    .from('profiles')
    .select('id, is_active')
    .in('id', candidateProfiles);
  if (profilesErr) throw new Error(`caretaker profile lookup failed: ${profilesErr.message}`);
  const active = new Set(
    ((profiles ?? []) as Array<{ id: string; is_active: boolean | null }>)
      .filter((p) => p.is_active === true)
      .map((p) => p.id)
  );
  return candidateProfiles.find((p) => active.has(p)) ?? null;
}

async function resolveEstateOffice(
  db: SupabaseClient,
  institutionId: string | null
): Promise<string | null> {
  const { data } = await db
    .from('profiles')
    .select('id, institution_id')
    .eq('role', EAO_ROLE)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  const rows = (data ?? []) as Array<{ id: string; institution_id: string | null }>;
  if (rows.length === 0) return null;
  // Same college first, then everyone else in the locked (oldest-first) order.
  const ordered = [
    ...rows.filter((r) => institutionId && r.institution_id === institutionId),
    ...rows.filter((r) => !(institutionId && r.institution_id === institutionId))
  ].map((r) => r.id);
  const withStaff = await profilesWithActiveStaff(db, ordered);
  return ordered.find((id) => withStaff.has(id)) ?? null;
}

async function resolvePrincipal(
  db: SupabaseClient,
  institutionId: string | null
): Promise<string | null> {
  if (!institutionId) return null;
  const byInstitution = await resolvePrincipalsByInstitution(db, [institutionId]);
  const ids = byInstitution.get(institutionId) ?? [];
  if (ids.length === 0) return null;
  const withStaff = await profilesWithActiveStaff(db, ids);
  return ids.find((id) => withStaff.has(id)) ?? null;
}

/**
 * caretaker -> estate office (EAO) -> principal. Never throws: a failed lookup
 * at one step falls through to the next, and the worst case is
 * `{ profileId: null, source: 'none' }`.
 */
export async function resolveResourceReportOwner(
  db: SupabaseClient,
  resource: ResourceOwnerFacts
): Promise<ReportOwner> {
  // The ITEM's college (Director ruling, 1 Oct 2026) — never the reporter's.
  const institutionId = resource.institution_id ?? null;
  let caretakerMissing = false;
  const steps: Array<[Exclude<ReportOwnerSource, 'none'>, () => Promise<string | null>]> = [
    [
      'caretaker',
      async () => {
        const found = await resolveCaretaker(db, orderedCaretakerStaffIds(resource));
        // Only reached when the lookup did not throw.
        caretakerMissing = found === null;
        return found;
      }
    ],
    ['estate_office', () => resolveEstateOffice(db, institutionId)],
    ['principal', () => resolvePrincipal(db, institutionId)]
  ];
  for (const [source, run] of steps) {
    try {
      const profileId = await run();
      if (profileId) return { profileId, source, caretakerMissing };
    } catch (e: unknown) {
      console.warn(
        `[instasolver] owner lookup (${source}) failed, trying the next step:`,
        e instanceof Error ? e.message : e
      );
    }
  }
  return { profileId: null, source: 'none', caretakerMissing };
}

/** Plain words for the receipt and the ticket. */
export const OWNER_SOURCE_LABEL: Record<ReportOwnerSource, string> = {
  caretaker: 'the caretaker of this item',
  estate_office: 'the estate office',
  principal: 'the college principal',
  none: 'nobody yet'
};
