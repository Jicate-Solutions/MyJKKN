import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canAccessBos } from '@/lib/utils/bos/bos-access';

/**
 * GET /api/bos/semesters?institution_id=<uuid>&program_code=<code>
 *
 * Returns all semesters for a program in order — used by the Course Scheme
 * page to show empty semester sections alongside mapped ones.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!(await canAccessBos(user.id, 'academic.bos-scheme', 'view'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const programCode    = searchParams.get('program_code');
    // Accept a single id or a comma-separated list (CAS Aided+Self sends both).
    const institutionId  = searchParams.get('institution_id');
    const institutionIds = searchParams.get('institution_ids');

    const ids = institutionIds
      ? institutionIds.split(',').filter(Boolean)
      : institutionId
        ? [institutionId]
        : [];

    if (ids.length === 0 || !programCode) {
      return NextResponse.json(
        { error: 'institution_id (or institution_ids) and program_code are required' },
        { status: 400 },
      );
    }

    // Resolve the programs.id UUID — try all related institution IDs so CAS
    // Aided+Self both resolve correctly regardless of which ID is active.
    let query = supabase
      .from('programs')
      .select('id')
      .eq('program_id', programCode);

    query = ids.length === 1
      ? query.eq('institution_id', ids[0])
      : query.in('institution_id', ids);

    const { data: progs } = await query.limit(1);
    const prog = progs?.[0];

    if (!prog) {
      return NextResponse.json({ data: [] });
    }

    const { data: semesters, error } = await supabase
      .from('semesters')
      .select('id, semester_code, semester_name, semester_order')
      .eq('program_id', prog.id)
      .order('semester_order', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ data: semesters ?? [] });
  } catch (error) {
    console.error('[GET /api/bos/semesters]', error);
    return NextResponse.json({ error: 'Failed to fetch semesters' }, { status: 500 });
  }
}
