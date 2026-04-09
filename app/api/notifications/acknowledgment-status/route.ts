export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import {
  createServerSupabaseClient,
  createServiceRoleClient
} from '@/lib/supabase/server';

/**
 * GET /api/notifications/acknowledgment-status?notification_id=xxx
 *
 * Admin endpoint: Returns real-time acknowledgment compliance for a notification.
 * Shows who acknowledged, who hasn't, who's overdue — the dashboard that
 * Google Chat can never provide.
 */
export async function GET(request: NextRequest) {
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

    // Check admin permission
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userProfile?.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const notificationId = request.nextUrl.searchParams.get('notification_id');

    if (!notificationId) {
      return NextResponse.json(
        { error: 'notification_id query param is required' },
        { status: 400 }
      );
    }

    // Use service role to bypass RLS for admin queries
    const serviceClient = createServiceRoleClient();

    // Get the notification details
    const { data: notification, error: notifError } = await serviceClient
      .from('notifications')
      .select('*')
      .eq('id', notificationId)
      .single();

    if (notifError || !notification) {
      return NextResponse.json(
        { error: 'Notification not found' },
        { status: 404 }
      );
    }

    // Get all user_notifications with profile info
    const { data: recipients, error: recipError } = await serviceClient
      .from('user_notifications')
      .select(`
        user_id,
        read_at,
        acknowledged_at,
        escalated_at,
        escalation_level,
        created_at,
        profiles!inner (
          email,
          full_name,
          role,
          institution_id
        )
      `)
      .eq('notification_id', notificationId);

    if (recipError) {
      console.error('Error fetching recipients:', recipError);
      return NextResponse.json(
        { error: 'Failed to fetch acknowledgment data' },
        { status: 500 }
      );
    }

    // Get institution names for context
    const institutionIds = [...new Set(
      (recipients || [])
        .map((r: any) => r.profiles?.institution_id)
        .filter(Boolean)
    )];

    let institutionMap: Record<string, string> = {};
    if (institutionIds.length > 0) {
      const { data: institutions } = await serviceClient
        .from('institutions')
        .select('id, name')
        .in('id', institutionIds);

      if (institutions) {
        institutionMap = Object.fromEntries(
          institutions.map((i: any) => [i.id, i.name])
        );
      }
    }

    const now = new Date();
    const sentAt = new Date(notification.sent_at || notification.created_at);
    const deadlineMs =
      (notification.acknowledgment_deadline_hours || 4) * 60 * 60 * 1000;
    const deadlineAt = new Date(sentAt.getTime() + deadlineMs);

    const formattedRecipients = (recipients || []).map((r: any) => {
      const profile = r.profiles || {};
      const isOverdue =
        notification.requires_acknowledgment &&
        !r.acknowledged_at &&
        now > deadlineAt;

      return {
        user_id: r.user_id,
        email: profile.email || 'unknown',
        name: profile.full_name || profile.email || 'Unknown',
        role: profile.role || 'unknown',
        institution_name: institutionMap[profile.institution_id] || null,
        acknowledged_at: r.acknowledged_at,
        read_at: r.read_at,
        is_overdue: isOverdue,
        escalation_level: r.escalation_level || 0
      };
    });

    // Sort: overdue first, then unacknowledged, then acknowledged
    formattedRecipients.sort((a: any, b: any) => {
      if (a.is_overdue && !b.is_overdue) return -1;
      if (!a.is_overdue && b.is_overdue) return 1;
      if (!a.acknowledged_at && b.acknowledged_at) return -1;
      if (a.acknowledged_at && !b.acknowledged_at) return 1;
      return 0;
    });

    const acknowledgedCount = formattedRecipients.filter(
      (r: any) => r.acknowledged_at
    ).length;
    const pendingCount = formattedRecipients.filter(
      (r: any) => !r.acknowledged_at
    ).length;
    const overdueCount = formattedRecipients.filter(
      (r: any) => r.is_overdue
    ).length;
    const totalRecipients = formattedRecipients.length;

    return NextResponse.json({
      notification_id: notificationId,
      title: notification.title,
      requires_acknowledgment: notification.requires_acknowledgment || false,
      acknowledgment_deadline_hours:
        notification.acknowledgment_deadline_hours || 4,
      sent_at: notification.sent_at || notification.created_at,
      deadline_at: deadlineAt.toISOString(),
      total_recipients: totalRecipients,
      acknowledged_count: acknowledgedCount,
      pending_count: pendingCount,
      overdue_count: overdueCount,
      acknowledgment_rate:
        totalRecipients > 0
          ? Math.round((acknowledgedCount / totalRecipients) * 100)
          : 0,
      recipients: formattedRecipients
    });
  } catch (error) {
    console.error('Error in acknowledgment-status endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
