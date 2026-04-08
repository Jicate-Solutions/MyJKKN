

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/pde/channels?type=xxx&referenceId=xxx
export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const channelType = request.nextUrl.searchParams.get('type');
    const referenceId = request.nextUrl.searchParams.get('referenceId');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase as any)
      .from('pde_channels')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (channelType) query = query.eq('channel_type', channelType);
    if (referenceId) query = query.eq('reference_id', referenceId);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data: data || [] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error fetching channels:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
