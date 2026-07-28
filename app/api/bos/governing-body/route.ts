import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  resolveBosBoardScope,
  guardGoverningBodyWrite,
  hasBosPermission,
  isBosReadAllObserver,
} from '@/lib/utils/bos/bos-access';

/**
 * ── GET /api/bos/governing-body ──────────────────────────────────────────────
 *
 * Read-only lookup of the Governing Body roster for an institution + academic
 * year. Used by BoS composition "Add Member" when the type is
 * "Nominated by the Governing Body" — the picker lists people already seated
 * on the GB (staff vs expert filtered client-side).
 *
 * Does NOT create a body. Missing GB → `{ composition: null, members: [] }`.
 *
 * Query: institutionsId, academicYear
 * Authorized: super-admin, principal (own institution), active BoS member of
 * that institution, or academic.bos-members.view observer.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const institutionsId = searchParams.get('institutionsId')?.trim();
    const academicYear = searchParams.get('academicYear')?.trim();
    if (!institutionsId || !academicYear) {
      return NextResponse.json(
        { error: 'institutionsId and academicYear are required' },
        { status: 400 },
      );
    }

    const scope = await resolveBosBoardScope(user.id);
    const hasView = await hasBosPermission(user.id, 'academic.bos-members.view');
    const canReadAll = isBosReadAllObserver(scope, hasView);

    // Visibility: same institution as the user's BoS scope, or read-all / SA.
    if (!scope.isSuperAdmin && !canReadAll) {
      const inOwnInst =
        scope.allInstitutionIds.includes(institutionsId) ||
        scope.institutionsId === institutionsId ||
        scope.userInstitutionId === institutionsId;
      const inMembershipInst = scope.institutionsOf.has(institutionsId);
      if (!inOwnInst && !inMembershipInst && !scope.isPrincipal) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      // Principal must stay within their CAS pair.
      if (scope.isPrincipal && !inOwnInst) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // Resolve CAS sibling UUIDs so Aided/SF share one GB body lookup.
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

    const db = createServiceRoleClient();
    const { data: composition } = await db
      .from('bos_compositions')
      .select('id, institutions_id, academic_year, composition_title, is_governing_body')
      .eq('is_governing_body', true)
      .eq('academic_year', academicYear)
      .in('institutions_id', institutionIds)
      .maybeSingle();

    if (!composition) {
      return NextResponse.json({ composition: null, members: [] });
    }

    const { data: members, error } = await db
      .from('bos_members')
      .select(`
        id, staff_id, expert_id, member_type, display_name, display_designation,
        display_department, display_institution, email, contact_no, is_active, sort_order
      `)
      .eq('composition_id', composition.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('display_name', { ascending: true });

    if (error) throw error;

    return NextResponse.json({
      composition,
      members: members ?? [],
    });
  } catch (error) {
    console.error('[bos/governing-body] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Governing Body roster' },
      { status: 500 },
    );
  }
}

/**
 * ── POST /api/bos/governing-body ─────────────────────────────────────────────
 *
 * Prepares the Governing Body (GB) for an institution + academic year. Modelled
 * on the Academic Council (see app/api/bos/academic-council), with ONE deliberate
 * difference: the GB does NOT snapshot the BoS chairmen. Its roster is seeded
 * with only the Principal (chairman); everyone else is added manually.
 *   1. Find-or-create the GB bos_composition (is_governing_body = true, no board).
 *   2. Auto-seat the institution's principal as the Governing Body chairman.
 *
 * Idempotent: re-running only ADDS the principal if not already present (dedup by
 * staff_id) — it never removes members added manually, and never double-inserts.
 * The GB MEETING itself is created separately via POST /api/bos/meetings (which
 * has a council auth branch).
 *
 * Authorized: super-admin or the institution's principal (guardGoverningBodyWrite).
 * Writes use the service-role client — the same precedent as the Academic
 * Council route, because bos_* RLS is keyed on board permissions and is not
 * principal/council-aware.
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
    const deny = guardGoverningBodyWrite(scope, institutionsId);
    if (deny) return NextResponse.json({ error: deny }, { status: 403 });

    const db = createServiceRoleClient();

    // Resolve CAS sibling institution UUIDs (Aided + SF share one body).
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

    // ── 1. Find-or-create the GB body ─────────────────────────────────────────
    const { data: existing } = await db
      .from('bos_compositions')
      .select('*')
      .eq('is_governing_body', true)
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
          board_type: 'governing_body',
          is_governing_body: true,
          composition_title: `Governing Body ${academicYear}`,
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

    // ── 1b. Find-or-create the default 'Governing Body' committee ─────────────
    // Mirrors the AC body's default committee. The GB body's meetings and
    // members hang off this committee — bos_meetings.committee_id drives the
    // committee-scoped roster and council-specific TA/DA rates.
    let gbCommitteeId: string | null = null;
    {
      const { data: existingCommittee } = await db
        .from('bos_committees')
        .select('id')
        .eq('composition_id', composition.id)
        .eq('name', 'Governing Body')
        .maybeSingle();
      if (existingCommittee) {
        gbCommitteeId = (existingCommittee as { id: string }).id;
      } else {
        const { data: createdCommittee, error: committeeErr } = await db
          .from('bos_committees')
          .insert({
            institutions_id: composition.institutions_id,
            composition_id: composition.id,
            name: 'Governing Body',
            short_code: 'GB',
            sort_order: 0,
            is_active: true,
            created_by: user.id,
          })
          .select('id')
          .single();
        if (committeeErr) {
          // Non-fatal: the body still works, members/meetings just stay
          // unscoped (the UI falls back to the full composition roster).
          console.warn('[bos/governing-body] default committee create failed:', committeeErr);
        } else {
          gbCommitteeId = (createdCommittee as { id: string }).id;
        }
      }
      // Idempotent healing: attach any earlier GB members that predate the
      // default committee (committee_id IS NULL) so the roster is consistent.
      if (gbCommitteeId) {
        await db
          .from('bos_members')
          .update({ committee_id: gbCommitteeId })
          .eq('composition_id', composition.id)
          .is('committee_id', null);
      }
    }

    // ── 2. (Unlike the Academic Council, the Governing Body does NOT snapshot
    //        BoS chairmen.) Per requirement, the GB roster is seeded with ONLY
    //        the Principal (chairman, below); every other member is added
    //        manually via the Add Member dialog. ──────────────────────────────
    const snapshotted = 0;

    // Dedup helper: identity key for a member (by staff or expert).
    const idKey = (s: string | null | undefined, e: string | null | undefined) =>
      `s:${s ?? ''}|e:${e ?? ''}`;

    // Current GB roster — used to dedup the principal insert against anyone
    // already on the body (e.g. re-running prepare).
    const { data: gbMembers0 } = await db
      .from('bos_members')
      .select('staff_id, expert_id')
      .eq('composition_id', composition.id);
    const seen = new Set(
      (gbMembers0 ?? []).map(
        (m: { staff_id: string | null; expert_id: string | null }) =>
          idKey(m.staff_id, m.expert_id)
      )
    );

    // ── Principal → Governing Body Member Secretary ──────────────────────────
    // Best-effort: resolve the institution's principal(s) and seat them as the
    // body's MEMBER SECRETARY (the Principal is the secretary of the Governing
    // Body; the Chairman is a separate person, added manually). Matches the
    // /api/bos/lookup/principals contract (role_key='principal' OR employment_
    // category 'Principal%'). Wrapped so a lookup failure never breaks prep.
    let secretaryAdded = 0;
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
          committee_id: gbCommitteeId,
          member_type: 'member_secretary',
          staff_id: p.id,
          display_name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Principal',
          display_designation: p.designation ?? 'Principal',
          is_active: true,
          sort_order: -1, // float the member secretary to the top of the roster
        });
        break; // a Governing Body has a single Member Secretary (the Principal)
      }
      if (principalInserts.length > 0) {
        const { error: pErr } = await db.from('bos_members').insert(principalInserts);
        if (!pErr) secretaryAdded = principalInserts.length;
        else console.warn('[bos/governing-body] principal insert failed:', pErr);
      }
    } catch (pLookupErr) {
      console.warn('[bos/governing-body] principal lookup failed:', pLookupErr);
    }
    void secretaryAdded;

    // Return the body with its full member roster.
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
    console.error('[bos/governing-body] POST error:', pgErr);
    return NextResponse.json(
      { error: pgErr.message ?? 'Failed to prepare Governing Body' },
      { status: 500 }
    );
  }
}
