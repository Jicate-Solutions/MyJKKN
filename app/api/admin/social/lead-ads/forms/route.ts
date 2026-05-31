export const dynamic = 'force-dynamic';

/**
 * /api/admin/social/lead-ads/forms
 *
 * GET  → list synced meta_lead_forms + their field-mapping counts.
 * POST → sync forms from Meta. Pulls /{page-id}/leadgen_forms for each
 *        Page id in the body, upserts the form row, refreshes questions[],
 *        keeps existing institution_id assignment.
 *
 * Role: super_admin / administrator only. The webhook + cron run as
 * service_role so they bypass these endpoints entirely.
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
//   meta_lead_forms. First-time setup: pass the page ids explicitly.
// ---------------------------------------------------------------------------

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

  let pageIds = body.page_ids ?? [];
  if (!pageIds.length) {
    const { data: rows } = await supabase
      .from('meta_lead_forms')
      .select('fb_page_id');
    pageIds = Array.from(new Set((rows ?? []).map((r) => (r as { fb_page_id: string }).fb_page_id)));
  }

  if (!pageIds.length) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'No page_ids supplied and no existing forms to derive page set from. Pass {page_ids: ["..."]} on first sync.',
      },
      { status: 400 }
    );
  }

  const pageAccessToken = process.env.META_LEAD_ADS_PAGE_ACCESS_TOKEN;
  if (!pageAccessToken) {
    return NextResponse.json(
      { ok: false, error: 'META_LEAD_ADS_PAGE_ACCESS_TOKEN unset' },
      { status: 500 }
    );
  }

  const summary: Array<{
    page_id: string;
    fetched: number;
    upserted: number;
    error?: string;
  }> = [];

  for (const pageId of pageIds) {
    try {
      const forms = await listForms(pageId, { accessToken: pageAccessToken });
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
      summary.push({ page_id: pageId, fetched: forms.length, upserted });
    } catch (err) {
      summary.push({
        page_id: pageId,
        fetched: 0,
        upserted: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ ok: true, summary });
}
