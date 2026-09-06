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
    // Edit forms pass `preferId` so the dedup-by-code below keeps the exact
    // regulation row the syllabus already references (CAS Aided+Self share
    // regulation_codes — without this hint the survivor is arbitrary and the
    // edit form's Regulation dropdown shows the placeholder).
    const preferId = searchParams.get('preferId');

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
    // If `preferId` is provided, push that row to the front so it wins the
    // first-wins dedup (lets edit forms keep their existing reference).
    const seen = new Set<string>();
    const mapped = (data || []).map((reg: any) => ({
      id: reg.id,
      title: `${reg.regulation_code} (${reg.regulation_year})`,
      regulation_year: reg.regulation_year,
      regulation_code: reg.regulation_code,
      institution_id: reg.institution_id,
    }));
    if (preferId) {
      mapped.sort((a, b) => {
        if (a.id === preferId) return -1;
        if (b.id === preferId) return 1;
        return 0;
      });
    }
    const formatted = mapped.filter((r) => {
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
