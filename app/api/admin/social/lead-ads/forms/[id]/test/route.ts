export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/social/lead-ads/forms/[id]/test
 *
 * Admin "Send test lead" action. Builds a synthetic FbLeadgenLead from the
 * request body and runs it through the importer using a mock fetchLead.
 * Useful for verifying:
 *   - mappings are wired right
 *   - institution resolution works
 *   - LeadService.captureLead path doesn't choke on shape mismatches
 *
 * The synthetic lead is tagged in raw_payload.is_test=true so it's easy to
 * find and clean up.
 *
 * Role: super_admin / administrator.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { importMetaLead } from '@/lib/services/admission/meta-lead-importer';
import type {
  FbLeadgenLead,
  FbLeadgenWebhookValue,
} from '@/lib/meta/lead-ads-types';

async function requireAdmin(permissionKey: string) {
  const supabase = await createServerClient();
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

  let allowed =
    profile.is_super_admin ||
    profile.role === 'super_admin' ||
    profile.role === 'administrator';

  // 2026-06-11 granular-permission retrofit: roles granted the social.*
  // key via Role Management pass too.
  if (!allowed) {
    const { data: perm } = await supabase.rpc('user_has_permission', {
      permission_name: permissionKey,
    });
    allowed = !!perm;
  }
  if (!allowed) return { ok: false as const, status: 403 };

  return { ok: true as const, userId: user.id, supabase };
}

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAdmin('social.lead_ads.manage');
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' },
      { status: auth.status }
    );
  }

  const { id } = await ctx.params;

  type Body = {
    /** Optional pre-built field_data; if absent we use a minimal default. */
    field_data?: Array<{ name: string; values: string[] }>;
  };
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    // empty body is fine
  }

  const supabase = auth.supabase;
  const { data: form, error: formErr } = await supabase
    .from('meta_lead_forms')
    .select('id, fb_form_id, fb_page_id')
    .eq('id', id)
    .maybeSingle();

  if (formErr || !form) {
    return NextResponse.json(
      { error: formErr?.message ?? 'Form not found' },
      { status: 404 }
    );
  }

  // Service-role client — bypasses RLS for the cross-table write (matches
  // webhook/cron path).
  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceUrl || !serviceKey) {
    return NextResponse.json(
      { error: 'Supabase service role credentials missing' },
      { status: 500 }
    );
  }
  const service = createServiceClient(serviceUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const syntheticLeadgenId = `test_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const fbFormId = form.fb_form_id as string;
  const fbPageId = form.fb_page_id as string;

  const fakeFieldData = body.field_data && body.field_data.length > 0
    ? body.field_data
    : [
        { name: 'full_name', values: ['Test Lead'] },
        { name: 'phone_number', values: ['+919876543210'] },
        { name: 'email', values: ['test.lead@example.com'] },
      ];

  const syntheticLead: FbLeadgenLead = {
    id: syntheticLeadgenId,
    created_time: new Date().toISOString(),
    form_id: fbFormId,
    is_organic: false,
    platform: 'fb',
    field_data: fakeFieldData,
  };

  const event: FbLeadgenWebhookValue = {
    leadgen_id: syntheticLeadgenId,
    form_id: fbFormId,
    page_id: fbPageId,
    created_time: Math.floor(Date.now() / 1000),
  };

  // Tag synthetic event row before importer runs.
  await service.from('meta_leadgen_events').insert({
    fb_leadgen_id: syntheticLeadgenId,
    fb_form_id: fbFormId,
    fb_page_id: fbPageId,
    form_id: form.id,
    raw_payload: { ...event, is_test: true, requested_by: auth.userId },
    status: 'pending',
  });

  const result = await importMetaLead(
    { event },
    {
      supabaseService: service,
      fetchLead: async () => syntheticLead,
    }
  );

  return NextResponse.json({ ok: true, result, syntheticLeadgenId });
}
