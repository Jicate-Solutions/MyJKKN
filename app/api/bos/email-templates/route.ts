import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { resolveBosBoardScope } from '@/lib/utils/bos/bos-access';

// ── Validation ────────────────────────────────────────────────────────────────

const upsertTemplateSchema = z.object({
  institutions_id: z.string().uuid().nullable(),
  template_code: z.string().min(1).max(64),
  template_name: z.string().min(1).max(255),
  description: z.string().max(1000).optional().nullable(),
  subject: z.string().min(1).max(500),
  body_html: z.string().min(10).max(100000),
  is_active: z.boolean().default(true),
});

// ── Permission gate ──────────────────────────────────────────────────────────
// Only super-admin OR users with chairman/principal/HOD role can edit templates.
// Mirrors the RLS policies in the 20260516_bos_email_templates migration.

async function canEditTemplates(userId: string): Promise<boolean> {
  const scope = await resolveBosBoardScope(userId);
  if (scope.isSuperAdmin) return true;
  if (scope.isPrincipal) return true;
  // Chairman of at least one composition can also edit templates.
  return scope.isChairmanIn.size > 0;
}

// ── GET /api/bos/email-templates ─────────────────────────────────────────────
// Query params:
//   - institutionsId (optional) → filter to that institution's templates +
//     fall back to global defaults (institutions_id IS NULL)
//   - templateCode (optional)   → filter to one code
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const institutionsId = searchParams.get('institutionsId');
    const templateCode = searchParams.get('templateCode');

    let query = supabase
      .from('bos_email_templates')
      .select('*')
      .eq('is_active', true);

    if (templateCode) query = query.eq('template_code', templateCode);

    // Institution-scoped lookup: return both the per-institution row (if any)
    // and the system default (institutions_id IS NULL). UI picks the more
    // specific one. Passing no institutionsId returns global defaults only.
    if (institutionsId) {
      query = query.or(`institutions_id.eq.${institutionsId},institutions_id.is.null`);
    } else {
      query = query.is('institutions_id', null);
    }

    const { data, error } = await query.order('template_code', { ascending: true });
    if (error) throw error;

    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    console.error('[bos/email-templates] GET error:', error);
    return NextResponse.json(
      { error: (error as Error).message ?? 'Failed to fetch templates' },
      { status: 500 }
    );
  }
}

// ── POST /api/bos/email-templates ────────────────────────────────────────────
// Upsert (institutions_id, template_code) — if an active row exists, update;
// otherwise insert. Set is_active=false on existing rows we're replacing so
// the unique-active index isn't violated.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allowed = await canEditTemplates(user.id);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Forbidden: only chairman/principal/super-admin can edit templates' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = upsertTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const payload = parsed.data;

    // Find existing active row with the same (institutions_id, template_code).
    let existingQuery = supabase
      .from('bos_email_templates')
      .select('id')
      .eq('template_code', payload.template_code)
      .eq('is_active', true);
    existingQuery = payload.institutions_id
      ? existingQuery.eq('institutions_id', payload.institutions_id)
      : existingQuery.is('institutions_id', null);

    const { data: existing } = await existingQuery.maybeSingle();

    if (existing?.id) {
      // Update in place — preserves history relative to created_by.
      const { data, error } = await supabase
        .from('bos_email_templates')
        .update({
          template_name: payload.template_name,
          description: payload.description ?? null,
          subject: payload.subject,
          body_html: payload.body_html,
          updated_by: user.id,
        })
        .eq('id', existing.id)
        .select('*')
        .single();

      if (error) throw error;
      return NextResponse.json({ data });
    }

    // Otherwise insert a fresh row.
    const { data, error } = await supabase
      .from('bos_email_templates')
      .insert({
        institutions_id: payload.institutions_id,
        template_code: payload.template_code,
        template_name: payload.template_name,
        description: payload.description ?? null,
        subject: payload.subject,
        body_html: payload.body_html,
        is_active: payload.is_active,
        created_by: user.id,
        updated_by: user.id,
      })
      .select('*')
      .single();

    if (error) throw error;
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error('[bos/email-templates] POST error:', error);
    return NextResponse.json(
      { error: (error as Error).message ?? 'Failed to save template' },
      { status: 500 }
    );
  }
}
