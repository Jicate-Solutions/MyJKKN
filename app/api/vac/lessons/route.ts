import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const courseId = searchParams.get('courseId');

  if (!courseId) {
    return NextResponse.json({ error: 'courseId required' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();

  // RLS policies handle access control - only published lessons visible to non-admins
  const { data, error } = await supabase
    .from('vac_lessons')
    .select('id, title, week, hour, is_published')
    .eq('course_id', courseId)
    .order('week')
    .order('hour');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ lessons: data, count: data?.length || 0 });
}
