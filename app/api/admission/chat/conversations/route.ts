export const dynamic = 'force-dynamic';

// GET /api/admission/chat/conversations
// List conversations with filters and pagination

import { NextRequest, NextResponse , connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { WhatsAppChatService } from '@/lib/services/whatsapp/whatsapp-chat-service';

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's institution
    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id')
      .eq('id', user.id)
      .single();

    // Canonical super-admin check via RPC (reads profiles.is_super_admin).
    // Replaces prior `profile.is_super_admin === true || profile.role === 'super_admin'`
    // OR — the role-string fallback is redundant (zero drift on prod).
    const { data: isSuperAdmin } = await supabase.rpc('is_super_admin');

    // Check custom role permissions for non-super-admins
    let hasAccess = isSuperAdmin;
    if (!hasAccess) {
      const { data: userRolesData } = await supabase
        .from('user_roles')
        .select('role_id, custom_roles!inner(role_key, permissions, institution_scope)')
        .eq('user_id', user.id);

      hasAccess = (userRolesData || []).some(
        (ur: any) => ur.custom_roles?.permissions?.['admission.marketing.chat.view'] === true
      );
    }

    const { searchParams } = new URL(request.url);
    const institutionId = searchParams.get('institution_id') || profile?.institution_id;

    if (!hasAccess && !institutionId) {
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
}
