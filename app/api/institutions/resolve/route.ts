import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  resolveInstitutionContext,
  resolveInstitutionContextByCode,
  listAllInstitutionContexts,
} from '@/lib/utils/institutions/institution-resolver';
import { hasAnyBosPermission, BOS_LOOKUP_VIEW_KEYS } from '@/lib/utils/bos/bos-access';

/**
 * GET /api/institutions/resolve
 *
 * Resolves institution context by joining MyJKKN Supabase + COE REST API.
 * Returns the combined InstitutionContext needed by BOS / OBE modules.
 *
 * Query params (one required for non-super-admin):
 *   institutionId     — MyJKKN institution UUID (from auth profile)
 *   counsellingCode   — shared natural key (= COE institution_code)
 *
 * Super-admin with no params → returns all institutions.
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

    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id, is_super_admin, role')
      .eq('id', user.id)
      .single();

    const isSuperAdmin =
      profile?.is_super_admin === true || profile?.role === 'super_admin';

    const { searchParams } = new URL(request.url);
    const institutionId = searchParams.get('institutionId');
    const counsellingCode = searchParams.get('counsellingCode');

    // Super-admin with no filter → list all.
    // BoS read-all observers (any of BOS_LOOKUP_VIEW_KEYS) also get the full
    // list — it backs the InstitutionPicker on /bos/course-scheme etc., which
    // now renders for view-grant holders, not just super-admins. Metadata only
    // (names/codes/ids); record reads stay gated by their own routes.
    if (!institutionId && !counsellingCode) {
      if (isSuperAdmin || (await hasAnyBosPermission(user.id, BOS_LOOKUP_VIEW_KEYS))) {
        const all = await listAllInstitutionContexts(supabase);
        return NextResponse.json({ data: all });
      }
    }

    // Resolve by counselling_code
    if (counsellingCode) {
      const ctx = await resolveInstitutionContextByCode(counsellingCode, supabase);
      if (!ctx) {
        return NextResponse.json(
          { error: `No institution found for counsellingCode="${counsellingCode}"` },
          { status: 404 }
        );
      }
      return NextResponse.json({ data: ctx });
    }

    // Resolve by MyJKKN institution UUID
    const targetId = institutionId ?? profile?.institution_id ?? null;
    if (!targetId) {
      return NextResponse.json(
        { error: 'institutionId is required' },
        { status: 400 }
      );
    }

    // Non-super-admins may only resolve their own institution.
    if (!isSuperAdmin && institutionId && institutionId !== profile?.institution_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const ctx = await resolveInstitutionContext(targetId, supabase);
    if (!ctx) {
      return NextResponse.json(
        { error: `No COE institution mapped to institutionId="${targetId}"` },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: ctx });
  } catch (error) {
    console.error('[GET /api/institutions/resolve]', error);
    return NextResponse.json(
      { error: 'Failed to resolve institution context' },
      { status: 500 }
    );
  }
}
