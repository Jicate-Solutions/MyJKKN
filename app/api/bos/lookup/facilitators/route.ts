// app/api/bos/lookup/facilitators/route.ts
// Lookup endpoint feeding the BoS Composition "Add Member" dialog.
// Returns all active staff for the target COE institution (no category filter —
// any staff member may serve as a BoS internal member or chairman).
//
// CAS handling: expands a single MyJKKN UUID to ALL sibling UUIDs that share
// the same counselling_code (Aided + Self), because BoS operates at the
// COE institution level, not the MyJKKN branch level.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveBosAccess } from '@/lib/utils/bos/bos-access';

async function resolveInstitutionIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  institutionId: string
): Promise<string[]> {
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
    const requestedInstitutionId = searchParams.get('institutionsId') ?? undefined;
    const search = (searchParams.get('search') ?? '').trim();
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '200', 10) || 200, 500);

    // Resolve target institution IDs — expanded to include CAS siblings.
    // Non-admin: allInstitutionIds already contains the full set from resolveBosAccess.
    // Super-admin: expand the requested UUID on-demand via counselling_code.
    let targetIds: string[];

    if (scope.isSuperAdmin) {
      if (!requestedInstitutionId) return NextResponse.json({ data: [] });
      targetIds = await resolveInstitutionIds(supabase, requestedInstitutionId);
    } else {
      targetIds = scope.allInstitutionIds;
    }

    if (targetIds.length === 0) {
      return NextResponse.json({ data: [] });
    }

    let query = supabase
      .from('staff')
      .select(
        `id, first_name, last_name, staff_id, email, institution_email, phone, designation,
         institution:institutions ( id, name ),
         department:departments ( id, department_name )`
      )
      .in('institution_id', targetIds)
      .eq('is_active', true)
      .order('first_name', { ascending: true })
      .limit(limit);

    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`
      );
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    console.error('[bos/lookup/facilitators] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch facilitators' },
      { status: 500 }
    );
  }
}
