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
type ProfileRow = { id: string; full_name: string | null; email: string | null; is_super_admin: boolean | null };

/** A name search is a type-ahead. */
const TYPE_AHEAD = 20;
/** Browsing the learner role (7,000+ holders) lists this many, alphabetically;
 *  its name search still finds anyone. Every other role is listed in full. */
const LEARNER_ROLE_KEY = 'student';
const LEARNER_BROWSE_CAP = 1000;
/** Name matches examined before the role filter. */
const NAME_MATCH_POOL = 1000;
/** Membership rows per page. */
const PAGE = 1000;
/** Ids per .in() — keeps the PostgREST URL well under its length limit. */
const IN_CHUNK = 150;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

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

    // Eligibility (same as fn_seed_application_approvals, #4062): a step pinned
    // to a deactivated or login-disabled account strands every request routed
    // to it, so such accounts are never offered.
    const eligibleProfiles = () =>
      admin
        .from('profiles')
        .select('id, full_name, email, is_super_admin')
        .eq('is_active', true)
        .eq('is_login_disabled', false)
        .order('full_name', { ascending: true });
    const nameFilter = `full_name.ilike.%${search}%,email.ilike.%${search}%`;

    let rows: ProfileRow[] = [];

    if (roleKey === 'super_admin') {
      let q = eligibleProfiles().eq('is_super_admin', true);
      if (search) q = q.or(nameFilter);
      const { data, error } = await q;
      if (error) throw error;
      rows = (data ?? []) as ProfileRow[];
    } else if (roleKey && roleKey !== 'all') {
      // Resolve role → role ids (case-insensitive role_key match).
      const { data: roleRows, error: roleErr } = await admin
        .from('custom_roles')
        .select('id')
        .ilike('role_key', roleKey);
      if (roleErr) throw roleErr;
      const roleIds = (roleRows ?? []).map((r) => r.id);
      if (roleIds.length === 0) return NextResponse.json({ data: [] });

      if (search) {
        // Name first, role second: a role with thousands of holders can never
        // hide anyone from a name search (the old holder lookup stopped at 500
        // memberships BEFORE the name was applied).
        const { data: matches, error: matchErr } = await eligibleProfiles()
          .or(nameFilter)
          .limit(NAME_MATCH_POOL);
        if (matchErr) throw matchErr;
        const matchRows = (matches ?? []) as ProfileRow[];
        if (matchRows.length === 0) return NextResponse.json({ data: [] });
        const heldIds = new Set<string>();
        for (const ids of chunk(matchRows.map((m) => m.id), IN_CHUNK)) {
          const { data: held, error: heldErr } = await admin
            .from('user_roles')
            .select('user_id')
            .in('role_id', roleIds)
            .in('user_id', ids);
          if (heldErr) throw heldErr;
          for (const h of held ?? []) heldIds.add(h.user_id);
        }
        rows = matchRows.filter((m) => heldIds.has(m.id)).slice(0, TYPE_AHEAD);
      } else {
        // Browsing a role lists its holders — every one, paged (BUG-004395: a
        // blanket cap of 20 showed 20 of 99 HODs). Only the learner role is
        // cut, alphabetically; its name search finds anyone.
        const holderIds = new Set<string>();
        for (let from = 0; ; from += PAGE) {
          const { data: page, error: pageErr } = await admin
            .from('user_roles')
            .select('user_id')
            .in('role_id', roleIds)
            .order('user_id', { ascending: true })
            .range(from, from + PAGE - 1);
          if (pageErr) throw pageErr;
          for (const r of page ?? []) holderIds.add(r.user_id);
          if (!page || page.length < PAGE) break;
        }
        if (holderIds.size === 0) return NextResponse.json({ data: [] });
        const found: ProfileRow[] = [];
        for (const ids of chunk([...holderIds], IN_CHUNK)) {
          const { data, error } = await eligibleProfiles().in('id', ids);
          if (error) throw error;
          found.push(...((data ?? []) as ProfileRow[]));
        }
        found.sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? ''));
        rows = roleKey === LEARNER_ROLE_KEY ? found.slice(0, LEARNER_BROWSE_CAP) : found;
      }
    } else {
      // Unfiltered directory search — require a real term so we never dump
      // the whole profiles table into the popover.
      if (search.length < 2) return NextResponse.json({ data: [] });
      const { data, error } = await eligibleProfiles().or(nameFilter).limit(TYPE_AHEAD);
      if (error) throw error;
      rows = (data ?? []) as ProfileRow[];
    }
    if (rows.length === 0) return NextResponse.json({ data: [] });

    // Role badges for the result set (one query).
    const badgeRows: unknown[] = [];
    for (const ids of chunk(rows.map((r) => r.id), IN_CHUNK)) {
      const { data } = await admin
        .from('user_roles')
        .select('user_id, custom_roles!inner(role_key)')
        .in('user_id', ids);
      badgeRows.push(...(data ?? []));
    }
    const rolesByUser = new Map<string, string[]>();
    for (const b of badgeRows as Array<{
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
