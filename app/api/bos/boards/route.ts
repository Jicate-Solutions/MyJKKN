import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const institutionsId = searchParams.get('institutionsId');

    let queryInstitutionId = institutionsId;
    if (!queryInstitutionId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('institution_id')
        .eq('id', user.id)
        .single();

      if (!profile) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }
      queryInstitutionId = profile.institution_id;
    }

    const { data, error } = await supabase
      .from('boards')
      .select('id, name')
      .eq('institutions_id', queryInstitutionId)
      .order('name');

    if (error) {
      console.error('[GET /api/bos/boards]', error);
      return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
    }

    return NextResponse.json({ data: data || [], count: data?.length || 0 });
  } catch (error) {
    console.error('[GET /api/bos/boards]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
