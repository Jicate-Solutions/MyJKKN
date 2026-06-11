export const dynamic = 'force-dynamic';

/**
 * GET /api/admission/inbox/instagram
 *
 * Admission-prefixed discovery endpoint for the /admission/inbox/instagram
 * page. Returns whether the IG DM substrate is ready and, when it is, the
 * institution-scoped conversation list — so the page can render a single
 * fetch on mount without juggling several conditional calls.
 *
 * The heavy lifting (auth, RLS scoping, lead linkage) is already done by
 * /api/social/instagram/dm/conversations. This route delegates to the same
 * Supabase reads via the user's session, then layers on a substrate-ready
 * check so the UI can show the "Awaiting IG Advanced Access approval"
 * empty state when the ig_dm_conversations table or platform_policy is
 * absent rather than 500-ing.
 *
 * Query params:
 *   institution_id?: string  — required when caller is institution_admin
 *                              (super_admin can omit, but then `data.conversations`
 *                              is omitted too)
 *   limit?: number           — default 50, max 200
 *   offset?: number          — default 0
 *
 * Auth: super_admin OR same-institution profile.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

interface Response {
  substrate_ready: boolean;
  ig_dm_enabled: boolean | null;
  reason?: string;
  conversations?: Array<{
    id: string;
    institution_id: string;
    ig_account_id: string;
    ig_user_id: string;
    lead_id: string | null;
    last_inbound_at: string | null;
    created_at: string;
    updated_at: string;
  }>;
  count?: number;
  limit?: number;
  offset?: number;
}

export async function GET(request: NextRequest) {
  await connection();

  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const sp = new URL(request.url).searchParams;
    const institutionId = sp.get('institution_id');
    const limit = Math.min(Number(sp.get('limit') ?? 50), 200);
    const offset = Number(sp.get('offset') ?? 0);

    // Resolve caller scope
    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id, role, is_super_admin')
      .eq('id', user.id)
      .single();

    const isSuperAdmin =
      profile?.is_super_admin === true || profile?.role === 'super_admin';

    if (!isSuperAdmin && institutionId && profile?.institution_id !== institutionId) {
      return NextResponse.json(
        { success: false, error: 'Access denied' },
        { status: 403 }
      );
    }

    // Substrate readiness check — graceful when table missing or RLS denies
    let substrateReady = true;
    let conversationsCount: number | null = null;
    const { error: probeErr } = await supabase
      .from('ig_dm_conversations')
      .select('id', { count: 'exact', head: true })
      .limit(1);

    if (probeErr) {
      // PostgREST returns code 42P01 for missing table; treat any read error
      // here as "not ready" rather than crashing the page.
      substrateReady = false;
    }

    // Policy probe (best-effort)
    let igDmEnabled: boolean | null = null;
    try {
      const { data: enabledRaw } = await supabase.rpc('fn_get_policy', {
        p_key: 'ig.dm.is_enabled',
        p_scope_id: null,
      });
      if (typeof enabledRaw === 'boolean') {
        igDmEnabled = enabledRaw;
      }
    } catch {
      igDmEnabled = null;
    }

    if (!substrateReady) {
      const body: Response = {
        substrate_ready: false,
        ig_dm_enabled: igDmEnabled,
        reason:
          'IG DM substrate not provisioned. Awaiting Meta IG Advanced Access approval — see /docs/meta-integration-app-review-submission-2026.md',
      };
      return NextResponse.json({ success: true, data: body });
    }

    // Substrate ready — fetch the conversation list if we have an institution
    // to scope to (super_admin without a picked institution gets an empty
    // payload + the substrate flag).
    const scopeId = institutionId ?? profile?.institution_id ?? null;
    if (!scopeId) {
      const body: Response = {
        substrate_ready: true,
        ig_dm_enabled: igDmEnabled,
        reason:
          'No institution scope. Pick an institution to see DM conversations.',
        conversations: [],
        count: 0,
        limit,
        offset,
      };
      return NextResponse.json({ success: true, data: body });
    }

    const { data: conversations, count, error } = await supabase
      .from('ig_dm_conversations')
      .select(
        'id, institution_id, ig_account_id, ig_user_id, lead_id, last_inbound_at, created_at, updated_at',
        { count: 'exact' }
      )
      .eq('institution_id', scopeId)
      .order('last_inbound_at', { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json(
        { success: false, error: `Query failed: ${error.message}` },
        { status: 500 }
      );
    }

    conversationsCount = count ?? 0;

    const body: Response = {
      substrate_ready: true,
      ig_dm_enabled: igDmEnabled,
      conversations: conversations ?? [],
      count: conversationsCount,
      limit,
      offset,
    };

    return NextResponse.json({ success: true, data: body });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
