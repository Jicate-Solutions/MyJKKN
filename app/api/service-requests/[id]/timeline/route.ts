import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/supabase/server';
import { ServiceRequestTimelineService } from '@/lib/services/service-requests/service-request-timeline-service';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is staff/admin to include internal notes
    const supabase = await createServerSupabaseClient();
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    const includeInternal = profile?.role && !['student'].includes(profile.role);

    const timeline = await ServiceRequestTimelineService.getTimeline(
      id,
      includeInternal
    );

    return NextResponse.json(timeline);
  } catch (error) {
    console.error('[service-requests/timeline] GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const json = await request.json();
    const { content, is_internal } = json;

    if (!content || typeof content !== 'string') {
      return NextResponse.json(
        { error: 'Comment content is required' },
        { status: 400 }
      );
    }

    let entry;
    if (is_internal) {
      entry = await ServiceRequestTimelineService.addInternalNote(
        id,
        session.user.id,
        content
      );
    } else {
      entry = await ServiceRequestTimelineService.addComment(
        id,
        session.user.id,
        content
      );
    }

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error('[service-requests/timeline] POST error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
