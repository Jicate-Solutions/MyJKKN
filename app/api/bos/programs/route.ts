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

    if (ids.length === 0) {
      return NextResponse.json({ data: [], count: 0 });
    }

    let query = supabase
      .from('programs')
      .select('id, program_id, program_name, display_name')
      .eq('is_active', true)
      .order('program_name', { ascending: true });

    if (ids.length === 1) {
      query = query.eq('institution_id', ids[0]);
    } else {
      query = query.in('institution_id', ids);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Deduplicate by program_id in case Aided+Self share the same program codes.
    const seen = new Set<string>();
    const formatted = (data || [])
      .map((p: any) => ({
        id: p.id,
        program_code: p.program_id,
        program_name: p.display_name || p.program_name,
      }))
      .filter((p) => {
        if (seen.has(p.program_code)) return false;
        seen.add(p.program_code);
        return true;
      });

    return NextResponse.json({ data: formatted, count: formatted.length });
  } catch (error) {
    console.error('[GET /api/bos/programs]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
