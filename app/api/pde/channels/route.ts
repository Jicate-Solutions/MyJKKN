export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const type = request.nextUrl.searchParams.get('type');
    const refId = request.nextUrl.searchParams.get('referenceId');
    let query = (supabase as any).from('pde_channels').select('*').eq('is_active', true).order('created_at', { ascending: false });
    if (type) query = query.eq('channel_type', type);
    if (refId) query = query.eq('reference_id', refId);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ data: data || [] });
  } catch (e: any) { return NextResponse.json({ error: e.message || 'Error' }, { status: 500 }); }
}
