export const dynamic = 'force-dynamic';

// POST /api/users/roles/create-scoped — create a dedicated role that grants ONLY
// the given permission key(s). This is how you grant scoped access in a
// role-based system: e.g. an "ID Card Manager" role holding just
// { "id_cards.jobs.manage": true }, which can then be assigned to a user
// (via /api/users/roles/assign) WITHOUT the over-grant of handing them a broad
// existing role or super_admin.
//
// Server-side + service-role for the same reason as the assign endpoint: an
// explicit roles.create gate here, and the custom_roles insert bypasses any
// RLS admin/administrator spelling mismatch.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return s || 'scoped_role';
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      roleName?: string;
      permKeys?: string[];
    };
    const roleName = (body.roleName || '').trim();
    const permKeys = Array.isArray(body.permKeys)
      ? body.permKeys.filter((k) => typeof k === 'string' && k.length > 0)
      : [];
    if (!roleName || permKeys.length === 0) {
      return NextResponse.json(
        { error: 'roleName and at least one permKey are required' },
        { status: 400 }
      );
    }

    // ── Gate: roles.create (primary-role permission lookup + super_admin bypass) ──
    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    let allowed = callerProfile?.role === 'super_admin';
    if (!allowed && callerProfile?.role) {
      const { data: callerRole } = await supabase
        .from('custom_roles')
        .select('permissions')
        .eq('role_key', callerProfile.role)
        .single();
      allowed =
        (callerRole?.permissions as Record<string, unknown> | null)?.[
          'roles.create'
        ] === true;
    }
    if (!allowed) {
      return NextResponse.json(
        { error: 'You do not have permission to create roles (roles.create required).' },
        { status: 403 }
      );
    }

    const admin = createServiceRoleClient();

    // Derive a unique role_key from the name.
    const base = slugify(roleName);
    let roleKey = base;
    for (let i = 1; i < 50; i++) {
      const { data: existing } = await admin
        .from('custom_roles')
        .select('id')
        .eq('role_key', roleKey)
        .maybeSingle();
      if (!existing) break;
      roleKey = `${base}_${i}`;
    }

    const permissions: Record<string, boolean> = {};
    for (const k of permKeys) permissions[k] = true;

    const { data: created, error: insErr } = await admin
      .from('custom_roles')
      .insert({
        role_key: roleKey,
        role_name: roleName,
        description: `Scoped role — grants only: ${permKeys.join(', ')}`,
        permissions,
        is_system_role: false,
        institution_scope: 'own',
        is_active: true,
        created_by: user.id
      })
      .select('id, role_key, role_name')
      .single();

    if (insErr || !created) {
      console.error('[roles/create-scoped] insert error:', insErr);
      return NextResponse.json({ error: 'Failed to create role' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      roleKey: (created as { role_key: string }).role_key,
      roleName: (created as { role_name: string }).role_name,
      permKeys
    });
  } catch (error) {
    console.error('[roles/create-scoped] error:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Internal server error' },
      { status: 500 }
    );
  }
}
