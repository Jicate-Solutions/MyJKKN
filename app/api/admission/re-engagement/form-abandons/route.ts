// app/api/admission/re-engagement/form-abandons/route.ts
// Path A B7 — Form-abandon recovery surface API.
//
// GET /api/admission/re-engagement/form-abandons
//   ?institution_id=...   (optional — filters to that institution; super_admin
//                          sees all when omitted)
//   ?window=24h           (default 24h; also supports 7d for the tab list)
//   ?limit=50             (default 50, max 200)
//
// Returns:
//   { stats: { total, matched, anonymous, recovered, last_24h_count },
//     rows: [...]  // ordered by created_at desc, capped by limit
//   }
//
// RLS already restricts to super_admin / admission_counselor; this route
// uses the user's session (via @supabase/ssr) — service-role NOT used here.
//
// Created: 2026-05-03 — Path A B7.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Authn check — RLS will further enforce role.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const url = request.nextUrl;
    const institutionId = url.searchParams.get('institution_id');
    const windowParam = url.searchParams.get('window') ?? '24h';
    const limitRaw = parseInt(url.searchParams.get('limit') ?? '50', 10);
    const limit = Math.min(Math.max(isFinite(limitRaw) ? limitRaw : 50, 1), 200);

    // Window → cutoff
    const windowHours = windowParam === '7d' ? 24 * 7 : 24;
    const cutoff = new Date(Date.now() - windowHours * 3600_000).toISOString();

    let query = (supabase as any)
      .from('admission_form_abandon_log')
      .select(
        'id, session_id, form_id, abandoned_at, matched_lead_id, recovery_triggered_at, detection_window_hours, metadata, created_at, ' +
          'lead:matched_lead_id(id, full_name, phone, email, funnel_stage, institution_id)',
        { count: 'exact' }
      )
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (institutionId) {
      // matched_lead_id may be NULL for anonymous abandons — those rows have
      // no institution attribution, so filtering by institution drops them.
      query = query.eq('lead.institution_id', institutionId);
    }

    const { data: rows, error } = await query;
    if (error) {
      console.error('[re-engagement/form-abandons] list error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Compute stats over the same window using lightweight count queries.
    const last24Cutoff = new Date(Date.now() - 24 * 3600_000).toISOString();

    const baseFilter = (q: any) => q.gte('created_at', last24Cutoff);

    const [{ count: total }, { count: matched }, { count: recovered }, { count: anonymous }] =
      await Promise.all([
        baseFilter(
          (supabase as any).from('admission_form_abandon_log').select('id', { count: 'exact', head: true })
        ),
        baseFilter(
          (supabase as any).from('admission_form_abandon_log').select('id', { count: 'exact', head: true })
        ).not('matched_lead_id', 'is', null),
        baseFilter(
          (supabase as any).from('admission_form_abandon_log').select('id', { count: 'exact', head: true })
        ).not('recovery_triggered_at', 'is', null),
        baseFilter(
          (supabase as any).from('admission_form_abandon_log').select('id', { count: 'exact', head: true })
        ).is('matched_lead_id', null),
      ]);

    return NextResponse.json({
      stats: {
        total: total ?? 0,
        matched: matched ?? 0,
        recovered: recovered ?? 0,
        anonymous: anonymous ?? 0,
        last_24h_count: total ?? 0,
      },
      rows: rows ?? [],
    });
  } catch (err) {
    console.error('[re-engagement/form-abandons] failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'internal error' },
      { status: 500 }
    );
  }
}
