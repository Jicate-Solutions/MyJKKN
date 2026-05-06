import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('user_id');
  const institutionsId = searchParams.get('institutions_id');

  if (!userId || !institutionsId) {
    return NextResponse.json(
      { error: 'user_id and institutions_id required' },
      { status: 400 }
    );
  }

  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || user.id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: preferences, error } = await supabase
      .from('email_notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .eq('institutions_id', institutionsId)
      .single();

    if (error && error.code === 'PGRST116') {
      // Row not found - return defaults
      return NextResponse.json({
        user_id: userId,
        institutions_id: institutionsId,
        syllabi_revised: true,
        syllabi_approved: true,
        meeting_scheduled: true,
        course_ready_review: true,
        email_frequency: 'immediate',
      });
    }

    if (error) throw error;

    return NextResponse.json(preferences);
  } catch (error) {
    console.error('Failed to fetch preferences:', error);
    return NextResponse.json(
      { error: 'Failed to fetch preferences' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { userId, institutionsId, preferences } = body;

    if (!userId || !institutionsId) {
      return NextResponse.json(
        { error: 'userId and institutionsId required' },
        { status: 400 }
      );
    }

    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || user.id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Upsert preferences
    const { data, error } = await supabase
      .from('email_notification_preferences')
      .upsert(
        {
          user_id: userId,
          institutions_id: institutionsId,
          syllabi_revised: preferences.syllabi_revised ?? true,
          syllabi_approved: preferences.syllabi_approved ?? true,
          meeting_scheduled: preferences.meeting_scheduled ?? true,
          course_ready_review: preferences.course_ready_review ?? true,
          email_frequency: preferences.email_frequency ?? 'immediate',
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,institutions_id',
        }
      )
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      preferences: data,
    });
  } catch (error) {
    console.error('Failed to update preferences:', error);
    return NextResponse.json(
      { error: 'Failed to update preferences' },
      { status: 500 }
    );
  }
}
