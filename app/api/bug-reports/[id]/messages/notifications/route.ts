import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';

// Send notification for new bug report message
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { messageId, senderId } = await request.json();

    // Get the current user
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get bug report details
    const { data: bugReport, error: bugReportError } = await supabase
      .from('bug_reports')
      .select('display_id, description, reporter_user_id')
      .eq('id', (await params).id)
      .single() as { data: { display_id: string; description: string; reporter_user_id: string } | null; error: unknown };

    if (bugReportError || !bugReport) {
      return NextResponse.json(
        { success: false, error: 'Bug report not found' },
        { status: 404 }
      );
    }

    // Get message details
    const { data: message, error: messageError } = await supabase
      .from('bug_report_messages')
      .select(
        `
        message_text,
        is_internal,
        sender_user_id,
        sender:profiles!sender_user_id (
          full_name,
          email
        )
      `
      )
      .eq('id', messageId)
      .single() as { data: { message_text: string; is_internal: boolean; sender_user_id: string; sender: { full_name: string; email: string } | { full_name: string; email: string }[] | null } | null; error: unknown };

    if (messageError || !message) {
      return NextResponse.json(
        { success: false, error: 'Message not found' },
        { status: 404 }
      );
    }

    // Get all participants who should be notified (excluding the sender)
    type Participant = { user_id: string; can_view_internal: boolean; user: { full_name: string; email: string } | null };
    const { data: participants, error: participantsError } = await supabase
      .from('bug_report_participants')
      .select(
        `
        user_id,
        can_view_internal,
        user:profiles!user_id (
          full_name,
          email
        )
      `
      )
      .eq('bug_report_id', (await params).id)
      .eq('is_active', true)
      .neq('user_id', senderId) as { data: Participant[] | null; error: unknown };

    if (participantsError) {
      return NextResponse.json(
        { success: false, error: 'Failed to get participants' },
        { status: 500 }
      );
    }

    // Filter participants based on message visibility
    const eligibleParticipants =
      participants?.filter((participant) => {
        // If message is internal, only notify participants who can view internal messages
        if (message.is_internal) {
          return participant.can_view_internal;
        }
        return true;
      }) || [];

    if (eligibleParticipants.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No participants to notify'
      });
    }

    // Create notification
    const notificationTitle = `New message in Bug Report ${bugReport.display_id}`;

    // Handle both array and object cases for sender
    let senderName = 'Someone';
    if (message.sender) {
      if (Array.isArray(message.sender)) {
        senderName = message.sender[0]?.full_name || 'Someone';
      } else {
        senderName = (message.sender as any)?.full_name || 'Someone';
      }
    }

    const notificationBody = message.is_internal
      ? `${senderName} sent an internal message`
      : `${senderName} sent a message: ${message.message_text.substring(
          0,
          100
        )}${message.message_text.length > 100 ? '...' : ''}`;

    // Insert the main notification
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: notification, error: notificationError } = await (supabase as any)
      .from('notifications')
      .insert({
        title: notificationTitle,
        body: notificationBody,
        url: `/admin/bug-reports/${(await params).id}`,
        icon: '🐛',
        priority: 'normal',
        category: 'bug_report_message',
        created_by: senderId
      })
      .select()
      .single() as { data: { id: string; title: string } | null; error: unknown };

    if (notificationError || !notification) {
      return NextResponse.json(
        { success: false, error: 'Failed to create notification' },
        { status: 500 }
      );
    }

    // Create user notifications for each participant
    const userNotifications = eligibleParticipants.map((participant) => ({
      user_id: participant.user_id,
      notification_id: notification.id
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: userNotificationsError } = await (supabase as any)
      .from('user_notifications')
      .insert(userNotifications);

    if (userNotificationsError) {
      logger.error('bug-reports/api', 'Failed to create user notifications', userNotificationsError);
      return NextResponse.json(
        { success: false, error: 'Failed to send notifications' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Notification sent to ${eligibleParticipants.length} participant(s)`,
      notificationId: notification.id
    });
  } catch (error) {
    logger.error('bug-reports/api', 'Error sending bug report message notification', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
