// app/api/parent-portal/dashboard/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const parentId = searchParams.get('parent_id');

    if (!parentId) {
      return NextResponse.json(
        { error: 'parent_id is required' },
        { status: 400 }
      );
    }

    // Use the optimized database function
    const { data, error } = await supabase.rpc('get_parent_dashboard', {
      p_parent_id: parentId,
    });

    if (error) throw error;

    if (data.error) {
      return NextResponse.json({ error: data.error }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[parent-portal/dashboard] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data' },
      { status: 500 }
    );
  }
}
