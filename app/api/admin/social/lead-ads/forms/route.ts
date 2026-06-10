export const dynamic = 'force-dynamic';

/**
 * /api/admin/social/lead-ads/forms
 *
 * GET  → list synced meta_lead_forms + their field-mapping counts.
 * POST → sync forms from Meta. Pulls /{page-id}/leadgen_forms for each
 *        Page id in the body, upserts the form row, refreshes questions[],
 *        keeps existing institution_id assignment.
 *
 * Page set resolution (POST): body.page_ids → distinct fb_page_id already
 * in meta_lead_forms → active fb_pages rows (first-time sync needs no args;
 * the admin UI button POSTs an empty body).
 *
 * Token resolution (POST): per-page fb_pages.access_token (seeded from
 * /me/accounts by the facebook poll cron) preferred, falling back to the
 * standard env chain: META_LEAD_ADS_PAGE_ACCESS_TOKEN →
 * META_IG_SYSTEM_USER_TOKEN → MESSENGER_PAGE_ACCESS_TOKEN →
 * META_PAGE_ACCESS_TOKEN. Mirrors app/api/cron/meta-facebook-poll. Graph
 * version pinned to v25.0 explicitly (lib default is still v21.0).
 *
 * Role: super_admin / administrator only. The webhook + cron run as
 * service_role so they bypass these endpoints entirely. Note: fb_pages RLS
 * scopes the per-page token lookup to the caller's institution unless
 * profiles.role = 'super_admin' — when RLS returns no rows the env
 * fallback chain still applies.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { listForms } from '@/lib/meta/lead-ads-client';

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();

  if (!profile) return { ok: false as const, status: 403 };

  const allowed =
    profile.is_super_admin ||
    profile.role === 'super_admin' ||
    profile.role === 'administrator';
  if (!allowed) return { ok: false as const, status: 403 };

  return { ok: true as const, userId: user.id, supabase };
}

// ---------------------------------------------------------------------------
// GET — list forms
// ---------------------------------------------------------------------------

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' },
      { status: auth.status }
    );
  }

  const supabase = auth.supabase;

  const { data: forms, error } = await supabase
    .from('meta_lead_forms')
    .select(
      'id, fb_form_id, fb_page_id, name, status, locale, leads_count, ' +
        'institution_id, questions, is_active, fb_created_time, ' +
        'last_synced_at, last_backfilled_at, created_at, updated_at'
    )
    .order('updated_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Mapping counts per form.
  const { data: mappings } = await supabase
    .from('meta_lead_field_mappings')
    .select('form_id, fb_field_key');

  const counts = new Map<string, number>();
  for (const m of mappings ?? []) {
    const fid = (m as { form_id: string }).form_id;
    counts.set(fid, (counts.get(fid) ?? 0) + 1);
  }

  const enriched = (forms ?? []).map((f) => ({
    ...f,
    mapping_count: counts.get(f.id as string) ?? 0,
  }));

  return NextResponse.json({ ok: true, data: enriched });
}

// ---------------------------------------------------------------------------
// POST — sync forms from Meta
//
// Body: { page_ids?: string[] }
//   If page_ids omitted, syncs the distinct fb_page_id set already in
//   meta_lead_forms, falling back to active fb_pages rows so the admin UI's
//   empty-body POST works on first-time setup too.
// ---------------------------------------------------------------------------

const GRAPH_API_VERSION = 'v25.0';

/** Standard env fallback chain (mirrors the other Meta routes fixed for this). */
function getEnvFallbackToken(): string | undefined {
  return (
    process.env.META_LEAD_ADS_PAGE_ACCESS_TOKEN ||
    process.env.META_IG_SYSTEM_USER_TOKEN ||
    process.env.MESSENGER_PAGE_ACCESS_TOKEN ||
    process.env.META_PAGE_ACCESS_TOKEN ||
    undefined
  );
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' },
      { status: auth.status }
    );
  }

  const supabase = auth.supabase;

  let body: { page_ids?: string[] } = {};
  try {
    body = (await request.json()) as { page_ids?: string[] };
  } catch {
    // Empty body is fine — fall back to known pages.
  }

  // Per-page tokens, seeded from /me/accounts by the facebook poll cron.
  // RLS scopes this to the caller's institution unless role='super_admin';
  // when no rows come back the env fallback below still covers every page.
  // 'dormant' is included deliberately: dormancy means "no recent posts",
  // not "disconnected" — lead forms on a dormant page are still live. The
  // 2026-06-10 first-run synced only 2 of 9 pages because the other 7 were
  // (falsely, pre-#1286) marked dormant and this filter excluded them.
  const { data: fbPageRows } = await supabase
    .from('fb_pages')
    .select('fb_page_id, access_token')
    .in('status', ['active', 'dormant']);

  const pageTokens = new Map<string, string>();
  for (const r of fbPageRows ?? []) {
    const row = r as { fb_page_id: string; access_token: string | null };
    if (row.access_token) pageTokens.set(row.fb_page_id, row.access_token);
  }

  let pageIds = body.page_ids ?? [];
  if (!pageIds.length) {
    const { data: rows } = await supabase
      .from('meta_lead_forms')
      .select('fb_page_id');
    pageIds = Array.from(new Set((rows ?? []).map((r) => (r as { fb_page_id: string }).fb_page_id)));
  }
  if (!pageIds.length) {
    // First-time sync: no forms yet — derive the page set from fb_pages.
    pageIds = Array.from(
      new Set((fbPageRows ?? []).map((r) => (r as { fb_page_id: string }).fb_page_id))
    );
  }

  if (!pageIds.length) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'No page_ids supplied, no existing forms, and no fb_pages rows to derive a page set from. ' +
          'Run the facebook poll cron once to seed fb_pages, or pass {page_ids: ["..."]} explicitly.',
      },
      { status: 400 }
    );
  }

  const envToken = getEnvFallbackToken();
  if (!envToken && pageTokens.size === 0) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'No Meta access token available. Set one of META_LEAD_ADS_PAGE_ACCESS_TOKEN / ' +
          'META_IG_SYSTEM_USER_TOKEN / MESSENGER_PAGE_ACCESS_TOKEN / META_PAGE_ACCESS_TOKEN, ' +
          'or seed per-page tokens into fb_pages via the facebook poll cron.',
      },
      { status: 500 }
    );
  }

  const summary: Array<{
    page_id: string;
    fetched: number;
    upserted: number;
    token_source?: 'fb_pages' | 'env';
    error?: string;
  }> = [];

  for (const pageId of pageIds) {
    const perPageToken = pageTokens.get(pageId);
    const accessToken = perPageToken ?? envToken;
    if (!accessToken) {
      summary.push({
        page_id: pageId,
        fetched: 0,
        upserted: 0,
        error: 'No token: fb_pages row has no access_token and no env fallback is set.',
      });
      continue;
    }
    const tokenSource: 'fb_pages' | 'env' = perPageToken ? 'fb_pages' : 'env';
    try {
      const forms = await listForms(pageId, {
        accessToken,
        apiVersion: GRAPH_API_VERSION,
      });
      let upserted = 0;
      for (const f of forms) {
        const { error } = await supabase
          .from('meta_lead_forms')
          .upsert(
            {
              fb_form_id: f.id,
              fb_page_id: pageId,
              name: f.name,
              status: f.status ?? 'ACTIVE',
              locale: f.locale ?? null,
              leads_count: f.leads_count ?? 0,
              questions: (f.questions ?? []) as unknown as Record<string, unknown>,
              fb_created_time: f.created_time ?? null,
              last_synced_at: new Date().toISOString(),
            },
            { onConflict: 'fb_form_id', ignoreDuplicates: false }
          );
        if (!error) upserted += 1;
      }
      summary.push({
        page_id: pageId,
        fetched: forms.length,
        upserted,
        token_source: tokenSource,
      });
    } catch (err) {
      summary.push({
        page_id: pageId,
        fetched: 0,
        upserted: 0,
        token_source: tokenSource,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ ok: true, summary });
}
