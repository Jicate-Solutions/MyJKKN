import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { resolveBosBoardScope } from '@/lib/utils/bos/bos-access';
import { fetchCoeBoardMap } from '@/lib/utils/bos/coe-boards';

// ── BoS per-board sender overrides (20260724140000) ───────────────────────────
// Per-(institution, COE board) From: identity. ECE and EEE can each send BoS
// notices from their own address while sharing the institution's SMTP account.
// Absent row → smtp_configuration institution default (+ AC override).

export const dynamic = 'force-dynamic';

async function canEdit(userId: string): Promise<boolean> {
  const scope = await resolveBosBoardScope(userId);
  return scope.isSuperAdmin || scope.isPrincipal || scope.isChairmanIn.size > 0;
}

// ── GET /api/bos/board-senders?institutionsId=… ──────────────────────────────
// Returns the saved overrides AND the COE board list so the UI can render one
// row per board with an optional sender.
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

    const [{ data: senders, error }, boardMap] = await Promise.all([
      supabase
        .from('bos_board_senders')
        .select('id, institutions_id, board_id, sender_email, sender_name, is_active')
        .eq('institutions_id', institutionsId)
        .eq('is_active', true),
      fetchCoeBoardMap(institutionsId),
    ]);
    if (error) throw error;

    // Bare board list (id + display name) for the picker, sorted by name.
    const boards = [...boardMap.values()]
      .map((b) => ({
        id: b.id,
        board_code: b.board_code,
        board_name: b.board_name.replace(/^\s*Board of Studies\s*-\s*/i, '').trim(),
        board_type: b.board_type ?? null,
      }))
      .sort((a, b) => a.board_name.localeCompare(b.board_name));

    return NextResponse.json({ data: { senders: senders ?? [], boards } });
  } catch (error) {
    console.error('[bos/board-senders] GET error:', error);
    return NextResponse.json(
      { error: (error as Error).message ?? 'Failed to fetch board senders' },
      { status: 500 }
    );
  }
}

// ── POST /api/bos/board-senders ──────────────────────────────────────────────
// Upsert one (institution, board) sender. Empty sender_email clears the row
// (deactivates) so the board falls back to the institution default.
const upsertSchema = z.object({
  institutions_id: z.string().uuid(),
  board_id: z.string().min(1),
  sender_email: z.string().email().max(255).nullable().or(z.literal('')),
  sender_name: z.string().max(255).optional().nullable(),
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
        { error: 'Forbidden: only chairman/principal/super-admin can set board senders' },
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

    // Find any existing active row for this (institution, board).
    const { data: existing } = await supabase
      .from('bos_board_senders')
      .select('id')
      .eq('institutions_id', p.institutions_id)
      .eq('board_id', p.board_id)
      .eq('is_active', true)
      .maybeSingle();

    const email = (p.sender_email ?? '').trim();

    // Empty email → clear the override (deactivate the row if present).
    if (!email) {
      if (existing?.id) {
        const { error } = await supabase
          .from('bos_board_senders')
          .update({ is_active: false })
          .eq('id', existing.id);
        if (error) throw error;
      }
      return NextResponse.json({ data: null, cleared: true });
    }

    if (existing?.id) {
      const { data, error } = await supabase
        .from('bos_board_senders')
        .update({ sender_email: email, sender_name: p.sender_name ?? null })
        .eq('id', existing.id)
        .select('*')
        .single();
      if (error) throw error;
      return NextResponse.json({ data });
    }

    const { data, error } = await supabase
      .from('bos_board_senders')
      .insert({
        institutions_id: p.institutions_id,
        board_id: p.board_id,
        sender_email: email,
        sender_name: p.sender_name ?? null,
        created_by: user.id,
      })
      .select('*')
      .single();
    if (error) throw error;
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error('[bos/board-senders] POST error:', error);
    return NextResponse.json(
      { error: (error as Error).message ?? 'Failed to save board sender' },
      { status: 500 }
    );
  }
}
