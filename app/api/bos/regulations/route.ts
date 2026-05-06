import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const institutionId = searchParams.get('institutionId');

    let query = supabase
      .from('regulations')
      .select('id, regulation_year, regulation_code, institution_id')
      .eq('is_active', true)
      .order('regulation_year', { ascending: false });

    if (institutionId) query = query.eq('institution_id', institutionId);

    const { data, error } = await query;
    if (error) throw error;

    // Map to expected format with id and title
    const formatted = (data || []).map((reg: any) => ({
      id: reg.id,
      title: `${reg.regulation_code} (${reg.regulation_year})`,
      regulation_year: reg.regulation_year,
      regulation_code: reg.regulation_code,
    }));

    return NextResponse.json({ data: formatted, count: formatted.length });
  } catch (error) {
    console.error('[GET /api/bos/regulations]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
