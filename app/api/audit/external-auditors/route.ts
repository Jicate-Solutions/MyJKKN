export const dynamic = 'force-dynamic';

// API: /api/audit/external-auditors
// Time-boxed External Auditor admin. Super-admin (or users with
// audit.external_auditor.manage) only. See
// lib/services/audit/audit-external-auditor-service.ts for substrate notes.

import { NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  AuditExternalAuditorService,
  EXTERNAL_AUDITOR_ROLE_KEY,
  type CreateExternalAuditorInput,
  type ExternalAuditorRow,
} from '@/lib/services/audit/audit-external-auditor-service';

// Permission gate helper. Super_admin bypass OR audit.external_auditor.manage
// via merged permissions OR legacy role = registrar.
async function requireManagePermission(supabase: any): Promise<{ ok: true; userId: string } | { ok: false; status: number; error: string }> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) return { ok: false, status: 401, error: 'Unauthorized' };
  const userId = userData.user.id as string;

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_super_admin, role')
    .eq('id', userId)
    .maybeSingle();
  if (profile?.is_super_admin === true) return { ok: true, userId };
  if (profile?.role === 'super_admin' || profile?.role === 'admin' || profile?.role === 'administrator' || profile?.role === 'registrar') {
    return { ok: true, userId };
  }

  // Check merged permissions via get_user_merged_permissions RPC
  const { data: merged } = await supabase.rpc('get_user_merged_permissions', { p_user_id: userId });
  if (merged && typeof merged === 'object' && merged['audit.external_auditor.manage'] === true) {
    return { ok: true, userId };
  }
  return { ok: false, status: 403, error: 'Forbidden: requires super_admin or audit.external_auditor.manage' };
}

export async function GET(_request: Request) {
  await connection();
  try {
    const supabase = await createServerSupabaseClient();
    const guard = await requireManagePermission(supabase);
    if (!guard.ok) {
      const err = guard as { ok: false; status: number; error: string };
      return NextResponse.json({ error: err.error }, { status: err.status });
    }

    // Find all profiles with the external_auditor_timeboxed role (via user_roles).
    const { data: roleRow, error: roleErr } = await supabase
      .from('custom_roles')
      .select('id')
      .eq('role_key', EXTERNAL_AUDITOR_ROLE_KEY)
      .maybeSingle();
    if (roleErr) throw roleErr;
    if (!roleRow) return NextResponse.json({ data: [], metadata: { count: 0, note: 'role not found' } });

    const { data: assignments, error: assignErr } = await (supabase as any)
      .from('user_roles')
      .select('user_id, assigned_at')
      .eq('role_id', (roleRow as { id: string }).id);
    if (assignErr) throw assignErr;

    const userIds = (assignments ?? []).map((a: any) => a.user_id);
    if (userIds.length === 0) return NextResponse.json({ data: [], metadata: { count: 0 } });

    // Pull profiles + institution access in batch.
    const [{ data: profiles }, { data: access }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, email, full_name, is_pre_registered')
        .in('id', userIds),
      (supabase as any)
        .from('user_institution_access')
        .select('id, user_id, institution_id, is_active, granted_at, expires_at, institutions:institution_id(name)')
        .in('user_id', userIds),
    ]);

    const byUser = new Map<string, ExternalAuditorRow>();
    for (const p of (profiles ?? []) as any[]) {
      byUser.set(p.id, {
        access_id: '',
        user_id: p.id,
        email: p.email ?? '',
        full_name: p.full_name ?? null,
        is_pre_registered: !!p.is_pre_registered,
        institution_ids: [],
        institution_names: [],
        granted_at: null,
        expires_at: null,
        is_active: false,
        status: 'revoked',
      });
    }
    for (const row of (access ?? []) as any[]) {
      const bucket = byUser.get(row.user_id);
      if (!bucket) continue;
      bucket.institution_ids.push(row.institution_id);
      bucket.institution_names.push(row?.institutions?.name ?? row.institution_id);
      // Track earliest-expiring, most-recently granted record.
      if (!bucket.access_id) bucket.access_id = row.id;
      if (row.is_active) bucket.is_active = true;
      if (row.granted_at && (!bucket.granted_at || row.granted_at > bucket.granted_at)) {
        bucket.granted_at = row.granted_at;
      }
      if (row.expires_at && (!bucket.expires_at || row.expires_at < bucket.expires_at)) {
        bucket.expires_at = row.expires_at;
      }
    }
    const rows = Array.from(byUser.values()).map((r) => ({
      ...r,
      status: AuditExternalAuditorService.computeStatus(r.is_active, r.expires_at),
    }));
    return NextResponse.json({ data: rows, metadata: { count: rows.length } });
  } catch (error) {
    console.error('[audit/external-auditors] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  await connection();
  try {
    const supabase = await createServerSupabaseClient();
    const guard = await requireManagePermission(supabase);
    if (!guard.ok) {
      const err = guard as { ok: false; status: number; error: string };
      return NextResponse.json({ error: err.error }, { status: err.status });
    }

    const body = (await request.json()) as CreateExternalAuditorInput;
    if (!body?.email || !body?.expires_at || !Array.isArray(body.institution_ids) || body.institution_ids.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: email, expires_at, institution_ids[]' },
        { status: 400 }
      );
    }
    const expiresDate = new Date(body.expires_at);
    if (isNaN(expiresDate.getTime()) || expiresDate.getTime() <= Date.now()) {
      return NextResponse.json({ error: 'expires_at must be a valid future timestamp' }, { status: 400 });
    }

    // Resolve or stage profile for this email.
    const emailLower = body.email.trim().toLowerCase();
    let { data: profile } = await supabase
      .from('profiles')
      .select('id, email, is_pre_registered')
      .eq('email', emailLower)
      .maybeSingle();

    if (!profile) {
      // Stage a pre-registered profile. profiles.id is the PK; we use a fresh UUID
      // via crypto (Next.js runtime). When the auditor completes OAuth signup,
      // an existing trigger reconciles is_pre_registered=false + links auth.users.id.
      const newId = globalThis.crypto.randomUUID();
      const { data: inserted, error: insErr } = await (supabase as any)
        .from('profiles')
        .insert({
          id: newId,
          email: emailLower,
          full_name: emailLower.split('@')[0],
          role: 'guest',
          is_pre_registered: true,
        })
        .select('id, email, is_pre_registered')
        .single();
      if (insErr) {
        // The chk_role_not_guest constraint may reject 'guest'; fall back to 'faculty'
        // (minimum-privilege role; the actual authority comes from user_roles).
        const { data: fallback, error: fbErr } = await (supabase as any)
          .from('profiles')
          .insert({
            id: newId,
            email: emailLower,
            full_name: emailLower.split('@')[0],
            role: 'faculty',
            is_pre_registered: true,
          })
          .select('id, email, is_pre_registered')
          .single();
        if (fbErr) throw fbErr;
        profile = fallback;
      } else {
        profile = inserted;
      }
    }

    if (!profile) throw new Error('Unable to resolve or stage profile');
    const userId = (profile as { id: string }).id;

    // Resolve role id + assign via user_roles (idempotent).
    const { data: roleRow, error: roleErr } = await supabase
      .from('custom_roles')
      .select('id')
      .eq('role_key', EXTERNAL_AUDITOR_ROLE_KEY)
      .maybeSingle();
    if (roleErr) throw roleErr;
    if (!roleRow) throw new Error(`Role '${EXTERNAL_AUDITOR_ROLE_KEY}' missing — apply audit Sprint 01 seed migration`);
    const roleId = (roleRow as { id: string }).id;

    const { error: urErr } = await (supabase as any)
      .from('user_roles')
      .upsert(
        { user_id: userId, role_id: roleId, is_primary: false, assigned_by: guard.userId },
        { onConflict: 'user_id,role_id', ignoreDuplicates: true }
      );
    if (urErr) throw urErr;

    // Insert user_institution_access rows per institution.
    const accessRows = body.institution_ids.map((iid) => ({
      user_id: userId,
      institution_id: iid,
      access_type: 'read_only',
      granted_by: guard.userId,
      is_active: true,
      expires_at: expiresDate.toISOString(),
    }));
    const { error: accessErr } = await (supabase as any)
      .from('user_institution_access')
      .upsert(accessRows, { onConflict: 'user_id,institution_id', ignoreDuplicates: false });
    if (accessErr) {
      // If schema lacks expires_at, retry without — columns would need DDL.
      if (/expires_at/.test(accessErr.message || '')) {
        const { error: retryErr } = await (supabase as any)
          .from('user_institution_access')
          .upsert(
            accessRows.map(({ expires_at: _drop, ...rest }) => rest),
            { onConflict: 'user_id,institution_id', ignoreDuplicates: false }
          );
        if (retryErr) throw retryErr;
        return NextResponse.json(
          {
            data: { user_id: userId, expires_at: null },
            metadata: {
              created: true,
              warning:
                'user_institution_access.expires_at column missing on prod — time-box not enforced. Add column via migration before go-live.',
            },
          },
          { status: 201 }
        );
      }
      throw accessErr;
    }

    return NextResponse.json(
      { data: { user_id: userId, expires_at: expiresDate.toISOString() }, metadata: { created: true } },
      { status: 201 }
    );
  } catch (error) {
    console.error('[audit/external-auditors] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
