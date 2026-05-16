/**
 * GET /api/attention-bar/admin/audit?filters
 *
 * Tab 6 — paginated audit log. Supports filters:
 *   - from: ISO date string (default: 24h ago)
 *   - to: ISO date string (default: now)
 *   - page_filter: pathname substring filter
 *   - fired_layer: 0|1|2|3|4
 *   - page: pagination page (default: 1)
 *   - pageSize: rows per page (default: 50, max: 200)
 *
 * Auth: super_admin OR attention_bar.audit.view
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEnhancedUserProfile } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { profile, error: authError } = await getEnhancedUserProfile();
  if (authError || !profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const isSuperAdmin = profile.is_super_admin === true;
  const supabase = await createClient();

  if (!isSuperAdmin) {
    const { data: hasPerm } = await supabase.rpc('user_has_permission', {
      permission_name: 'attention_bar.audit.view',
    });
    if (!hasPerm) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const url = new URL(request.url);
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const from = url.searchParams.get('from') ?? defaultFrom;
  const to = url.searchParams.get('to') ?? now.toISOString();
  const pageFilter = url.searchParams.get('page_filter') ?? '';
  const layerFilter = url.searchParams.get('fired_layer');
  const pg = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const pageSize = Math.min(200, parseInt(url.searchParams.get('pageSize') ?? '50', 10));
  const offset = (pg - 1) * pageSize;

  try {
    let query = supabase
      .from('quick_action_audit')
      .select('id, page, role, fired_layer, rule_id, action_id, trace, rendered_at', { count: 'exact' })
      .gte('rendered_at', from)
      .lte('rendered_at', to)
      .order('rendered_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (pageFilter) {
      query = query.ilike('page', `%${pageFilter}%`);
    }

    if (layerFilter !== null) {
      const layerNum = parseInt(layerFilter, 10);
      if (!isNaN(layerNum) && [0, 1, 2, 3, 4].includes(layerNum)) {
        query = query.eq('fired_layer', layerNum);
      }
    }

    const { data, error, count } = await query;
    if (error) throw error;

    // Note: user_id is intentionally NOT selected — audit log shows page/role/layer only.
    // This matches the spec: audit is PII-adjacent; we don't expose user identity in the table view.

    return NextResponse.json({
      rows: data ?? [],
      total: count ?? 0,
      page: pg,
      pageSize,
      filters: { from, to, pageFilter, layerFilter },
    });
  } catch (err) {
    console.error('[attention-bar/admin/audit] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
