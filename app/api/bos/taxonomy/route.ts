import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveBosAccess } from '@/lib/utils/bos/bos-access';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveBosAccess(user.id);

    const { searchParams } = new URL(request.url);
    const institutionsId = scope.isSuperAdmin
      ? (searchParams.get('institutionsId') ?? undefined)
      : (scope.institutionsId ?? undefined);

    let query = supabase
      .from('bos_regulation_taxonomies')
      .select('id, regulation_id, taxonomy_type, institutions_id, created_at, updated_at');

    if (institutionsId) {
      query = query.eq('institutions_id', institutionsId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[GET /api/bos/taxonomy] Query error:', error);
      return NextResponse.json({ error: 'Failed to fetch taxonomy assignments' }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    console.error('[GET /api/bos/taxonomy] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
