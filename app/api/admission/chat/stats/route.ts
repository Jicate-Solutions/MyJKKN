export const dynamic = 'force-dynamic';

// GET /api/admission/chat/stats
// Get chat performance statistics
//
// Permission gate is delegated to withAuth({ requirePermission:
// 'admission.marketing.chat.view' }).

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { WhatsAppChatService } from '@/lib/services/whatsapp/whatsapp-chat-service';

export const GET = withAuth(async (_request, auth) => {
  try {
    const supabase = auth.supabase;
    const user = auth.user;

    // Permission gate is enforced in the wrapper. We still need
    // profile.institution_id to scope the stats query — when missing,
    // return empty stats rather than 403 (per-handler behaviour preserved).
    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id')
      .eq('id', user.id)
      .single();

    // Users with the permission but without an institution get default empty stats
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
}, { allowApiKey: false, requirePermission: 'admission.marketing.chat.view' });
