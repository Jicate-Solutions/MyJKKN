export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * POST /api/notifications/acknowledge
 *
 * Records explicit acknowledgment of a notification.
 * Unlike "read" (passive - just opened it), "acknowledge" is an
 * active confirmation that the user has seen and understood the content.
 *
 * This is the key differentiator from Google Chat's voluntary 🙏 reaction.
 * In MyJKKN, acknowledgment is system-enforced and permanently recorded.
 */
export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { notification_id } = await request.json();

    if (!notification_id) {
      return NextResponse.json(
        { error: 'notification_id is required' },
        { status: 400 }
      );
    }

    // Use database function to bypass PostgREST column cache issues
    // The function handles: find record, check already-acked, set acknowledged_at + read_at
    const { data: result, error: rpcError } = await supabase
      .rpc('acknowledge_notification', {
        p_notification_id: notification_id,
        p_user_id: user.id
      });

    if (rpcError) {
      console.error('Error acknowledging notification:', rpcError);
      return NextResponse.json(
        { error: 'Failed to record acknowledgment' },
        { status: 500 }
      );
    }

    if (result?.error) {
      return NextResponse.json(
        { error: result.error },
        { status: 404 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in acknowledge endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/notifications/acknowledge
 *
 * Returns all unacknowledged notifications that require acknowledgment
 * for the current user. This powers the blocking modal.
 */
export async function GET() {
  await connection();
  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use DB function to bypass PostgREST column cache issues
    // PostgREST silently drops filters on unknown columns (acknowledged_at),
    // causing already-acknowledged notifications to reappear
    const { data: items, error } = await supabase
      .rpc('get_unacknowledged_notifications', { p_user_id: user.id });

    if (error) {
      console.error('Error fetching unacknowledged notifications:', error);
      return NextResponse.json(
        { error: 'Failed to fetch unacknowledged notifications' },
        { status: 500 }
      );
    }

    const now = new Date();
    const unacknowledged = (items || []).map((item: any) => {
      const sentAt = new Date(item.sent_at || item.created_at);
      const deadlineMs = (item.acknowledgment_deadline_hours || 4) * 60 * 60 * 1000;
      const deadlineAt = new Date(sentAt.getTime() + deadlineMs);

      return {
        id: item.id,
        notification_id: item.notification_id,
        title: item.title,
        body: item.body,
        priority: item.priority,
        category: item.category,
        url: item.url,
        created_by_name: item.created_by_name || 'System',
        sent_at: item.sent_at || item.created_at,
        deadline_at: deadlineAt.toISOString(),
        is_overdue: now > deadlineAt,
        metadata: item.metadata
      };
    });

    return NextResponse.json({
      unacknowledged,
      count: unacknowledged.length,
      has_pending: unacknowledged.length > 0
    });
  } catch (error) {
    console.error('Error in acknowledge GET endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
