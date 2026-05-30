import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const query = request.nextUrl.searchParams.get('q') || '';

    if (query.length < 2) {
      return NextResponse.json({ data: [] });
    }

    // Search streams (degrees table) by name or ID
    const { data: streams, error } = await supabase
      .from('degrees')
      .select(
        `
        id,
        degree_id,
        degree_name,
        institution:institutions (
          id,
          name
        )
      `
      )
      .or(
        `degree_id.ilike.%${query}%,degree_name.ilike.%${query}%`
      )
      .eq('is_active', true)
      .limit(8);

    if (error) throw error;

    return NextResponse.json({
      data: streams?.map((stream) => ({
        id: stream.id,
        title: stream.degree_name,
        subtitle: stream.degree_id,
        institution: stream.institution?.name || 'Unknown',
        path: `/organizations/degrees`,
        type: 'stream'
      })) || []
    });
  } catch (error) {
    console.error('Error searching streams:', error);
    return NextResponse.json(
      { error: 'Failed to search streams' },
      { status: 500 }
    );
  }
}
