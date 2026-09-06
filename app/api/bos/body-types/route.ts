import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { resolveBosBoardScope } from '@/lib/utils/bos/bos-access';

// ── BoS Body Types catalog (20260724140000) ──────────────────────────────────
// The 9 governing bodies a BoS-family meeting can belong to (BOS, DFPC, PAC,
// PAIC, IAB, DAB, CDC, AC, GB). Global (institution-agnostic) so the code is a
// stable join key for per-committee email/PDF formats. Read by anyone; only
// super-admins may add or rename (RLS also enforces this).

export const dynamic = 'force-dynamic';

// ── GET /api/bos/body-types ───────────────────────────────────────────────────
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('bos_body_types')
      .select('id, code, name, sort_order, is_active')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) throw error;
    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    console.error('[bos/body-types] GET error:', error);
    return NextResponse.json(
      { error: (error as Error).message ?? 'Failed to fetch body types' },
      { status: 500 }
    );
  }
}

// ── POST /api/bos/body-types ──────────────────────────────────────────────────
// Add a new body type or rename an existing one (matched by id). Super-admin
// only — this catalog is org-wide.
const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/, 'Code: letters, digits, - or _ only'),
  name: z.string().min(1).max(255),
  sort_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveBosBoardScope(user.id);
    if (!scope.isSuperAdmin) {
      return NextResponse.json(
        { error: 'Forbidden: only super-admins can manage the body-type catalog' },
        { status: 403 }
      );
    }

    const parsed = upsertSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const p = parsed.data;

    if (p.id) {
      const { data, error } = await supabase
        .from('bos_body_types')
        .update({
          code: p.code.toUpperCase(),
          name: p.name,
          sort_order: p.sort_order ?? 0,
          is_active: p.is_active ?? true,
        })
        .eq('id', p.id)
        .select('*')
        .single();
      if (error) throw error;
      return NextResponse.json({ data });
    }

    const { data, error } = await supabase
      .from('bos_body_types')
      .insert({
        code: p.code.toUpperCase(),
        name: p.name,
        sort_order: p.sort_order ?? 0,
        created_by: user.id,
      })
      .select('*')
      .single();
    if (error) throw error;
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    const msg = (error as Error).message ?? 'Failed to save body type';
    // Unique-violation on lower(code) → friendly message.
    const status = /duplicate key|unique/i.test(msg) ? 409 : 500;
    console.error('[bos/body-types] POST error:', error);
    return NextResponse.json(
      { error: status === 409 ? 'A body type with that code already exists.' : msg },
      { status }
    );
  }
}
