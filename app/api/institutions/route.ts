import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withReferenceListCache } from '@/lib/http/cache-control';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase
      .from('institutions')
      .select('id, name, display_name')
      .order('name');

    if (error) throw error;

    const rows = data || [];
    return withReferenceListCache(
      NextResponse.json({ data: rows, count: rows.length }),
      rows.length
    );
  } catch (error) {
    console.error('[GET /api/institutions]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
