import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { BosCourseReviewAction } from '@/types/bos';

// ── GET /api/bos/meetings/[id]/courses ───────────────────────────────────────
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: meetingId } = await params;

    const { data, error } = await supabase
      .from('bos_course_reviews')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error('[bos/courses] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch course reviews' }, { status: 500 });
  }
}

// ── POST /api/bos/meetings/[id]/courses ──────────────────────────────────────
interface CreateCourseReviewBody {
  institutions_id: string;
  agenda_item_id?: string;
  course_id?: string;
  course_code: string;
  course_name: string;
  review_action: BosCourseReviewAction;
  changes_suggested?: string;
  remarks?: string;
  regulation_code?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: meetingId } = await params;
    const body: CreateCourseReviewBody = await request.json();

    if (!body.course_code?.trim() || !body.course_name?.trim() || !body.review_action) {
      return NextResponse.json(
        { error: 'course_code, course_name, and review_action are required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('bos_course_reviews')
      .insert({
        ...body,
        meeting_id: meetingId,
      })
      .select('*')
      .single();

    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('[bos/courses] POST error:', error);
    return NextResponse.json({ error: 'Failed to add course review' }, { status: 500 });
  }
}
