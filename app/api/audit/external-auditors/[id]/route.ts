export const dynamic = 'force-dynamic';

// API: /api/audit/external-auditors/[id]
//   - PATCH  : extend expiry by N days (default 7) across all access rows for this user.
//              Body: { extend_days?: number }
//   - DELETE : immediate revoke — set is_active=false + expires_at=now() on all rows.
//   [id] is the profiles.id (user_id), not user_institution_access.id.
//
// Permission gate is delegated to withAuth({ requirePermission:
// 'audit.external_auditor.manage' }) — the wrapper triad covers super_admin
// + is_admin + user_has_permission. Legacy 'registrar' hardcode and the
// get_user_merged_permissions RPC fallback are retired; users who need to
// manage external auditors must be granted audit.external_auditor.manage
// via Role Management UI.

import { NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';

export const PATCH = withAuth(async (request, auth, context) => {
  await connection();
  try {
    const params = (await context?.params) as { id?: string } | undefined;
    const userId = params?.id;
    if (!userId) {
      return NextResponse.json({ error: 'user id is required' }, { status: 400 });
    }
    const supabase = auth.supabase;

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
}, { allowApiKey: false, requirePermission: 'audit.external_auditor.manage' });

export const DELETE = withAuth(async (_request, auth, context) => {
  await connection();
  try {
    const params = (await context?.params) as { id?: string } | undefined;
    const userId = params?.id;
    if (!userId) {
      return NextResponse.json({ error: 'user id is required' }, { status: 400 });
    }
    const supabase = auth.supabase;

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
}, { allowApiKey: false, requirePermission: 'audit.external_auditor.manage' });
