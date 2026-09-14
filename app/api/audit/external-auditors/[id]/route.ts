export const dynamic = 'force-dynamic';

// API: /api/audit/external-auditors/[id]
//   - PATCH  : extend expiry by N days (default 7, clamped 1..90) across every
//              access row this user holds, via fn_extend_institution_access.
//              Body: { extend_days?: number }. Returns the real row count.
//   - DELETE : immediate revoke — DELETES every row, via
//              revoke_all_user_institution_access. Returns the real count.
//   [id] is the profiles.id (user_id), not user_institution_access.id.
//
// BOTH verbs go through a SECURITY DEFINER RPC, for the same two reasons.
// withAuth hands us the CALLER'S RLS-scoped client, and
// user_institution_access has no UPDATE/DELETE policy for `authenticated` and
// no SELECT policy for other people's rows — so a direct write matched zero
// rows, which PostgREST does not treat as an error, and both handlers reported
// success regardless. And neither verb is a flag: expiry and revoke both
// DELETE, because 38 RLS policies across 31 tables read this table without
// consulting is_active and would not consult expires_at either.
// See migrations 20261201120000 (revoke) and 20261201130000 (expiry).
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
    const parsedDays = Number(body?.extend_days ?? 7);
    const extendDays = Number.isFinite(parsedDays)
      ? Math.max(1, Math.min(90, Math.trunc(parsedDays)))
      : 7;

    // One RPC call, one truthful number. The row-by-row read-then-update loop
    // this replaces could not work: the read had no SELECT policy for another
    // person's rows (404 every time), the update named a column that did not
    // exist, and `updated += 1` ran whether or not anything changed.
    // fn_extend_institution_access clamps the days again server-side and
    // returns ROW_COUNT.
    const { data: extended, error: rpcErr } = await (supabase as any).rpc(
      'fn_extend_institution_access',
      { target_user_id: userId, extend_days: extendDays }
    );
    if (rpcErr) throw rpcErr;

    // `extended: 0` is a real answer — this person holds no cross-institution
    // grants — and is more useful than the 404 this endpoint used to return
    // for every caller. Shaped to match the DELETE handler's count.
    return NextResponse.json({
      data: { user_id: userId, extended: Number(extended ?? 0) },
      metadata: { extend_days: extendDays },
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

    // Offboarding an external auditor goes through revoke_all_user_institution_access
    // (SECURITY DEFINER) rather than writing to user_institution_access directly.
    // Two reasons, both load-bearing:
    //
    //   1. The direct write could never have worked. withAuth hands us the
    //      CALLER'S RLS-scoped client ("never uses SERVICE_ROLE_KEY for data
    //      queries"), and user_institution_access has no UPDATE/DELETE policy
    //      for `authenticated` and no SELECT policy for other people's rows.
    //      The old update matched zero rows, PostgREST does not treat that as
    //      an error, and this endpoint returned {revoked: true} regardless.
    //
    //   2. Even had it worked, flipping is_active is not a revoke: 38 RLS
    //      policies across 31 tables (all of Internship, WhatsApp automation,
    //      LTI, off-days, both leave-approval tables) read this table without
    //      consulting is_active. The RPC deletes the rows, so there is nothing
    //      left for a policy to miss.
    //
    // The delete is recorded in role_audit_log by trg_log_institution_access_change.
    const { data: removed, error: rpcErr } = await (supabase as any).rpc(
      'revoke_all_user_institution_access',
      { target_user_id: userId }
    );
    if (rpcErr) throw rpcErr;

    // Report what actually happened. `revoked: 0` is a real answer — it means
    // the auditor held no cross-institution grants — and is far more useful
    // than the unconditional `revoked: true` this endpoint used to return.
    return NextResponse.json({
      data: { user_id: userId, revoked: true, grants_removed: removed ?? 0 },
    });
  } catch (error) {
    console.error('[audit/external-auditors/:id] DELETE error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}, { allowApiKey: false, requirePermission: 'audit.external_auditor.manage' });
