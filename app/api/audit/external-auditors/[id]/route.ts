export const dynamic = 'force-dynamic';

// API: /api/audit/external-auditors/[id]
//   - PATCH  : extend expiry by N days (default 7) across all access rows for this user.
//              Body: { extend_days?: number }
//   - DELETE : immediate revoke — set is_active=false + expires_at=now() on all rows.
//   [id] is the profiles.id (user_id), not user_institution_access.id.

import { NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

async function requireManagePermission(supabase: any) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) return { ok: false as const, status: 401, error: 'Unauthorized' };
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_super_admin, role')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (profile?.is_super_admin === true) return { ok: true as const, userId: userData.user.id as string };
  if (profile?.role === 'super_admin' || profile?.role === 'admin' || profile?.role === 'administrator' || profile?.role === 'registrar') {
    return { ok: true as const, userId: userData.user.id as string };
  }
  const { data: merged } = await supabase.rpc('get_user_merged_permissions', { p_user_id: userData.user.id });
  if (merged && typeof merged === 'object' && merged['audit.external_auditor.manage'] === true) {
    return { ok: true as const, userId: userData.user.id as string };
  }
  return { ok: false as const, status: 403, error: 'Forbidden' };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id: userId } = await params;
    const supabase = await createServerSupabaseClient();
    const guard = await requireManagePermission(supabase);
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const body = await request.json().catch(() => ({}));
    const extendDays = Math.max(1, Math.min(90, Number(body?.extend_days ?? 7)));

    // Find current rows.
    const { data: rows, error: readErr } = await (supabase as any)
      .from('user_institution_access')
      .select('id, expires_at, is_active')
      .eq('user_id', userId);
    if (readErr) throw readErr;
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'No access records found for this user' }, { status: 404 });
    }

    const now = Date.now();
    let updated = 0;
    let missingColumn = false;
    for (const row of rows as Array<{ id: string; expires_at: string | null; is_active: boolean }>) {
      const base = row.expires_at && new Date(row.expires_at).getTime() > now
        ? new Date(row.expires_at).getTime()
        : now;
      const newExpiry = new Date(base + extendDays * 24 * 60 * 60 * 1000).toISOString();
      const { error: updErr } = await (supabase as any)
        .from('user_institution_access')
        .update({ expires_at: newExpiry, is_active: true })
        .eq('id', row.id);
      if (updErr) {
        if (/expires_at/.test(updErr.message || '')) {
          missingColumn = true;
          // fallback: at least reactivate
          await (supabase as any)
            .from('user_institution_access')
            .update({ is_active: true })
            .eq('id', row.id);
        } else {
          throw updErr;
        }
      }
      updated += 1;
    }
    return NextResponse.json({
      data: { user_id: userId, updated },
      metadata: {
        extend_days: extendDays,
        warning: missingColumn
          ? 'user_institution_access.expires_at column missing on prod — only is_active flipped.'
          : undefined,
      },
    });
  } catch (error) {
    console.error('[audit/external-auditors/:id] PATCH error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id: userId } = await params;
    const supabase = await createServerSupabaseClient();
    const guard = await requireManagePermission(supabase);
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const nowIso = new Date().toISOString();
    const { error: updErr } = await (supabase as any)
      .from('user_institution_access')
      .update({ is_active: false, expires_at: nowIso })
      .eq('user_id', userId);
    if (updErr && /expires_at/.test(updErr.message || '')) {
      // Fallback: is_active only.
      const { error: fb } = await (supabase as any)
        .from('user_institution_access')
        .update({ is_active: false })
        .eq('user_id', userId);
      if (fb) throw fb;
      return NextResponse.json({
        data: { user_id: userId, revoked: true },
        metadata: { warning: 'expires_at column missing — only is_active flipped.' },
      });
    }
    if (updErr) throw updErr;
    return NextResponse.json({ data: { user_id: userId, revoked: true } });
  } catch (error) {
    console.error('[audit/external-auditors/:id] DELETE error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
