import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// Mark messages as read
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { messageIds, markAllAsRead } = await request.json();

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

    // Verify user is a participant
    const { data: participant, error: participantError } = await supabase
      .from('bug_report_participants')
      .select('id, can_view_internal')
      .eq('bug_report_id', params.id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (participantError || !participant) {
      return NextResponse.json(
        { success: false, error: 'Access denied' },
        { status: 403 }
      );
    }

    let messagesToMark: string[] = [];

    if (markAllAsRead) {
      // Get all messages user can read
      let query = supabase
        .from('bug_report_messages')
        .select('id')
        .eq('bug_report_id', params.id)
        .eq('is_deleted', false);

      // If user can't view internal messages, exclude them
      if (!participant.can_view_internal) {
        query = query.eq('is_internal', false);
      }

      const { data: messages, error: messagesError } = await query;

      if (messagesError) {
        return NextResponse.json(
          { success: false, error: 'Failed to get messages' },
          { status: 500 }
        );
      }

      messagesToMark = messages?.map(m => m.id) || [];
    } else {
      messagesToMark = messageIds || [];
    }

    if (messagesToMark.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No messages to mark as read'
      });
    }

    // Get existing read records to avoid duplicates
    const { data: existingReads } = await supabase
      .from('bug_report_message_reads')
      .select('message_id')
      .eq('user_id', user.id)
      .in('message_id', messagesToMark);

    const alreadyReadIds = existingReads?.map(r => r.message_id) || [];
    const newReadIds = messagesToMark.filter(id => !alreadyReadIds.includes(id));

    if (newReadIds.length > 0) {
      // Insert read records
      const readRecords = newReadIds.map(messageId => ({
        message_id: messageId,
        user_id: user.id,
        read_at: new Date().toISOString()
      }));

      const { error: insertError } = await supabase
        .from('bug_report_message_reads')
        .insert(readRecords);

      if (insertError) {
        return NextResponse.json(
          { success: false, error: 'Failed to mark messages as read' },
          { status: 500 }
        );
      }

      // Update participant's last read message and timestamp
      if (newReadIds.length > 0) {
        // Get the latest message from the ones just marked as read
        const { data: latestMessage } = await supabase
          .from('bug_report_messages')
          .select('id, created_at')
          .in('id', newReadIds)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (latestMessage) {
          await supabase
            .from('bug_report_participants')
            .update({
              last_read_message_id: latestMessage.id,
              last_read_at: new Date().toISOString()
            })
            .eq('bug_report_id', params.id)
            .eq('user_id', user.id);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Marked ${newReadIds.length} new messages as read`,
      markedCount: newReadIds.length,
      alreadyReadCount: alreadyReadIds.length
    });

  } catch (error) {
    console.error('Error marking messages as read:', error);
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

// Get message read status
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const url = new URL(request.url);
    const messageId = url.searchParams.get('messageId');

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

    if (messageId) {
      // Get read status for specific message
      const { data: readRecords, error } = await supabase
        .from('bug_report_message_reads')
        .select(`
          user_id,
          read_at,
          user:profiles!user_id (
            full_name,
            email
          )
        `)
        .eq('message_id', messageId);

      if (error) {
        return NextResponse.json(
          { success: false, error: 'Failed to get read status' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        readBy: readRecords || []
      });
    } else {
      // Get unread message count for user
      const { data: initialParticipant, error: participantError } = await supabase
        .from('bug_report_participants')
        .select('can_view_internal, last_read_message_id')
        .eq('bug_report_id', params.id)
        .eq('user_id', user.id)
        .single();

      let participant = initialParticipant;

      if (participantError || !participant) {
        console.error('Participant lookup error:', participantError);

        // Try to auto-add user as participant if they're accessing their own bug report
        const { data: bugReport } = await supabase
          .from('bug_reports')
          .select('reporter_user_id')
          .eq('id', params.id)
          .single();

        if (bugReport?.reporter_user_id === user.id) {
          // User is the reporter, add them as participant
          const { error: insertError } = await supabase
            .from('bug_report_participants')
            .insert({
              bug_report_id: params.id,
              user_id: user.id,
              role: 'reporter',
              can_view_internal: false,
              is_active: true,
              joined_at: new Date().toISOString()
            });

          if (!insertError) {
            // Retry getting participant data
            const { data: newParticipant } = await supabase
              .from('bug_report_participants')
              .select('can_view_internal, last_read_message_id')
              .eq('bug_report_id', params.id)
              .eq('user_id', user.id)
              .single();

            if (newParticipant) {
              // Continue with the new participant data
              participant = newParticipant;
            }
          }
        }

        if (!participant) {
          return NextResponse.json(
            { success: false, error: 'Access denied - not a participant in this bug report' },
            { status: 403 }
          );
        }
      }

      // Count unread messages
      let countQuery = supabase
        .from('bug_report_messages')
        .select('id', { count: 'exact', head: true })
        .eq('bug_report_id', params.id)
        .eq('is_deleted', false)
        .neq('sender_user_id', user.id); // Don't count own messages

      // If user can't view internal messages, exclude them
      if (!participant.can_view_internal) {
        countQuery = countQuery.eq('is_internal', false);
      }

      // If user has read some messages, only count newer ones
      if (participant.last_read_message_id) {
        const { data: lastReadMessage } = await supabase
          .from('bug_report_messages')
          .select('created_at')
          .eq('id', participant.last_read_message_id)
          .single();

        if (lastReadMessage) {
          countQuery = countQuery.gt('created_at', lastReadMessage.created_at);
        }
      }

      const { count, error: countError } = await countQuery;

      if (countError) {
        return NextResponse.json(
          { success: false, error: 'Failed to count unread messages' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        unreadCount: count || 0
      });
    }

  } catch (error) {
    console.error('Error getting message read status:', error);
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