import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { resolveBosBoardScope } from '@/lib/utils/bos/bos-access';

// ── BoS letterhead assets (20260729120000) ───────────────────────────────────
// Per-institution seal + principal signature used by the call-letter PDF.
// Stored as base64 `data:` URIs — see lib/utils/bos/letterhead-assets.ts for
// why data URIs rather than storage URLs.

export const dynamic = 'force-dynamic';

// Base64 inflates bytes by ~4/3, so this ceiling is roughly a 550 KB source
// image — far more than a seal or a signature scan needs, while keeping the
// row well inside a comfortable PostgREST payload.
const MAX_DATA_URI_CHARS = 750_000;

const dataUriSchema = z
  .string()
  .max(MAX_DATA_URI_CHARS, 'Image is too large — keep it under ~500 KB')
  .refine(
    (v) => v === '' || /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=\s]+$/.test(v),
    'Must be a base64 data URI for a PNG, JPEG or WebP image',
  )
  .nullable()
  .optional();

async function canEdit(userId: string): Promise<boolean> {
  const scope = await resolveBosBoardScope(userId);
  return scope.isSuperAdmin || scope.isPrincipal || scope.isChairmanIn.size > 0;
}

// ── GET /api/bos/letterhead-assets?institutionsId=… ──────────────────────────
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const institutionsId = new URL(request.url).searchParams.get('institutionsId');
    if (!institutionsId) {
      return NextResponse.json({ error: 'institutionsId is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('bos_letterhead_assets')
      .select('id, institutions_id, seal_image, signature_image')
      .eq('institutions_id', institutionsId)
      .eq('is_active', true)
      .maybeSingle();
    if (error) throw error;

    return NextResponse.json({
      data: data ?? { seal_image: null, signature_image: null },
      canEdit: await canEdit(user.id),
    });
  } catch (error) {
    console.error('[bos/letterhead-assets] GET error:', error);
    return NextResponse.json(
      { error: (error as Error).message ?? 'Failed to fetch letterhead assets' },
      { status: 500 }
    );
  }
}

// ── POST /api/bos/letterhead-assets ──────────────────────────────────────────
// Upsert the single active row for an institution. An empty string clears that
// image; omitting the key leaves the stored value untouched (so saving only the
// signature never wipes the seal).
const upsertSchema = z.object({
  institutions_id: z.string().uuid(),
  seal_image: dataUriSchema,
  signature_image: dataUriSchema,
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await canEdit(user.id))) {
      return NextResponse.json(
        { error: 'Forbidden: only chairman/principal/super-admin can set the seal & signature' },
        { status: 403 }
      );
    }

    const raw = await request.json();
    const parsed = upsertSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid payload', issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const p = parsed.data;

    // '' → clear (null); undefined → leave column alone.
    const patch: Record<string, unknown> = {};
    if ('seal_image' in raw) patch.seal_image = p.seal_image ? p.seal_image : null;
    if ('signature_image' in raw) patch.signature_image = p.signature_image ? p.signature_image : null;

    const { data: existing } = await supabase
      .from('bos_letterhead_assets')
      .select('id')
      .eq('institutions_id', p.institutions_id)
      .eq('is_active', true)
      .maybeSingle();

    if (existing?.id) {
      const { data, error } = await supabase
        .from('bos_letterhead_assets')
        .update(patch)
        .eq('id', existing.id)
        .select('id, institutions_id, seal_image, signature_image')
        .single();
      if (error) throw error;
      return NextResponse.json({ data });
    }

    const { data, error } = await supabase
      .from('bos_letterhead_assets')
      .insert({
        institutions_id: p.institutions_id,
        seal_image: patch.seal_image ?? null,
        signature_image: patch.signature_image ?? null,
        created_by: user.id,
      })
      .select('id, institutions_id, seal_image, signature_image')
      .single();
    if (error) throw error;
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error('[bos/letterhead-assets] POST error:', error);
    return NextResponse.json(
      { error: (error as Error).message ?? 'Failed to save letterhead assets' },
      { status: 500 }
    );
  }
}
