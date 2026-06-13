// app/api/bos/lookup/principals/route.ts
// Lookup endpoint feeding the BoS Meeting "Submit for Principal Approval" dialog.
//
// Why this exists as a dedicated route instead of reusing /api/staff:
//   /api/staff enforces the staff-module scope from get_user_module_scope().
//   Faculty BoS members resolve to 'own_records' scope — i.e. their own staff
//   row only — so they can never see a principal through /api/staff, no matter
//   what filters we pass. BoS approval workflows are an explicit exception:
//   board members must be able to pick a principal even though they have no
//   general staff.read access.
//
// A principal is matched by EITHER:
//   role_key = 'principal'                              OR
//   employment_categories.category_name ILIKE 'Principal%'
//
// Both shapes exist in production data — relying on one alone misses rows.
// Duplicate staff rows are collapsed by id.
//
// CAS handling mirrors /api/bos/lookup/facilitators: expand a single MyJKKN
// UUID to all sibling UUIDs sharing the same counselling_code so a principal
// on the SF branch is found when the meeting is anchored to the Aided branch.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { resolveBosAccess } from '@/lib/utils/bos/bos-access';

async function resolveInstitutionIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  institutionId: string
): Promise<string[]> {
  try {
    const { resolveInstitutionContext } = await import(
      '@/lib/utils/institutions/institution-resolver'
    );
    const ctx = await resolveInstitutionContext(institutionId, supabase);
    if (ctx?.myjkkn_institution_ids && ctx.myjkkn_institution_ids.length > 0) {
      return ctx.myjkkn_institution_ids;
    }
  } catch {
    // COE unavailable → fall through to Supabase counselling_code lookup.
  }

  const { data: inst } = await supabase
    .from('institutions')
    .select('counselling_code')
    .eq('id', institutionId)
    .single();

  if (!inst?.counselling_code) return [institutionId];

  const { data: siblings } = await supabase
    .from('institutions')
    .select('id')
    .eq('counselling_code', inst.counselling_code)
    .eq('is_active', true);

  return siblings && siblings.length > 0
    ? siblings.map((s: { id: string }) => s.id)
    : [institutionId];
}

interface PrincipalRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  staff_id: string | null;
  designation: string | null;
  institution_id: string | null;
}

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

    const scope = await resolveBosAccess(user.id);

    const { searchParams } = new URL(request.url);
    // Accept the same shapes as /api/bos/lookup/facilitators for consistency.
    const csv = searchParams.get('institutionsIds');
    const single = searchParams.get('institutionsId');
    const clientIds = csv
      ? csv.split(',').filter(Boolean)
      : single
        ? [single]
        : [];
    const limit = Math.min(
      parseInt(searchParams.get('limit') ?? '50', 10) || 50,
      100
    );

    // Resolve target institution IDs. A single client id is expanded to its
    // CAS pair via the COE-aware resolver; multi-id input is trusted (still
    // intersected with the caller's scope below for non-admins).
    let targetIds: string[] = [];
    if (clientIds.length === 1) {
      targetIds = await resolveInstitutionIds(supabase, clientIds[0]);
    } else if (clientIds.length > 1) {
      targetIds = clientIds;
    } else {
      targetIds = scope.isSuperAdmin ? [] : scope.allInstitutionIds;
    }

    // CAS-aware authorization: expand non-admin caller's scope to its sibling
    // closure before intersecting, so a user granted access to one sibling of
    // a CAS pair retains visibility into principals on the other sibling.
    if (!scope.isSuperAdmin && clientIds.length > 0) {
      const expandedScope = new Set<string>();
      const scopeSeed = [
        ...(scope.institutionsId ? [scope.institutionsId] : []),
        ...scope.allInstitutionIds,
      ];
      for (const id of scopeSeed) {
        const siblings = await resolveInstitutionIds(supabase, id);
        siblings.forEach((s) => expandedScope.add(s));
      }
      targetIds = targetIds.filter((id) => expandedScope.has(id));
    }

    if (targetIds.length === 0) {
      return NextResponse.json({ data: [] });
    }

    // Service-role bypasses staff RLS. Authorization gate is the targetIds
    // intersection above; this is a designated BoS exception to staff scope.
    const staffClient = createServiceRoleClient();

    // Resolve all employment_categories whose name starts with "Principal".
    // Empty list is OK — we still match by role_key='principal' below.
    const { data: cats } = await staffClient
      .from('employment_categories')
      .select('id')
      .ilike('category_name', 'Principal%');
    const principalCategoryIds = (cats ?? []).map(
      (c: { id: string }) => c.id
    );

    // Two simple queries unioned in JS is clearer (and easier to debug) than
    // chaining PostgREST .or() across an embedded relationship filter, given
    // the result set is tiny (typically 1–2 staff per institution).
    const baseSelect =
      'id, first_name, last_name, staff_id, designation, institution_id';

    const [byRole, byCategory] = await Promise.all([
      staffClient
        .from('staff')
        .select(baseSelect)
        .in('institution_id', targetIds)
        .eq('is_active', true)
        .eq('role_key', 'principal')
        .order('first_name', { ascending: true })
        .limit(limit),
      principalCategoryIds.length > 0
        ? staffClient
            .from('staff')
            .select(baseSelect)
            .in('institution_id', targetIds)
            .eq('is_active', true)
            .in('category_id', principalCategoryIds)
            .order('first_name', { ascending: true })
            .limit(limit)
        : Promise.resolve({ data: [] as PrincipalRow[], error: null }),
    ]);

    if (byRole.error) {
      console.error('[bos/lookup/principals] role query error:', byRole.error);
      throw byRole.error;
    }
    if (byCategory.error) {
      console.error(
        '[bos/lookup/principals] category query error:',
        byCategory.error
      );
      throw byCategory.error;
    }

    const seen = new Set<string>();
    const merged: PrincipalRow[] = [];
    for (const row of [
      ...((byRole.data as PrincipalRow[]) ?? []),
      ...((byCategory.data as PrincipalRow[]) ?? []),
    ]) {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        merged.push(row);
      }
    }

    console.log('[bos/lookup/principals]', {
      callerId: user.id,
      clientIds,
      targetIds,
      principalCategoryIds,
      byRoleCount: byRole.data?.length ?? 0,
      byCategoryCount: byCategory.data?.length ?? 0,
      mergedCount: merged.length,
    });

    return NextResponse.json({ data: merged });
  } catch (error) {
    console.error('[bos/lookup/principals] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch principals' },
      { status: 500 }
    );
  }
}
