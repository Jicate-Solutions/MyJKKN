export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    // Auth check — session user must be super_admin
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Insufficient permissions. Super admin access required.' },
        { status: 403 }
      );
    }

    // Use service role client for cross-user queries (bypasses RLS)
    const serviceClient = createServiceRoleClient();

    // 1. Get ALL notifications that require acknowledgment
    const { data: mandatoryNotifications, error: notifError } = await serviceClient
      .from('notifications')
      .select('id, title, priority, category, sent_at, created_at, expires_at, requires_acknowledgment, acknowledgment_deadline_hours')
      .eq('requires_acknowledgment', true)
      .order('created_at', { ascending: false });

    if (notifError) {
      console.error('[notifications/compliance] Failed to fetch notifications:', notifError);
      throw notifError;
    }

    const notifications = mandatoryNotifications || [];
    const notificationIds = notifications.map((n: any) => n.id);

    // 2. Get ALL user_notifications for mandatory notifications
    let allUserNotifications: any[] = [];
    if (notificationIds.length > 0) {
      const { data: userNotifs, error: unError } = await serviceClient
        .from('user_notifications')
        .select('id, notification_id, user_id, read_at, acknowledged_at, escalated_at, escalation_level, created_at')
        .in('notification_id', notificationIds);

      if (unError) {
        console.error('[notifications/compliance] Failed to fetch user_notifications:', unError);
        throw unError;
      }
      allUserNotifications = userNotifs || [];
    }

    // 3. Get profiles for all recipients (for institution, role, name, email)
    const uniqueUserIds = [...new Set(allUserNotifications.map((un: any) => un.user_id))];
    let profilesMap: Record<string, any> = {};

    if (uniqueUserIds.length > 0) {
      // Batch fetch in chunks of 500 to avoid query limits
      const chunkSize = 500;
      for (let i = 0; i < uniqueUserIds.length; i += chunkSize) {
        const chunk = uniqueUserIds.slice(i, i + chunkSize);
        const { data: profiles, error: profError } = await serviceClient
          .from('profiles')
          .select('id, full_name, email, role, institution_id')
          .in('id', chunk);

        if (!profError && profiles) {
          for (const p of profiles) {
            profilesMap[p.id] = p;
          }
        }
      }
    }

    // 4. Get institutions for names
    const uniqueInstitutionIds = [
      ...new Set(
        Object.values(profilesMap)
          .map((p: any) => p.institution_id)
          .filter(Boolean)
      )
    ];
    let institutionsMap: Record<string, string> = {};

    if (uniqueInstitutionIds.length > 0) {
      const { data: institutions } = await serviceClient
        .from('institutions')
        .select('id, name')
        .in('id', uniqueInstitutionIds as string[]);

      if (institutions) {
        for (const inst of institutions) {
          institutionsMap[inst.id] = inst.name;
        }
      }
    }

    // === Compute overall stats ===
    const totalRequired = allUserNotifications.length;
    const totalAcknowledged = allUserNotifications.filter((un: any) => un.acknowledged_at !== null).length;
    const totalOverdue = allUserNotifications.filter((un: any) => {
      if (un.acknowledged_at) return false;
      // Find the notification to check expiry
      const notif = notifications.find((n: any) => n.id === un.notification_id);
      if (notif?.expires_at && new Date(notif.expires_at) < new Date()) return true;
      // If no expiry, consider older than 7 days as overdue
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      return new Date(un.created_at) < sevenDaysAgo;
    }).length;

    const overallComplianceRate = totalRequired > 0
      ? Math.round((totalAcknowledged / totalRequired) * 1000) / 10
      : 0;

    // === By notification ===
    const byNotification = notifications.map((n: any) => {
      const recipients = allUserNotifications.filter((un: any) => un.notification_id === n.id);
      const acknowledged = recipients.filter((un: any) => un.acknowledged_at !== null).length;
      const total = recipients.length;
      const rate = total > 0 ? Math.round((acknowledged / total) * 1000) / 10 : 0;
      const deadlinePassed = n.expires_at ? new Date(n.expires_at) < new Date() : false;

      return {
        id: n.id,
        title: n.title,
        priority: n.priority,
        category: n.category,
        sent_at: n.sent_at || n.created_at,
        deadline_passed: deadlinePassed,
        expires_at: n.expires_at,
        total,
        acknowledged,
        rate
      };
    });

    // === By institution ===
    const institutionStats: Record<string, { total: number; acknowledged: number }> = {};

    for (const un of allUserNotifications) {
      const profile = profilesMap[un.user_id];
      const instId = profile?.institution_id;
      const instName = instId ? (institutionsMap[instId] || 'Unknown Institution') : 'No Institution';

      if (!institutionStats[instName]) {
        institutionStats[instName] = { total: 0, acknowledged: 0 };
      }
      institutionStats[instName].total += 1;
      if (un.acknowledged_at) {
        institutionStats[instName].acknowledged += 1;
      }
    }

    const byInstitution = Object.entries(institutionStats)
      .map(([name, stats]) => ({
        name,
        total_required: stats.total,
        acknowledged: stats.acknowledged,
        compliance_rate: stats.total > 0
          ? Math.round((stats.acknowledged / stats.total) * 1000) / 10
          : 0,
        overdue: stats.total - stats.acknowledged
      }))
      .sort((a, b) => a.compliance_rate - b.compliance_rate);

    // === HOD/Principal responsiveness ===
    // Find HOD and principal users who received notifications, measure response speed
    const hodRoles = ['hod', 'principal', 'vice_principal', 'dean'];
    const hodUserNotifications = allUserNotifications.filter((un: any) => {
      const profile = profilesMap[un.user_id];
      return profile && hodRoles.includes(profile.role);
    });

    // Group by user for HOD stats
    const hodStats: Record<string, {
      name: string;
      email: string;
      role: string;
      institution: string;
      received: number;
      acknowledged: number;
      totalResponseMs: number;
      respondedCount: number;
    }> = {};

    for (const un of hodUserNotifications) {
      const profile = profilesMap[un.user_id];
      if (!profile) continue;

      const userId = un.user_id;
      if (!hodStats[userId]) {
        const instName = profile.institution_id
          ? (institutionsMap[profile.institution_id] || 'Unknown')
          : 'N/A';
        hodStats[userId] = {
          name: profile.full_name || 'Unknown',
          email: profile.email || '',
          role: profile.role,
          institution: instName,
          received: 0,
          acknowledged: 0,
          totalResponseMs: 0,
          respondedCount: 0
        };
      }

      hodStats[userId].received += 1;
      if (un.acknowledged_at) {
        hodStats[userId].acknowledged += 1;
        const responseMs = new Date(un.acknowledged_at).getTime() - new Date(un.created_at).getTime();
        if (responseMs > 0) {
          hodStats[userId].totalResponseMs += responseMs;
          hodStats[userId].respondedCount += 1;
        }
      }
    }

    const hodResponsiveness = Object.values(hodStats)
      .map((h) => ({
        name: h.name,
        email: h.email,
        role: h.role,
        institution: h.institution,
        escalations_received: h.received,
        escalations_acknowledged: h.acknowledged,
        avg_response_hours: h.respondedCount > 0
          ? Math.round((h.totalResponseMs / h.respondedCount / (1000 * 60 * 60)) * 10) / 10
          : null
      }))
      .sort((a, b) => {
        // Sort by acknowledged rate ascending (worst first)
        const rateA = a.escalations_received > 0 ? a.escalations_acknowledged / a.escalations_received : 0;
        const rateB = b.escalations_received > 0 ? b.escalations_acknowledged / b.escalations_received : 0;
        return rateA - rateB;
      });

    // === Worst offenders — users with most unacknowledged mandatory notifications ===
    const unacknowledgedByUser: Record<string, number> = {};
    for (const un of allUserNotifications) {
      if (!un.acknowledged_at) {
        unacknowledgedByUser[un.user_id] = (unacknowledgedByUser[un.user_id] || 0) + 1;
      }
    }

    const worstOffenders = Object.entries(unacknowledgedByUser)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([userId, count]) => {
        const profile = profilesMap[userId];
        const instName = profile?.institution_id
          ? (institutionsMap[profile.institution_id] || 'Unknown')
          : 'N/A';
        return {
          name: profile?.full_name || 'Unknown',
          email: profile?.email || '',
          role: profile?.role || 'unknown',
          institution: instName,
          unacknowledged_count: count
        };
      });

    const response = {
      overall: {
        total_mandatory_notifications: notifications.length,
        total_required_acknowledgments: totalRequired,
        total_acknowledged: totalAcknowledged,
        overall_compliance_rate: overallComplianceRate,
        total_overdue: totalOverdue
      },
      by_institution: byInstitution,
      by_notification: byNotification,
      hod_responsiveness: hodResponsiveness,
      worst_offenders: worstOffenders
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'private, no-store'
      }
    });
  } catch (error) {
    console.error('[notifications/compliance] Internal error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
