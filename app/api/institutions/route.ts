import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();

    const { data: institutions, error } = await supabase
      .from('institutions')
      .select('id, name')
      .order('name');

    if (error) throw error;

    return NextResponse.json(institutions || []);
  } catch (error) {
    console.error('[INSTITUTIONS_GET] Error fetching institutions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch institutions' },
      { status: 500 }
    );
  }
}
