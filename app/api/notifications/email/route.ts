import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

interface EmailNotificationPayload {
  recipientEmail: string;
  recipientName?: string;
  subject: string;
  body: string;
  htmlBody?: string;
  notificationType: 'syllabus_revised' | 'syllabus_approved' | 'meeting_scheduled' | 'course_ready_review';
  relatedSyllabusId?: string;
  relatedMeetingId?: string;
  relatedBoardId?: string;
  institutionsId: string;
}

export async function POST(request: Request) {
  try {
    const payload: EmailNotificationPayload = await request.json();

    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Queue email notification in database
    const { data: notification, error } = await supabase
      .from('email_notifications')
      .insert({
        institutions_id: payload.institutionsId,
        notification_type: payload.notificationType,
        recipient_email: payload.recipientEmail,
        recipient_name: payload.recipientName,
        subject: payload.subject,
        body: payload.body,
        html_body: payload.htmlBody,
        related_syllabus_id: payload.relatedSyllabusId,
        related_meeting_id: payload.relatedMeetingId,
        related_board_id: payload.relatedBoardId,
        status: 'pending',
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to queue email:', error);
      return NextResponse.json(
        { error: 'Failed to queue email notification' },
        { status: 500 }
      );
    }

    // In a real implementation, trigger an async job or webhook here
    // to process the email queue (e.g., via Edge Functions, Bull, or scheduled task)
    // For now, we'll just queue it in the database

    return NextResponse.json({
      success: true,
      notificationId: notification.id,
      status: 'queued',
    });
  } catch (error) {
    console.error('Email notification error:', error);
    return NextResponse.json(
      { error: 'Failed to process email notification' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'pending';

  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Service role only - get pending notifications
    const { data: notifications, error } = await supabase
      .from('email_notifications')
      .select('*')
      .eq('status', status)
      .lt('retry_count', 3)
      .order('created_at', { ascending: true })
      .limit(100);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      count: notifications?.length ?? 0,
      notifications: notifications ?? [],
    });
  } catch (error) {
    console.error('Failed to fetch notifications:', error);
    return NextResponse.json(
      { error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}
