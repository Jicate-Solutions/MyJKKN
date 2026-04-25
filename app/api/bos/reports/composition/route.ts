import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ── GET /api/bos/reports/composition?compositionId= ──────────────────────────
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const compositionId = searchParams.get('compositionId');

    if (!compositionId) {
      return NextResponse.json({ error: 'compositionId is required' }, { status: 400 });
    }

    const [{ data: composition, error: compErr }, { data: members, error: memErr }] =
      await Promise.all([
        supabase
          .from('bos_compositions')
          .select('*')
          .eq('id', compositionId)
          .single(),
        supabase
          .from('bos_members')
          .select('*')
          .eq('composition_id', compositionId)
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
          .order('member_type', { ascending: true }),
      ]);

    if (compErr) throw compErr;
    if (memErr) throw memErr;
    if (!composition) return NextResponse.json({ error: 'Composition not found' }, { status: 404 });

    return NextResponse.json({ composition, members: members ?? [] });
  } catch (error) {
    console.error('[bos/reports/composition] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch composition report' }, { status: 500 });
  }
}
