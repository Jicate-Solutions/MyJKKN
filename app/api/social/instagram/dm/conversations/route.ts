export const dynamic = 'force-dynamic';

/**
 * GET /api/social/instagram/dm/conversations
 *
 * Lists local DM conversations. Reads ig_dm_conversations directly — does
 * not call Graph. The webhook keeps this table fresh.
 *
 * Query params:
 *   institution_id: string    — required for institution_admin
 *   ig_account_id?: string    — optional narrow filter
 *   has_lead?: 'true'|'false' — filter conversations with/without lead linkage
 *   limit?: number            — default 50, max 200
 *   offset?: number           — default 0
 *
 * Auth: super_admin OR same-institution profile.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  await connection();

  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const sp = new URL(request.url).searchParams;
    const institutionId = sp.get('institution_id');
    const igAccountId = sp.get('ig_account_id') || undefined;
    const hasLead = sp.get('has_lead');
    const limit = Math.min(Number(sp.get('limit') ?? 50), 200);
    const offset = Number(sp.get('offset') ?? 0);

    if (!institutionId) {
      return NextResponse.json(
        { success: false, error: 'institution_id is required' },
        { status: 400 }
      );
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id, role')
      .eq('id', user.id)
      .single();

    const isSuperAdmin = profile?.role === 'super_admin';
    if (!isSuperAdmin && profile?.institution_id !== institutionId) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    let query = supabase
      .from('ig_dm_conversations')
      .select('id, institution_id, ig_account_id, ig_user_id, lead_id, last_inbound_at, created_at, updated_at', { count: 'exact' })
      .eq('institution_id', institutionId)
      .order('last_inbound_at', { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);

    if (igAccountId) query = query.eq('ig_account_id', igAccountId);
    if (hasLead === 'true') query = query.not('lead_id', 'is', null);
    if (hasLead === 'false') query = query.is('lead_id', null);

    const { data: conversations, count, error } = await query;
    if (error) {
      return NextResponse.json(
        { success: false, error: `Query failed: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        conversations: conversations ?? [],
        count: count ?? 0,
        limit,
        offset,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
