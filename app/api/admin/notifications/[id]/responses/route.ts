import { NextRequest, NextResponse } from 'next/server';
import {
  createServerSupabaseClient,
  createServiceRoleClient
} from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: notificationId } = await params;

  try {
    const supabase = await createServerSupabaseClient();

    // Get the current user
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check super_admin permission
    const { data: userProfileData } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const userProfile = userProfileData as { role: string } | null;

    if (userProfile?.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Insufficient permissions. Super admin only.' },
        { status: 403 }
      );
    }

    const serviceClient = createServiceRoleClient();

    // Fetch all action_responses for this notification, joined with profiles
    const { data: responses, error: fetchError } = await (
      serviceClient as any
    )
      .from('action_responses')
      .select(
        `
        id,
        notification_id,
        user_id,
        response_type,
        text_response,
        file_url,
        file_name,
        file_size,
        form_response,
        link_confirmed,
        submitted_at,
        created_at,
        profiles!user_id (
          full_name,
          email,
          role,
          institution_id
        )
      `
      )
      .eq('notification_id', notificationId)
      .order('submitted_at', { ascending: false });

    if (fetchError) {
      console.error(
        '[admin/notifications/responses] Fetch error:',
        fetchError
      );
      return NextResponse.json(
        { error: 'Failed to fetch responses' },
        { status: 500 }
      );
    }

    // Get total target user count for this notification
    const { count: totalTargeted } = await (serviceClient as any)
      .from('user_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('notification_id', notificationId);

    // Flatten nested profiles data for the client
    const flattenedResponses = (responses || []).map((r: any) => ({
      ...r,
      user_name: r.profiles?.full_name || null,
      user_email: r.profiles?.email || null,
      user_role: r.profiles?.role || null,
      institution_name: r.profiles?.institution_id || null,
      profiles: undefined
    }));

    const respondedCount = flattenedResponses.length;
    const total = totalTargeted || 0;

    return NextResponse.json(
      {
        responses: flattenedResponses,
        total,
        responded_count: respondedCount,
        pending_count: Math.max(0, total - respondedCount)
      },
      {
        headers: {
          'Cache-Control': 'private, no-store'
        }
      }
    );
  } catch (error) {
    console.error(
      '[admin/notifications/responses] Unexpected error:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
