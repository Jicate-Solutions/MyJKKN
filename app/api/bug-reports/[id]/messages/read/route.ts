import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// Mark messages as read
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: reportId } = await params;
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

    // Check user access using comprehensive approach
    let participant = null;
    let hasAccess = false;
    let canViewInternal = false;

    // First try to get existing participant
    const { data: initialParticipant, error: participantError } = await supabase
      .from('bug_report_participants')
      .select('id, can_view_internal')
      .eq('bug_report_id', reportId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single() as { data: { id: string; can_view_internal: boolean } | null; error: unknown };

    if (initialParticipant) {
      // User is already a participant
      participant = initialParticipant;
      hasAccess = true;
      canViewInternal = initialParticipant.can_view_internal;
    } else {
      // User is not a participant, try alternative access verification
      console.log('User is not a participant, checking alternative access permissions');

      // First get user profile to check their role and permissions
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('role, is_super_admin, institution_id, department_id')
        .eq('id', user.id)
        .single() as { data: { role: string; is_super_admin: boolean; institution_id: string | null; department_id: string | null } | null };

      if (userProfile) {
        const isAdmin = userProfile.is_super_admin ||
                       userProfile.role === 'super_admin' ||
                       userProfile.role === 'administrator';
        const isPrincipal = userProfile.role === 'principal';
        const isHOD = userProfile.role === 'hod';

        // Determine internal viewing permissions
        canViewInternal = isAdmin || isPrincipal || isHOD;

        // Try to access the bug report - if this succeeds, user has access
        // Use a simple select query that RLS will filter
        const { data: bugReportCheck, error: accessError } = await supabase
          .from('bug_reports')
          .select('id, reporter_user_id')
          .eq('id', reportId)
          .maybeSingle() as { data: { id: string; reporter_user_id: string } | null; error: unknown }; // Use maybeSingle to avoid error on no rows

        if (accessError) {
          console.error('Bug report access check failed:', accessError);
          return NextResponse.json(
            { success: false, error: 'Database error during access check' },
            { status: 500 }
          );
        }

        if (bugReportCheck) {
          // User has access to this bug report
          hasAccess = true;

          // Determine participant role
          const participantRole = bugReportCheck.reporter_user_id === user.id ? 'reporter' : 'participant';

          // Try to auto-create participant record for future efficiency
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: insertedParticipant, error: insertError } = await (supabase as any)
            .from('bug_report_participants')
            .insert({
              bug_report_id: reportId,
              user_id: user.id,
              role: participantRole,
              can_view_internal: canViewInternal,
              is_active: true,
              joined_at: new Date().toISOString()
            })
            .select('id, can_view_internal')
            .single() as { data: { id: string; can_view_internal: boolean } | null; error: unknown };

          if (!insertError && insertedParticipant) {
            participant = insertedParticipant;
            console.log(`Auto-created ${participantRole} participant record`);
          } else {
            // Create a virtual participant object for this request
            participant = {
              id: 'virtual',
              can_view_internal: canViewInternal
            };
            console.log('Using virtual participant (insert failed):', insertError);
          }
        } else {
          // User doesn't have access to this bug report
          console.log('User does not have access to this bug report');
          return NextResponse.json(
            { success: false, error: 'Bug report not found or access denied' },
            { status: 404 }
          );
        }
      } else {
        // Could not get user profile
        console.error('Could not get user profile');
        return NextResponse.json(
          { success: false, error: 'User profile not found' },
          { status: 404 }
        );
      }
    }

    if (!hasAccess || !participant) {
      return NextResponse.json(
        { success: false, error: 'Access denied - insufficient permissions' },
        { status: 403 }
      );
    }

    let messagesToMark: string[] = [];

    if (markAllAsRead) {
      // Get all messages user can read
      let query = supabase
        .from('bug_report_messages')
        .select('id')
        .eq('bug_report_id', reportId)
        .eq('is_deleted', false);

      // If user can't view internal messages, exclude them
      if (!participant.can_view_internal) {
        query = query.eq('is_internal', false);
      }

      const { data: messages, error: messagesError } = await query as { data: { id: string }[] | null; error: unknown };

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
      .in('message_id', messagesToMark) as { data: { message_id: string }[] | null };

    const alreadyReadIds = existingReads?.map(r => r.message_id) || [];
    const newReadIds = messagesToMark.filter(id => !alreadyReadIds.includes(id));

    if (newReadIds.length > 0) {
      // Insert read records
      const readRecords = newReadIds.map(messageId => ({
        message_id: messageId,
        user_id: user.id,
        read_at: new Date().toISOString()
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insertError } = await (supabase as any)
        .from('bug_report_message_reads')
        .insert(readRecords);

      if (insertError) {
        return NextResponse.json(
          { success: false, error: 'Failed to mark messages as read' },
          { status: 500 }
        );
      }

      // Update participant's last read message and timestamp
      if (newReadIds.length > 0 && participant?.id !== 'virtual') {
        // Only update if we have a real participant record (not virtual)
        try {
          // Get the latest message from the ones just marked as read
          const { data: latestMessage } = await supabase
            .from('bug_report_messages')
            .select('id, created_at')
            .in('id', newReadIds)
            .order('created_at', { ascending: false })
            .limit(1)
            .single() as { data: { id: string; created_at: string } | null };

          if (latestMessage) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error: updateError } = await (supabase as any)
              .from('bug_report_participants')
              .update({
                last_read_message_id: latestMessage.id,
                last_read_at: new Date().toISOString()
              })
              .eq('bug_report_id', reportId)
              .eq('user_id', user.id);

            if (updateError) {
              console.warn('Failed to update participant last read info:', updateError);
              // Don't fail the entire operation for this
            }
          }
        } catch (updateError) {
          console.warn('Error updating participant read status:', updateError);
          // Don't fail the entire operation for this
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: reportId } = await params;
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
      let participant = null;
      let hasAccess = false;
      let canViewInternal = false;

      // First try to get existing participant
      const { data: initialParticipant, error: participantError } = await supabase
        .from('bug_report_participants')
        .select('can_view_internal, last_read_message_id')
        .eq('bug_report_id', reportId)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single() as { data: { can_view_internal: boolean; last_read_message_id: string | null } | null; error: unknown };

      if (initialParticipant) {
        // User is already a participant
        participant = initialParticipant;
        hasAccess = true;
        canViewInternal = initialParticipant.can_view_internal;
      } else {
        // User is not a participant, try alternative access verification
        console.log('User is not a participant, checking alternative access permissions');

        // First get user profile to check their role and permissions
        const { data: userProfile } = await supabase
          .from('profiles')
          .select('role, is_super_admin, institution_id, department_id')
          .eq('id', user.id)
          .single() as { data: { role: string; is_super_admin: boolean; institution_id: string | null; department_id: string | null } | null };

        if (userProfile) {
          const isAdmin = userProfile.is_super_admin ||
                         userProfile.role === 'super_admin' ||
                         userProfile.role === 'administrator';
          const isPrincipal = userProfile.role === 'principal';
          const isHOD = userProfile.role === 'hod';

          // Determine internal viewing permissions
          canViewInternal = isAdmin || isPrincipal || isHOD;

          // Try to access the bug report - if this succeeds, user has access
          // Use a simple select query that RLS will filter
          const { data: bugReportCheck, error: accessError } = await supabase
            .from('bug_reports')
            .select('id, reporter_user_id')
            .eq('id', reportId)
            .maybeSingle() as { data: { id: string; reporter_user_id: string } | null; error: unknown }; // Use maybeSingle to avoid error on no rows

          if (accessError) {
            console.error('Bug report access check failed:', accessError);
            return NextResponse.json(
              { success: false, error: 'Database error during access check' },
              { status: 500 }
            );
          }

          if (bugReportCheck) {
            // User has access to this bug report
            hasAccess = true;

            // Determine participant role
            const participantRole = bugReportCheck.reporter_user_id === user.id ? 'reporter' : 'participant';

            // Try to auto-create participant record for future efficiency
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: insertedParticipant, error: insertError } = await (supabase as any)
              .from('bug_report_participants')
              .insert({
                bug_report_id: reportId,
                user_id: user.id,
                role: participantRole,
                can_view_internal: canViewInternal,
                is_active: true,
                joined_at: new Date().toISOString()
              })
              .select('can_view_internal, last_read_message_id')
              .single() as { data: { can_view_internal: boolean; last_read_message_id: string | null } | null; error: unknown };

            if (!insertError && insertedParticipant) {
              participant = insertedParticipant;
              console.log(`Auto-created ${participantRole} participant record`);
            } else {
              // Create a virtual participant object for this request
              participant = {
                can_view_internal: canViewInternal,
                last_read_message_id: null
              };
              console.log('Using virtual participant (insert failed):', insertError);
            }
          } else {
            // User doesn't have access to this bug report
            console.log('User does not have access to this bug report');
            return NextResponse.json(
              { success: false, error: 'Bug report not found or access denied' },
              { status: 404 }
            );
          }
        } else {
          // Could not get user profile
          console.error('Could not get user profile');
          return NextResponse.json(
            { success: false, error: 'User profile not found' },
            { status: 404 }
          );
        }
      }

      if (!hasAccess || !participant) {
        return NextResponse.json(
          { success: false, error: 'Access denied - insufficient permissions' },
          { status: 403 }
        );
      }

      // Count unread messages
      let countQuery = supabase
        .from('bug_report_messages')
        .select('id', { count: 'exact', head: true })
        .eq('bug_report_id', reportId)
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
          .single() as { data: { created_at: string } | null };

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