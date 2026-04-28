export const dynamic = 'force-dynamic';

// GET /api/admission/chat/conversations
// List conversations with filters and pagination
//
// Permission gate is delegated to withAuth({ requirePermission:
// 'admission.marketing.chat.view' }).

import { NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { WhatsAppChatService } from '@/lib/services/whatsapp/whatsapp-chat-service';

export const GET = withAuth(async (request, auth) => {
  await connection();
  try {
    const supabase = auth.supabase;
    const user = auth.user;

    // Permission gate is enforced in the wrapper.
    // Still need user's institution_id to default the query when no
    // institution_id query param is provided.
    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id')
      .eq('id', user.id)
      .single();

    const { searchParams } = new URL(request.url);
    const institutionId = searchParams.get('institution_id') || profile?.institution_id;

    if (!institutionId) {
      return NextResponse.json({ error: 'No institution assigned' }, { status: 403 });
    }

    const result = await WhatsAppChatService.getConversations({
      institution_id: institutionId!,
      status: searchParams.get('status') || undefined,
      assigned_to: searchParams.get('assigned_to') || undefined,
      search: searchParams.get('search') || undefined,
      tags: searchParams.get('tags')?.split(',').filter(Boolean) || undefined,
      date_from: searchParams.get('date_from') || undefined,
      date_to: searchParams.get('date_to') || undefined,
      page: parseInt(searchParams.get('page') || '1'),
      limit: parseInt(searchParams.get('limit') || '25'),
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[chat/conversations] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}, { allowApiKey: false, requirePermission: 'admission.marketing.chat.view' });
