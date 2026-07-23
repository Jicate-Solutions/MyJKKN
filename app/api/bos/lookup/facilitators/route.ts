// app/api/bos/lookup/facilitators/route.ts
// Lookup endpoint feeding the BoS Composition "Add Member" dialog.
// Returns all active staff for the target COE institution (no category filter —
// any staff member may serve as a BoS internal member or chairman).
//
// CAS handling: expands a single MyJKKN UUID to ALL sibling UUIDs that share
// the same counselling_code (Aided + Self), because BoS operates at the
// COE institution level, not the MyJKKN branch level.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { resolveBosAccess } from '@/lib/utils/bos/bos-access';

async function resolveInstitutionIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  institutionId: string
): Promise<string[]> {
  // Primary path: COE API resolver (authoritative for CAS Aided+SF pair).
  // Same source `resolveBosAccess` uses, so the sibling list it returns is
  // guaranteed consistent with `scope.allInstitutionIds`.
  try {
    const { resolveInstitutionContext } = await import('@/lib/utils/institutions/institution-resolver');
    const ctx = await resolveInstitutionContext(institutionId, supabase);
    if (ctx?.myjkkn_institution_ids && ctx.myjkkn_institution_ids.length > 0) {
      return ctx.myjkkn_institution_ids;
    }
  } catch {
    // COE unavailable → fall through to Supabase counselling_code lookup.
  }

  // Fallback: direct Supabase join on counselling_code.
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

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveBosAccess(user.id);

    const { searchParams } = new URL(request.url);
    // Accept both forms:
    //   institutionsId   — single UUID (legacy)
    //   institutionsIds  — csv of UUIDs (preferred, mirrors regulations/taxonomy)
    const csv = searchParams.get('institutionsIds');
    const single = searchParams.get('institutionsId');
    const clientIds = csv
      ? csv.split(',').filter(Boolean)
      : single
        ? [single]
        : [];
    const search = (searchParams.get('search') ?? '').trim();
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '200', 10) || 200, 500);

    // Resolve target institution IDs. Whenever the client supplies one UUID we
    // still expand via the COE resolver (matches resolveBosAccess) to catch
    // the CAS sibling. When the client supplies a csv we trust it (still
    // intersect with user scope for non-admins below).
    let targetIds: string[] = [];

    if (clientIds.length === 1) {
      targetIds = await resolveInstitutionIds(supabase, clientIds[0]);
    } else if (clientIds.length > 1) {
      targetIds = clientIds;
    } else {
      // No ids supplied → fall back to the caller's own scope.
      targetIds = scope.isSuperAdmin ? [] : scope.allInstitutionIds;
    }

    // Non-admin: intersect with their allowed scope so a tampered csv can't
    // enumerate other institutions' staff.
    //
    // CAS-aware: per the BoS spec, the unit of access is institution_code
    // (counselling_code), not institution_id. If the user has access to ANY
    // sibling of a CAS pair, they have access to BOTH siblings for BoS
    // purposes. We expand the user's scope to its full CAS-sibling closure
    // before intersecting — otherwise an HOD whose user_institution_access
    // only granted one sibling would have the other stripped from targetIds
    // and lose visibility into half the staff.
    if (!scope.isSuperAdmin && clientIds.length > 0) {
      const expandedScope = new Set<string>();
      const scopeSeed = [
        ...(scope.institutionsId ? [scope.institutionsId] : []),
        ...scope.allInstitutionIds,
      ];
      // Expand each scope id to its CAS sibling pair via COE-aware resolver.
      // Duplicates collapse automatically in the Set.
      for (const id of scopeSeed) {
        const siblings = await resolveInstitutionIds(supabase, id);
        siblings.forEach((s) => expandedScope.add(s));
      }
      targetIds = targetIds.filter((id) => expandedScope.has(id));
    }

    if (targetIds.length === 0) {
      console.log('[bos/lookup/facilitators] empty targetIds — returning []', {
        clientIds,
        scopeAllInstitutionIds: scope.allInstitutionIds,
        isSuperAdmin: scope.isSuperAdmin,
      });
      return NextResponse.json({ data: [] });
    }

    // Teaching-only: BoS members serve on academic boards, so non-teaching
    // staff (admin, library, support, etc.) are excluded. The filter is an
    // embedded inner-join on employment_categories.is_teaching; only rows
    // whose category has is_teaching=true survive the join.
    //
    // Service-role client: the staff table's RLS uses
    // role_has_institution_access(institution_id), which is keyed off
    // user_institution_access — a table whose rows are typically issued for
    // ONE CAS sibling, not both. For BoS purposes the CAS pair is one logical
    // institution (we already enforced CAS-aware authorization on `targetIds`
    // above), so we bypass the staff RLS for this specific lookup. Without
    // this, an HOD whose user_institution_access only grants the SF sibling
    // never sees Aided-side staff even though the comp belongs to the pair.
    const staffClient = createServiceRoleClient();
    let query = staffClient
      .from('staff')
      .select(
        `id, first_name, last_name, staff_id, email, institution_email, phone, designation,
         institution_id,
         institution:institutions ( id, name ),
         department:departments ( id, department_name ),
         category:employment_categories!inner ( id, category_name, is_teaching )`
      )
      .in('institution_id', targetIds)
      .eq('is_active', true)
      .eq('category.is_teaching', true)
      .order('first_name', { ascending: true })
      .limit(limit);

    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`
      );
    }

    const { data, error } = await query;
    if (error) {
      console.error('[bos/lookup/facilitators] query error:', error);
      throw error;
    }

    // Debug: log what the server actually returned so we can compare against
    // the raw DB (which shows Dr. M. Nalini under a33138b6-...).
    console.log('[bos/lookup/facilitators] search result', {
      clientIds,
      targetIds,
      isSuperAdmin: scope.isSuperAdmin,
      scopeAllInstitutionIds: scope.allInstitutionIds,
      search,
      rowCount: (data ?? []).length,
      firstFew: (data ?? []).slice(0, 5).map((r: any) => ({
        id: r.id,
        name: `${r.first_name} ${r.last_name}`.trim(),
        institution_id: r.institution_id,
      })),
    });

    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    console.error('[bos/lookup/facilitators] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch facilitators' },
      { status: 500 }
    );
  }
}
