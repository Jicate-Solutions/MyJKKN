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

// Shown in place of a stored password on read; "type to replace" — the same
// convention the SMTP-config route uses so editing other fields never wipes
// the secret.
const PASSWORD_MASK = '••••••••';

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

    const [{ data: rawSenders, error }, boardMap] = await Promise.all([
      supabase
        .from('bos_board_senders')
        .select(
          'id, institutions_id, board_id, sender_email, sender_name, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password_encrypted, is_active',
        )
        .eq('institutions_id', institutionsId)
        .eq('is_active', true),
      fetchCoeBoardMap(institutionsId),
    ]);
    if (error) throw error;

    // Never leak the stored secret — expose only whether one exists, and a
    // mask the UI shows in the password field.
    const senders = (rawSenders ?? []).map((s) => {
      const row = s as Record<string, unknown> & { smtp_password_encrypted?: string | null };
      const hasPassword = !!row.smtp_password_encrypted;
      const { smtp_password_encrypted: _drop, ...rest } = row;
      return { ...rest, has_smtp_password: hasPassword, smtp_password: hasPassword ? PASSWORD_MASK : '' };
    });

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
  // ── Model 3: optional per-board SMTP account (20260725) ────────────────────
  smtp_host: z.string().max(255).optional().nullable(),
  smtp_port: z.coerce.number().int().min(1).max(65535).optional().nullable(),
  smtp_secure: z.boolean().optional().nullable(),
  smtp_user: z.string().max(255).optional().nullable(),
  // May be the mask ('••••••••') meaning "keep existing"; empty means "clear".
  smtp_password: z.string().max(1024).optional().nullable(),
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

    // Per-board SMTP fields (Model 3). host/port/secure/user are set-or-clear.
    const emptyToNull = (v: string | null | undefined): string | null =>
      v == null || v.trim() === '' ? null : v.trim();
    const smtpFields: Record<string, unknown> = {
      smtp_host: emptyToNull(p.smtp_host),
      smtp_port: p.smtp_port ?? null,
      smtp_secure: typeof p.smtp_secure === 'boolean' ? p.smtp_secure : null,
      smtp_user: emptyToNull(p.smtp_user),
    };
    // Password: mask ('••••••••') → keep existing (omit the column); empty →
    // clear (null); anything else → store as-is.
    const pw = (p.smtp_password ?? '').trim();
    if (pw !== PASSWORD_MASK) {
      smtpFields.smtp_password_encrypted = pw ? pw : null;
    }

    if (existing?.id) {
      const { data, error } = await supabase
        .from('bos_board_senders')
        .update({ sender_email: email, sender_name: p.sender_name ?? null, ...smtpFields })
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
        ...smtpFields,
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
