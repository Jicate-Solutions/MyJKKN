export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { createServiceRoleClient } from '@/lib/supabase/server';

async function getClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) {
          try { cookieStore.set({ name, value, ...options }); } catch {}
        },
        remove(name: string, options: CookieOptions) {
          try { cookieStore.set({ name, value: '', ...options }); } catch {}
        },
      },
    }
  );
}

export interface RoleUserRow {
  id: string;
  full_name: string | null;
  email: string | null;
  is_super_admin: boolean;
  roles: string[];
}

/**
 * GET /api/hr/recruitment/approval-flows/role-users?role_key=&search=
 *
 * People directory for the flow builder's pinned-approver picker.
 * Sourced from profiles + user_roles (NOT the staff table — super admins and
 * other non-staff accounts must be pickable). Uses the service-role client
 * after an explicit permission gate because HR admins cannot read user_roles
 * broadly under RLS; disclosure is limited to name/email/role badges of up
 * to 20 matches — the same information the approver picker legitimately needs.
 *
 * role_key: 'super_admin' → profiles.is_super_admin=true
 *           '<role_key>'  → holders of that custom role
 *           absent/'all'  → free search across all profiles (needs ≥2 chars)
 */
export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await getClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Same gate as flow upsert — this endpoint exists solely for the builder.
    const { data: isSuperAdmin } = await supabase.rpc('is_super_admin');
    if (!isSuperAdmin) {
      const { data: canEdit } = await supabase.rpc('user_has_permission', {
        permission_name: 'hr.recruitment.edit',
      });
      if (!canEdit) {
        return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
      }
    }

    const roleKeyRaw = request.nextUrl.searchParams.get('role_key') ?? 'all';
    const roleKey = roleKeyRaw.trim().toLowerCase();
    const search = (request.nextUrl.searchParams.get('search') ?? '')
      .replace(/[,()"\\:*%]/g, ' ')
      .trim();

    const admin = createServiceRoleClient();

    let profileQuery = admin
      .from('profiles')
      .select('id, full_name, email, is_super_admin')
      .order('full_name', { ascending: true })
      .limit(20);

    if (roleKey === 'super_admin') {
      profileQuery = profileQuery.eq('is_super_admin', true);
    } else if (roleKey && roleKey !== 'all') {
      // Resolve role → holder ids (case-insensitive role_key match).
      const { data: roleRows, error: roleErr } = await admin
        .from('custom_roles')
        .select('id')
        .ilike('role_key', roleKey);
      if (roleErr) throw roleErr;
      const roleIds = (roleRows ?? []).map((r) => r.id);
      if (roleIds.length === 0) return NextResponse.json({ data: [] });

      const { data: holderRows, error: holderErr } = await admin
        .from('user_roles')
        .select('user_id')
        .in('role_id', roleIds)
        .limit(500);
      if (holderErr) throw holderErr;
      const holderIds = Array.from(new Set((holderRows ?? []).map((r) => r.user_id)));
      if (holderIds.length === 0) return NextResponse.json({ data: [] });
      profileQuery = profileQuery.in('id', holderIds);
    } else {
      // Unfiltered directory search — require a real term so we never dump
      // the whole profiles table into the popover.
      if (search.length < 2) return NextResponse.json({ data: [] });
    }

    if (search) {
      profileQuery = profileQuery.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data: profiles, error: profErr } = await profileQuery;
    if (profErr) throw profErr;
    const rows = (profiles ?? []) as Array<{
      id: string; full_name: string | null; email: string | null; is_super_admin: boolean | null;
    }>;
    if (rows.length === 0) return NextResponse.json({ data: [] });

    // Role badges for the result set (one query).
    const ids = rows.map((r) => r.id);
    const { data: badgeRows } = await admin
      .from('user_roles')
      .select('user_id, custom_roles!inner(role_key)')
      .in('user_id', ids);
    const rolesByUser = new Map<string, string[]>();
    for (const b of (badgeRows ?? []) as unknown as Array<{
      user_id: string; custom_roles?: { role_key?: string };
    }>) {
      const key = b.custom_roles?.role_key;
      if (!key) continue;
      const list = rolesByUser.get(b.user_id) ?? [];
      if (!list.includes(key)) list.push(key);
      rolesByUser.set(b.user_id, list);
    }

    const result: RoleUserRow[] = rows.map((r) => ({
      id: r.id,
      full_name: r.full_name,
      email: r.email,
      is_super_admin: !!r.is_super_admin,
      roles: rolesByUser.get(r.id) ?? [],
    }));
    return NextResponse.json({ data: result });
  } catch (err) {
    console.error('[hr/recruitment/approval-flows/role-users] GET error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
