import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { isBosChairmanRow } from '@/types/bos';
import {
  resolveBosBoardScope,
  guardAcademicCouncilWrite,
} from '@/lib/utils/bos/bos-access';

/**
 * ── POST /api/bos/academic-council ───────────────────────────────────────────
 *
 * Prepares the Academic Council (AC) body for an institution + academic year:
 *   1. Find-or-create the AC bos_composition (is_academic_council = true, no board).
 *   2. Snapshot every current BoS chairman into that body as a member.
 *
 * Idempotent: re-running only ADDS chairmen not already present (dedup by
 * staff_id/expert_id) — it never removes members the principal added manually,
 * and never double-inserts. The AC MEETING itself is created separately via
 * POST /api/bos/meetings (which has an is_academic_council auth branch).
 *
 * Authorized: super-admin or the institution's principal (guardAcademicCouncilWrite).
 * Writes use the service-role client — the same precedent as /api/bos/compositions,
 * because bos_* RLS is keyed on board permissions and is not principal/AC-aware.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveBosBoardScope(user.id);
    const body = (await request.json()) as {
      institutions_id?: string;
      academic_year?: string;
    };

    // Resolve the target institution.
    //   • super-admin → must pass institutions_id explicitly
    //   • principal   → their own institution (client value ignored to prevent
    //                   cross-institution writes via a tampered body)
    let institutionsId: string | undefined;
    if (scope.isSuperAdmin) {
      institutionsId = body.institutions_id;
      if (!institutionsId) {
        return NextResponse.json(
          { error: 'institutions_id is required for super-admin requests' },
          { status: 400 }
        );
      }
    } else {
      institutionsId = scope.institutionsId ?? scope.userInstitutionId ?? undefined;
      if (!institutionsId) {
        return NextResponse.json(
          { error: 'Your account has no institution assignment' },
          { status: 403 }
        );
      }
    }

    const academicYear = body.academic_year?.trim();
    if (!academicYear) {
      return NextResponse.json(
        { error: 'academic_year is required' },
        { status: 400 }
      );
    }

    // Principal / super-admin gate (CAS-aware).
    const deny = guardAcademicCouncilWrite(scope, institutionsId);
    if (deny) return NextResponse.json({ error: deny }, { status: 403 });

    const db = createServiceRoleClient();

    // Resolve CAS sibling institution UUIDs (Aided + SF share one council).
    let institutionIds: string[] = [institutionsId];
    try {
      const { resolveInstitutionContext } = await import(
        '@/lib/utils/institutions/institution-resolver'
      );
      const ctx = await resolveInstitutionContext(institutionsId, supabase);
      if (ctx?.myjkkn_institution_ids?.length) {
        institutionIds = ctx.myjkkn_institution_ids;
      }
    } catch {
      /* COE unreachable — fall back to the single UUID */
    }

    // ── 1. Find-or-create the AC body ─────────────────────────────────────────
    const { data: existing } = await db
      .from('bos_compositions')
      .select('*')
      .eq('is_academic_council', true)
      .eq('academic_year', academicYear)
      .in('institutions_id', institutionIds)
      .maybeSingle();

    let composition = existing;
    if (!composition) {
      // Derive a 1-year term from the academic year ("2026-27" → 2026-06-01 …).
      const startYear = parseInt(academicYear.slice(0, 4), 10);
      const termStart = Number.isFinite(startYear) ? `${startYear}-06-01` : null;
      const termEnd = Number.isFinite(startYear) ? `${startYear + 1}-05-31` : null;

      const { data: created, error: createErr } = await db
        .from('bos_compositions')
        .insert({
          institutions_id: institutionsId,
          board_id: null,
          board_type: 'academic_council',
          is_academic_council: true,
          composition_title: `Academic Council ${academicYear}`,
          academic_year: academicYear,
          term_start_date: termStart,
          term_end_date: termEnd,
          is_active: true,
          created_by: user.id,
        })
        .select('*')
        .single();
      if (createErr) throw createErr;
      composition = created;
    }

    // ── 1b. Find-or-create the default 'Academic Council' committee ───────────
    // Mirrors the per-composition default committee pattern (BoS compositions
    // get a 'Curriculum Development Cell', see 20260706). The AC body's
    // meetings and members hang off this committee — bos_meetings.committee_id
    // drives the committee-scoped roster and council-specific TA/DA rates.
    let acCommitteeId: string | null = null;
    {
      const { data: existingCommittee } = await db
        .from('bos_committees')
        .select('id')
        .eq('composition_id', composition.id)
        .eq('name', 'Academic Council')
        .maybeSingle();
      if (existingCommittee) {
        acCommitteeId = (existingCommittee as { id: string }).id;
      } else {
        const { data: createdCommittee, error: committeeErr } = await db
          .from('bos_committees')
          .insert({
            institutions_id: composition.institutions_id,
            composition_id: composition.id,
            name: 'Academic Council',
            short_code: 'AC',
            sort_order: 0,
            is_active: true,
            created_by: user.id,
          })
          .select('id')
          .single();
        if (committeeErr) {
          // Non-fatal: the council still works, members/meetings just stay
          // unscoped (the UI falls back to the full composition roster).
          console.warn('[bos/academic-council] default committee create failed:', committeeErr);
        } else {
          acCommitteeId = (createdCommittee as { id: string }).id;
        }
      }
      // Idempotent healing: attach any earlier AC members that predate the
      // default committee (committee_id IS NULL) so the roster is consistent.
      if (acCommitteeId) {
        await db
          .from('bos_members')
          .update({ committee_id: acCommitteeId })
          .eq('composition_id', composition.id)
          .is('committee_id', null);
      }
    }

    // ── 2. Snapshot BoS chairmen into the AC body ─────────────────────────────
    // Source: active chairmen of active, non-council compositions in this
    // institution. Both is_academic_council AND is_governing_body must be false
    // so a Governing Body is never mistaken for a subject-level Board of Studies
    // (see 20260724120000_bos_governing_body.sql).
    const { data: bosComps } = await db
      .from('bos_compositions')
      .select('id')
      .eq('is_academic_council', false)
      .eq('is_governing_body', false)
      .eq('is_active', true)
      .in('institutions_id', institutionIds);
    const bosCompIds = (bosComps ?? []).map((c: { id: string }) => c.id);

    // Dedup helper: identity key for a member (by staff or expert).
    const idKey = (s: string | null | undefined, e: string | null | undefined) =>
      `s:${s ?? ''}|e:${e ?? ''}`;

    // Current AC roster — used to dedup inserts by staff/expert identity.
    const { data: acMembers0 } = await db
      .from('bos_members')
      .select('staff_id, expert_id')
      .eq('composition_id', composition.id);
    const seen = new Set(
      (acMembers0 ?? []).map(
        (m: { staff_id: string | null; expert_id: string | null }) =>
          idKey(m.staff_id, m.expert_id)
      )
    );

    let snapshotted = 0;
    if (bosCompIds.length > 0) {
      // BoS board chairmen — on the COUNCIL they sit as ordinary MEMBERS
      // (member_type 'internal_member'); the council's presiding officer is the
      // Principal (added as 'chairman' below).
      // member_type stores the catalog type NAME since 20260710150000 —
      // chairman rows are identified via the catalog base_type (legacy literal
      // fallback inside isBosChairmanRow), so fetch active members and filter.
      const { data: activeMembers } = await db
        .from('bos_members')
        .select(
          'staff_id, staff_name, staff_designation, expert_id, display_name, display_designation, display_institution, address, contact_no, email, member_type, member_type_rec:bos_member_types(base_type)'
        )
        .eq('is_active', true)
        .in('composition_id', bosCompIds);
      const chairmen = (activeMembers ?? []).filter((m) => isBosChairmanRow(m as never));

      const chairmanStaffIds = new Set<string>();
      const chairmanExpertIds = new Set<string>();
      const toInsert: Record<string, unknown>[] = [];
      const batchSeen = new Set<string>();
      for (const c of chairmen ?? []) {
        if (c.staff_id) chairmanStaffIds.add(c.staff_id);
        if (c.expert_id) chairmanExpertIds.add(c.expert_id);
        const key = idKey(c.staff_id, c.expert_id);
        if (seen.has(key) || batchSeen.has(key)) continue;
        batchSeen.add(key);
        toInsert.push({
          institutions_id: institutionsId,
          composition_id: composition.id,
          committee_id: acCommitteeId,
          member_type: 'internal_member',
          staff_id: c.staff_id ?? null,
          staff_name: c.staff_name ?? null,
          staff_designation: c.staff_designation ?? null,
          expert_id: c.expert_id ?? null,
          display_name: c.display_name,
          display_designation: c.display_designation ?? null,
          display_institution: c.display_institution ?? null,
          address: c.address ?? null,
          contact_no: c.contact_no ?? null,
          email: c.email ?? null,
          is_active: true,
        });
      }

      if (toInsert.length > 0) {
        const { error: insErr } = await db.from('bos_members').insert(toInsert);
        if (insErr) throw insErr;
        snapshotted = toInsert.length;
        toInsert.forEach((r) =>
          seen.add(idKey(r.staff_id as string, r.expert_id as string)),
        );
      }

      // Reconcile older snapshots: any AC row still tagged 'chairman' that is
      // actually a snapshotted BoS chairman → demote to 'internal_member'.
      if (chairmanStaffIds.size > 0) {
        await db
          .from('bos_members')
          .update({ member_type: 'internal_member' })
          .eq('composition_id', composition.id)
          .eq('member_type', 'chairman')
          .in('staff_id', Array.from(chairmanStaffIds));
      }
      if (chairmanExpertIds.size > 0) {
        await db
          .from('bos_members')
          .update({ member_type: 'internal_member' })
          .eq('composition_id', composition.id)
          .eq('member_type', 'chairman')
          .in('expert_id', Array.from(chairmanExpertIds));
      }
    }

    // ── Principal → Academic Council Chairman ────────────────────────────────
    // Best-effort: resolve the institution's principal(s) and seat them as the
    // council chairman. Matches the /api/bos/lookup/principals contract
    // (role_key='principal' OR employment_category 'Principal%'). Wrapped so a
    // lookup failure never breaks council preparation.
    let chairmenAdded = 0;
    try {
      const { data: cats } = await db
        .from('employment_categories')
        .select('id')
        .ilike('category_name', 'Principal%');
      const catIds = (cats ?? []).map((c: { id: string }) => c.id);

      const [byRole, byCat] = await Promise.all([
        db
          .from('staff')
          .select('id, first_name, last_name, staff_id, designation')
          .in('institution_id', institutionIds)
          .eq('is_active', true)
          .eq('role_key', 'principal'),
        catIds.length > 0
          ? db
              .from('staff')
              .select('id, first_name, last_name, staff_id, designation')
              .in('institution_id', institutionIds)
              .eq('is_active', true)
              .in('category_id', catIds)
          : Promise.resolve({ data: [] as unknown[] }),
      ]);

      type PrincipalRow = {
        id: string;
        first_name: string | null;
        last_name: string | null;
        designation: string | null;
      };
      const byId = new Map<string, PrincipalRow>();
      for (const p of [
        ...((byRole.data as PrincipalRow[]) ?? []),
        ...((byCat.data as PrincipalRow[]) ?? []),
      ]) {
        if (!byId.has(p.id)) byId.set(p.id, p);
      }

      const principalInserts: Record<string, unknown>[] = [];
      for (const p of byId.values()) {
        const key = idKey(p.id, null);
        if (seen.has(key)) continue; // already on the roster
        seen.add(key);
        principalInserts.push({
          institutions_id: institutionsId,
          composition_id: composition.id,
          committee_id: acCommitteeId,
          member_type: 'chairman',
          staff_id: p.id,
          display_name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Principal',
          display_designation: p.designation ?? 'Principal',
          is_active: true,
          sort_order: -1, // float the chairman to the top of the roster
        });
      }
      if (principalInserts.length > 0) {
        const { error: pErr } = await db.from('bos_members').insert(principalInserts);
        if (!pErr) chairmenAdded = principalInserts.length;
        else console.warn('[bos/academic-council] principal insert failed:', pErr);
      }
    } catch (pLookupErr) {
      console.warn('[bos/academic-council] principal lookup failed:', pLookupErr);
    }
    void chairmenAdded;

    // Return the body with its full (post-snapshot) member roster.
    const { data: members } = await db
      .from('bos_members')
      .select('*')
      .eq('composition_id', composition.id)
      .order('sort_order', { ascending: true })
      .order('display_name', { ascending: true });

    return NextResponse.json(
      { composition, members: members ?? [], snapshotted },
      { status: existing ? 200 : 201 }
    );
  } catch (error) {
    const pgErr = error as { code?: string; message?: string; details?: string };
    console.error('[bos/academic-council] POST error:', pgErr);
    return NextResponse.json(
      { error: pgErr.message ?? 'Failed to prepare Academic Council' },
      { status: 500 }
    );
  }
}
