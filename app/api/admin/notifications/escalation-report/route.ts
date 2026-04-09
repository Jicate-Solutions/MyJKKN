import { NextRequest, NextResponse, connection } from 'next/server';
import {
  createServerSupabaseClient,
  createServiceRoleClient
} from '@/lib/supabase/server';

interface OverdueUser {
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  escalation_level: number;
  escalated_at: string | null;
}

interface InstitutionBreakdown {
  institution_id: string;
  institution_name: string;
  overdue_count: number;
  users: OverdueUser[];
}

export async function GET(request: NextRequest) {
  await connection();

  try {
    // --- Auth: super_admin only ---
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        {
          status: 401,
          headers: { 'Cache-Control': 'private, no-store' }
        }
      );
    }

    const { data: profileData } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const profile = profileData as { role: string } | null;

    if (profile?.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Forbidden: super_admin only' },
        {
          status: 403,
          headers: { 'Cache-Control': 'private, no-store' }
        }
      );
    }

    // --- Parse query params ---
    const { searchParams } = new URL(request.url);
    const notificationId = searchParams.get('notification_id');

    if (!notificationId) {
      return NextResponse.json(
        { error: 'notification_id query parameter is required' },
        {
          status: 400,
          headers: { 'Cache-Control': 'private, no-store' }
        }
      );
    }

    const serviceClient = createServiceRoleClient();

    // --- Verify the notification exists and requires acknowledgment ---
    const { data: notification, error: notifError } = await serviceClient
      .from('notifications')
      .select('id, title, sent_at, requires_acknowledgment, acknowledgment_deadline_hours')
      .eq('id', notificationId)
      .single();

    if (notifError || !notification) {
      return NextResponse.json(
        { error: 'Notification not found' },
        {
          status: 404,
          headers: { 'Cache-Control': 'private, no-store' }
        }
      );
    }

    const notifData = notification as {
      id: string;
      title: string;
      sent_at: string;
      requires_acknowledgment: boolean;
      acknowledgment_deadline_hours: number | null;
    };

    if (!notifData.requires_acknowledgment) {
      return NextResponse.json(
        { error: 'This notification does not require acknowledgment' },
        {
          status: 400,
          headers: { 'Cache-Control': 'private, no-store' }
        }
      );
    }

    // --- Calculate deadline ---
    const sentAt = new Date(notifData.sent_at);
    const deadlineHours = notifData.acknowledgment_deadline_hours || 0;
    const deadlineDate = new Date(sentAt.getTime() + deadlineHours * 60 * 60 * 1000);
    const isOverdue = new Date() > deadlineDate;

    // --- Get all user_notifications for this notification ---
    const { data: userNotifs, error: unError } = await serviceClient
      .from('user_notifications')
      .select('id, user_id, acknowledged_at, escalated_at, escalation_level')
      .eq('notification_id', notificationId);

    if (unError) {
      console.error('[notifications/escalation-report] Failed to fetch user_notifications:', unError);
      return NextResponse.json(
        { error: 'Failed to query user notifications' },
        {
          status: 500,
          headers: { 'Cache-Control': 'private, no-store' }
        }
      );
    }

    if (!userNotifs || userNotifs.length === 0) {
      return NextResponse.json(
        {
          notification_id: notificationId,
          notification_title: notifData.title,
          sent_at: notifData.sent_at,
          deadline: deadlineDate.toISOString(),
          is_overdue: isOverdue,
          total_recipients: 0,
          total_acknowledged: 0,
          total_overdue: 0,
          by_institution: []
        },
        { headers: { 'Cache-Control': 'private, no-store' } }
      );
    }

    // --- Get profile info for all users ---
    const userIds = [...new Set(userNotifs.map((un: any) => un.user_id))];

    const { data: profiles, error: profilesError } = await serviceClient
      .from('profiles')
      .select('id, full_name, email, role, institution_id')
      .in('id', userIds);

    if (profilesError) {
      console.error('[notifications/escalation-report] Failed to fetch profiles:', profilesError);
      return NextResponse.json(
        { error: 'Failed to query user profiles' },
        {
          status: 500,
          headers: { 'Cache-Control': 'private, no-store' }
        }
      );
    }

    // --- Get institution names ---
    const institutionIds = [
      ...new Set(
        (profiles || [])
          .map((p: any) => p.institution_id)
          .filter(Boolean)
      )
    ];

    let institutionMap: Record<string, string> = {};
    if (institutionIds.length > 0) {
      const { data: institutions } = await serviceClient
        .from('institutions')
        .select('id, name')
        .in('id', institutionIds);

      if (institutions) {
        institutionMap = Object.fromEntries(
          institutions.map((inst: any) => [inst.id, inst.name])
        );
      }
    }

    // --- Build profile lookup ---
    const profileMap: Record<string, any> = {};
    for (const p of (profiles || [])) {
      profileMap[p.id] = p;
    }

    // --- Compute stats ---
    let totalAcknowledged = 0;
    let totalOverdue = 0;

    const overdueByInstitution: Record<string, InstitutionBreakdown> = {};

    for (const un of userNotifs) {
      const userNotif = un as {
        id: string;
        user_id: string;
        acknowledged_at: string | null;
        escalated_at: string | null;
        escalation_level: number | null;
      };

      if (userNotif.acknowledged_at) {
        totalAcknowledged++;
        continue;
      }

      // Not acknowledged
      if (!isOverdue) continue; // deadline hasn't passed yet, skip

      totalOverdue++;

      const prof = profileMap[userNotif.user_id];
      if (!prof) continue;

      const instId = prof.institution_id || 'no-institution';
      const instName = prof.institution_id
        ? institutionMap[prof.institution_id] || 'Unknown Institution'
        : 'No Institution';

      if (!overdueByInstitution[instId]) {
        overdueByInstitution[instId] = {
          institution_id: instId,
          institution_name: instName,
          overdue_count: 0,
          users: []
        };
      }

      overdueByInstitution[instId].overdue_count++;
      overdueByInstitution[instId].users.push({
        user_id: userNotif.user_id,
        full_name: prof.full_name || 'Unknown',
        email: prof.email || '',
        role: prof.role || '',
        escalation_level: userNotif.escalation_level || 0,
        escalated_at: userNotif.escalated_at
      });
    }

    // Sort institutions by overdue count descending
    const byInstitution = Object.values(overdueByInstitution).sort(
      (a, b) => b.overdue_count - a.overdue_count
    );

    return NextResponse.json(
      {
        notification_id: notificationId,
        notification_title: notifData.title,
        sent_at: notifData.sent_at,
        deadline: deadlineDate.toISOString(),
        deadline_hours: deadlineHours,
        is_overdue: isOverdue,
        total_recipients: userNotifs.length,
        total_acknowledged: totalAcknowledged,
        total_overdue: totalOverdue,
        acknowledgment_rate_percent: userNotifs.length > 0
          ? Math.round((totalAcknowledged / userNotifs.length) * 100)
          : 0,
        by_institution: byInstitution
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    console.error('[notifications/escalation-report] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      {
        status: 500,
        headers: { 'Cache-Control': 'private, no-store' }
      }
    );
  }
}
