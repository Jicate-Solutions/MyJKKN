import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/client';

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
    // Use admin client to bypass RLS policies that have infinite recursion
    const supabase = createAdminClient();

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
    console.error(
      `[BUG_REPORT_MESSAGES_GET] Error fetching messages for report ${reportId}:`,
      error
    );
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

    // Use admin client to bypass RLS for operations
    const supabase = createAdminClient();

    // Insert the message
    const { data: message, error: insertError } = await supabase
      .from('bug_report_messages')
      .insert({
        bug_report_id: reportId,
        sender_user_id: user.id,
        message_text,
        is_internal,
        reply_to_message_id
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
        await supabase.from('bug_report_participants').insert({
          bug_report_id: reportId,
          user_id: user.id,
          role: 'participant',
          can_view_internal: false,
          is_active: true,
          joined_at: new Date().toISOString()
        });
      }
    } catch (participantError) {
      console.warn('Could not add participant:', participantError);
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

    console.error(
      `[BUG_REPORT_MESSAGES_POST] Error sending message for report ${reportId}:`,
      error
    );
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    );
  }
}
