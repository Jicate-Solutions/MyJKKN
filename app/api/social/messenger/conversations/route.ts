export const dynamic = 'force-dynamic';

/**
 * GET /api/social/messenger/conversations
 *
 * Returns the institution-scoped conversation list, ordered by
 * `last_inbound_at` desc (open conversations the user hasn't replied to bubble
 * to the top). Used by the 2-pane inbox left rail.
 *
 * Query params:
 *   status?: 'open' | 'closed' | 'all'   — default 'open'
 *   limit?: number (max 100)             — default 50
 *
 * Auth: super_admin → all institutions. institution_admin → own institution.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  await connection();

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const service = createServiceRoleClient();

    const { data: profile, error: profileErr } = await service
      .from('profiles')
      .select('institution_id, is_super_admin')
      .eq('id', user.id)
      .maybeSingle();
    if (profileErr) throw profileErr;

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status') || 'open';
    const limitRaw = Number(searchParams.get('limit') || '50');
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;

    let query = service
      .from('messenger_conversations')
      .select('id, institution_id, page_id, psid, lead_id, last_inbound_at, last_outbound_at, status, created_at, updated_at')
      .order('last_inbound_at', { ascending: false, nullsFirst: false })
      .limit(limit);

    if (statusFilter === 'open' || statusFilter === 'closed') {
      query = query.eq('status', statusFilter);
    }

    if (!profile?.is_super_admin) {
      if (!profile?.institution_id) {
        return NextResponse.json({ success: true, data: [] });
      }
      query = query.eq('institution_id', profile.institution_id);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
