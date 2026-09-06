export const dynamic = 'force-dynamic';

/**
 * /api/admin/social/lead-ads/forms/[id]/mappings
 *
 * GET  → list mappings for one form (joined with questions for labels).
 * PUT  → upsert the full mapping set for a form (atomic delete-and-insert).
 *
 * Body shape for PUT:
 *   { mappings: Array<{ fb_field_key: string; lead_column: string;
 *                       transform?: string | null; is_required?: boolean }>;
 *     institution_id?: string | null;
 *   }
 *
 * The `institution_id` (optional) updates meta_lead_forms.institution_id
 * in the same call so the admin UI doesn't need a second roundtrip.
 *
 * Role: super_admin / administrator. RLS on meta_lead_field_mappings also
 * enforces is_super_admin/is_admin for the underlying writes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ALLOWED_LEAD_COLUMNS } from '@/lib/services/admission/meta-lead-importer';

async function requireAdmin(permissionKey: string) {
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

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAdmin('social.lead_ads.view');
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' },
      { status: auth.status }
    );
  }

  const { id } = await ctx.params;
  const supabase = auth.supabase;

  const { data: form } = await supabase
    .from('meta_lead_forms')
    .select('id, fb_form_id, name, institution_id, questions')
    .eq('id', id)
    .maybeSingle();

  if (!form) {
    return NextResponse.json({ error: 'Form not found' }, { status: 404 });
  }

  const { data: mappings, error } = await supabase
    .from('meta_lead_field_mappings')
    .select('id, fb_field_key, lead_column, transform, is_required, created_at, updated_at')
    .eq('form_id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    data: {
      form,
      mappings: mappings ?? [],
      allowed_lead_columns: Array.from(ALLOWED_LEAD_COLUMNS),
    },
  });
}

export async function PUT(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAdmin('social.lead_ads.manage');
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' },
      { status: auth.status }
    );
  }

  const { id } = await ctx.params;
  const supabase = auth.supabase;

  type Body = {
    mappings?: Array<{
      fb_field_key: string;
      lead_column: string;
      transform?: string | null;
      is_required?: boolean;
    }>;
    institution_id?: string | null;
  };
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const incoming = body.mappings ?? [];
  // Whitelist guard — never trust the client to pick a lead_column.
  const invalid = incoming.find(
    (m) =>
      !ALLOWED_LEAD_COLUMNS.has(
        m.lead_column as unknown as Parameters<typeof ALLOWED_LEAD_COLUMNS.has>[0]
      )
  );
  if (invalid) {
    return NextResponse.json(
      { error: `lead_column not allowed: ${invalid.lead_column}` },
      { status: 400 }
    );
  }

  // Atomic replace: delete then insert. Both operations are RLS-gated so an
  // unprivileged user can't smuggle a half-update through.
  const { error: delErr } = await supabase
    .from('meta_lead_field_mappings')
    .delete()
    .eq('form_id', id);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  if (incoming.length > 0) {
    const rows = incoming.map((m) => ({
      form_id: id,
      fb_field_key: m.fb_field_key,
      lead_column: m.lead_column,
      transform: m.transform ?? null,
      is_required: Boolean(m.is_required),
    }));
    const { error: insErr } = await supabase
      .from('meta_lead_field_mappings')
      .insert(rows);
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  if (body.institution_id !== undefined) {
    const { error: updErr } = await supabase
      .from('meta_lead_forms')
      .update({ institution_id: body.institution_id })
      .eq('id', id);
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, count: incoming.length });
}
