import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    // Accept single institutionId OR comma-separated institutionIds (for CAS Aided+Self).
    const institutionId = searchParams.get('institutionId');
    const institutionIds = searchParams.get('institutionIds');
    const ids = institutionIds
      ? institutionIds.split(',').filter(Boolean)
      : institutionId
        ? [institutionId]
        : [];

    let query = supabase
      .from('regulations')
      .select('id, regulation_year, regulation_code, institution_id')
      .eq('is_active', true)
      .order('regulation_year', { ascending: false });

    if (ids.length === 1) {
      query = query.eq('institution_id', ids[0]);
    } else if (ids.length > 1) {
      query = query.in('institution_id', ids);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Deduplicate by regulation_code — CAS Aided+Self may share the same codes.
    const seen = new Set<string>();
    const formatted = (data || [])
      .map((reg: any) => ({
        id: reg.id,
        title: `${reg.regulation_code} (${reg.regulation_year})`,
        regulation_year: reg.regulation_year,
        regulation_code: reg.regulation_code,
      }))
      .filter((r) => {
        if (seen.has(r.regulation_code)) return false;
        seen.add(r.regulation_code);
        return true;
      });

    return NextResponse.json({ data: formatted, count: formatted.length });
  } catch (error) {
    console.error('[GET /api/bos/regulations]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
