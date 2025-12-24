import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

const sendMessageSchema = z.object({
  message_text: z.string().min(1, 'Message cannot be empty'),
  is_internal: z.boolean().optional().default(false),
  reply_to_message_id: z.string().uuid().optional()
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: reportId } = await params;

  try {
    // Check authentication first
    const authSupabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError
    } = await authSupabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Use admin client to bypass RLS policies for data fetching
    const supabase = createAdminClient();

    // Get all messages (simplified - no internal filtering)
    const { data: messages, error } = await supabase
      .from('bug_report_messages')
      .select(
        `
        *,
        sender:profiles!sender_user_id (
          id,
          full_name,
          email,
          role
        )
      `
      )
      .eq('bug_report_id', reportId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return NextResponse.json(messages || []);
  } catch (error) {
    logger.error('bug-reports/api', `Error fetching messages for report ${reportId}`, error);
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: reportId } = await params;

  try {
    // Use regular client for auth check
    const authSupabase = await createServerSupabaseClient();

    // Check authentication
    const {
      data: { user },
      error: authError
    } = await authSupabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Parse and validate request body
    const json = await request.json();
    const { message_text, is_internal, reply_to_message_id } =
      sendMessageSchema.parse(json);

    // First, check if the bug report exists and user has access to it
    const { data: bugReport, error: bugReportError } = await authSupabase
      .from('bug_reports')
      .select('id, reporter_user_id, status')
      .eq('id', reportId)
      .maybeSingle();

    if (bugReportError) {
      logger.error('bug-reports/api', `Error checking bug report ${reportId}`, bugReportError);
      return NextResponse.json(
        { error: 'Failed to verify bug report access' },
        { status: 500 }
      );
    }

    if (!bugReport) {
      return NextResponse.json(
        { error: 'Bug report not found or you do not have access to it' },
        { status: 404 }
      );
    }

    // Check if the bug report is resolved (optional: prevent new messages on resolved reports)
    if (bugReport.status === 'resolved') {
      return NextResponse.json(
        { error: 'Cannot send messages to a resolved bug report' },
        { status: 400 }
      );
    }

    // Use admin client to bypass RLS for operations
    const supabase = createAdminClient();

    // Insert the message
    const { data: message, error: insertError } = await (
      (supabase as any).from('bug_report_messages') as any
    )
      .insert({
        bug_report_id: reportId,
        sender_user_id: user.id,
        message_text,
        is_internal: is_internal || false,
        reply_to_message_id: reply_to_message_id || null
      })
      .select(
        `
        *,
        sender:profiles!sender_user_id (
          id,
          full_name,
          email,
          role
        )
      `
      )
      .single();

    if (insertError) throw insertError;

    // Add user as participant if not already
    try {
      const { data: existingParticipant } = await supabase
        .from('bug_report_participants')
        .select('id')
        .eq('bug_report_id', reportId)
        .eq('user_id', user.id)
        .single();

      if (!existingParticipant) {
        await (supabase.from('bug_report_participants') as any).insert({
          bug_report_id: reportId,
          user_id: user.id,
          role: 'participant',
          can_view_internal: false,
          is_active: true,
          joined_at: new Date().toISOString()
        });
      }
    } catch (participantError) {
      logger.warn('bug-reports/api', 'Could not add participant', participantError);
      // Don't fail the message send if participant addition fails
    }

    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    logger.error('bug-reports/api', `Error sending message for report ${reportId}`, error);
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    );
  }
}
