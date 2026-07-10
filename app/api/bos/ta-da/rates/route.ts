import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  resolveBosBoardScope,
  casSiblingInstitutionIds,
} from '@/lib/utils/bos/bos-access';

/**
 * ── /api/bos/ta-da/rates ─────────────────────────────────────────────────────
 *
 * Per-council / per-member-type TA & honorarium rate settings
 * (bos_ta_da_rates, 20260710130000). Rates are keyed by
 * (institutions_id, committee_name, member_type); claim auto-generation in
 * POST /api/bos/meetings/[id]/attendance resolves them by the meeting's
 * convening committee. Missing rows fall back to the flat SOP constants.
 *
 * GET  — list rates. Readable by any authenticated BoS user within their
 *        CAS-expanded institution scope (super-admin: any institution).
 * PUT  — bulk upsert one council's rate grid. SUPER-ADMIN ONLY (money SOP —
 *        same lockdown posture as /bos/taxonomy and /bos/sop). Writes via
 *        service-role; route-level authz is the source of truth.
 */

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveBosBoardScope(user.id);
    const { searchParams } = new URL(request.url);
    const requestedCsv = searchParams.get('institutionsIds') ?? '';
    const committeeName = searchParams.get('committeeName') ?? undefined;

    const requested = requestedCsv.split(',').map((s) => s.trim()).filter(Boolean);
    const db = createServiceRoleClient();

    // Institution scope: super-admin queries whatever was requested; everyone
    // else is clamped to their CAS-expanded sibling set regardless of input.
    let institutionIds: string[];
    if (scope.isSuperAdmin) {
      if (requested.length === 0) {
        return NextResponse.json(
          { error: 'institutionsIds is required for super-admin requests' },
          { status: 400 }
        );
      }
      institutionIds = requested;
    } else {
      if (!scope.institutionsId) {
        return NextResponse.json({ data: [] });
      }
      institutionIds = await casSiblingInstitutionIds(db, scope.institutionsId);
    }

    let query = db
      .from('bos_ta_da_rates')
      .select('*')
      .in('institutions_id', institutionIds)
      .eq('is_active', true)
      .order('committee_name')
      .order('member_type');
    // Case-insensitive exact name match (dropdown-sourced, no wildcards).
    if (committeeName) query = query.ilike('committee_name', committeeName);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    console.error('[bos/ta-da/rates] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch rate settings' }, { status: 500 });
  }
}

interface RateUpsertBody {
  institutions_id?: string;
  committee_name?: string;
  rates?: Array<{
    member_type?: string;
    honorarium_amount?: number;
    ta_per_km?: number;
  }>;
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveBosBoardScope(user.id);
    if (!scope.isSuperAdmin) {
      return NextResponse.json(
        { error: 'Only a super admin can change TA/DA rate settings' },
        { status: 403 }
      );
    }

    const body = (await request.json()) as RateUpsertBody;
    const institutionsId = body.institutions_id;
    const committeeName = body.committee_name?.trim();
    // The rates array is the FULL desired set for this council: rows present
    // are upserted active, previously-saved member types now absent are
    // deactivated (child-table semantics — removing a row restores the SOP
    // fallback for that member type). An empty array clears the council.
    const rates = Array.isArray(body.rates) ? body.rates : [];

    if (!institutionsId || !committeeName || !Array.isArray(body.rates)) {
      return NextResponse.json(
        { error: 'institutions_id, committee_name and a rates array are required' },
        { status: 400 }
      );
    }

    // member_type is a NAME from the institution's bos_member_types catalog
    // (dropdown-sourced, so free text is only reachable via direct API use) —
    // validate shape, and reject case-insensitive duplicates within the batch.
    const upsertRows: Array<Record<string, unknown>> = [];
    const seenTypes = new Set<string>();
    for (const r of rates) {
      const memberType = typeof r.member_type === 'string' ? r.member_type.trim() : '';
      if (!memberType || memberType.length > 120) {
        return NextResponse.json(
          { error: `Invalid member_type: ${r.member_type}` },
          { status: 400 }
        );
      }
      if (seenTypes.has(memberType.toLowerCase())) {
        return NextResponse.json(
          { error: `Duplicate member_type in request: ${memberType}` },
          { status: 400 }
        );
      }
      seenTypes.add(memberType.toLowerCase());
      const honorarium = Number(r.honorarium_amount);
      const taPerKm = Number(r.ta_per_km);
      if (!Number.isFinite(honorarium) || honorarium < 0 || !Number.isFinite(taPerKm) || taPerKm < 0) {
        return NextResponse.json(
          { error: `Amounts for ${memberType} must be non-negative numbers` },
          { status: 400 }
        );
      }
      upsertRows.push({
        institutions_id: institutionsId,
        committee_name: committeeName,
        member_type: memberType,
        honorarium_amount: honorarium,
        ta_per_km: taPerKm,
        is_active: true,
        created_by: user.id,
      });
    }

    const db = createServiceRoleClient();
    let data: unknown[] = [];
    if (upsertRows.length > 0) {
      const { data: upserted, error } = await db
        .from('bos_ta_da_rates')
        .upsert(upsertRows, { onConflict: 'institutions_id,committee_name,member_type' })
        .select('*');
      if (error) throw error;
      data = upserted ?? [];
    }

    // Deactivate member types that were removed from the grid: any still-active
    // row for this council whose type is not in the submitted set. Deactivation
    // (not delete) keeps an audit trail; the claim generator only reads
    // is_active rows, so removed types fall back to the SOP constants.
    const keptTypes = new Set(
      upsertRows.map((r) => (r.member_type as string).toLowerCase())
    );
    const { data: activeRows, error: activeErr } = await db
      .from('bos_ta_da_rates')
      .select('id, member_type')
      .eq('institutions_id', institutionsId)
      .ilike('committee_name', committeeName)
      .eq('is_active', true);
    if (activeErr) throw activeErr;
    const toDeactivate = (activeRows ?? [])
      .filter((r: { member_type: string }) => !keptTypes.has(r.member_type.toLowerCase()))
      .map((r: { id: string }) => r.id);
    if (toDeactivate.length > 0) {
      const { error: deErr } = await db
        .from('bos_ta_da_rates')
        .update({ is_active: false })
        .in('id', toDeactivate);
      if (deErr) throw deErr;
    }

    return NextResponse.json({ data, deactivated: toDeactivate.length });
  } catch (error) {
    console.error('[bos/ta-da/rates] PUT error:', error);
    return NextResponse.json({ error: 'Failed to save rate settings' }, { status: 500 });
  }
}
