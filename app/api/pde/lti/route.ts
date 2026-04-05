export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/pde/lti — list LTI tool configurations
export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const courseId = searchParams.get('courseId');
    const isActive = searchParams.get('isActive');

    let query = (supabase as any)
      .from('lti_tools')
      .select('*')
      .order('created_at', { ascending: false });

    if (courseId) query = query.eq('course_id', courseId);
    if (isActive !== null && isActive !== undefined) {
      query = query.eq('is_active', isActive === 'true');
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data: data || [] });
  } catch (error: any) {
    console.error('Error fetching LTI tools:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/pde/lti — register a new LTI tool
// Body: { name, description, launch_url, client_id, course_id?, lti_version?, custom_params? }
export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, launch_url, client_id, ...rest } = body;

    if (!name || !launch_url) {
      return NextResponse.json(
        { error: 'name and launch_url are required' },
        { status: 400 }
      );
    }

    const { data, error } = await (supabase as any)
      .from('lti_tools')
      .insert({
        name,
        launch_url,
        client_id: client_id || null,
        created_by: user.id,
        is_active: true,
        ...rest,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { status: 201 });
  } catch (error: any) {
    console.error('Error registering LTI tool:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
