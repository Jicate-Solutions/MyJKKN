// GET /api/admission/chat/stats
// Get chat performance statistics

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { WhatsAppChatService } from '@/lib/services/whatsapp/whatsapp-chat-service';

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id, is_super_admin, role')
      .eq('id', user.id)
      .single();

    const isSuperAdmin = profile?.is_super_admin === true || profile?.role === 'super_admin';

    if (!profile?.institution_id && !isSuperAdmin) {
      return NextResponse.json({ error: 'No institution assigned' }, { status: 403 });
    }

    // Super admins without an institution get default empty stats
    if (!profile?.institution_id) {
      return NextResponse.json({
        data: {
          total_open: 0,
          total_waiting: 0,
          total_resolved: 0,
          total_unread: 0,
          avg_response_time_minutes: null,
          conversations_today: 0,
          messages_today: 0,
        },
      });
    }

    try {
      const stats = await WhatsAppChatService.getConversationStats(profile.institution_id);
      return NextResponse.json({ data: stats });
    } catch (serviceError) {
      console.error('[chat/stats] Service error (returning empty stats):', serviceError);
      return NextResponse.json({
        data: {
          total_open: 0,
          total_waiting: 0,
          total_resolved: 0,
          total_unread: 0,
          avg_response_time_minutes: null,
          conversations_today: 0,
          messages_today: 0,
        },
      });
    }
  } catch (error) {
    console.error('[chat/stats] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
