// app/api/improvement/assignable-users/route.ts
// GET ?q=<search> — people an improvement idea can be assigned to.
//
// Feeds the "Assign people" picker on an approved idea. The caller is either a
// board manager or the owner of a department, and most owners hold no
// permission that lets them read public.profiles for other people — so the
// search runs server-side, behind an explicit check of who is asking.
//
// Personal data: never a bare listing. A real search term is required and the
// result is capped, so this cannot be paged into a directory dump. Parent
// accounts are never returned.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

/** Minimum characters before anything is searched. */
const MIN_QUERY = 3;
const SEARCH_LIMIT = 20;

export interface AssignableUser {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
}

/**
 * PostgREST `.or()` treats , ( ) . as syntax, and % _ are LIKE wildcards.
 * Strip them so a stray character cannot alter the filter or widen the match.
 */
function sanitize(term: string): string {
  return term.replace(/[,()."'`*%_\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Who may assign: a board manager, or anyone who owns a department. The
    // RPC that saves the pick re-checks this against the specific idea; this
    // gate only decides who may search for a name at all.
    const [{ data: canManage }, { data: ownedAreas }] = await Promise.all([
      supabase.rpc('user_has_permission', {
        permission_name: 'improvement.board.manage',
      }),
      (supabase as any).rpc('fn_improvement_my_owned_area_ids'),
    ]);
    const ownsAnArea = Array.isArray(ownedAreas) && ownedAreas.length > 0;
    if (canManage !== true && !ownsAnArea) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const q = sanitize(request.nextUrl.searchParams.get('q') ?? '');
    if (q.length < MIN_QUERY) {
      return NextResponse.json({ users: [], needs_query: true, min_query: MIN_QUERY });
    }

    const like = `%${q}%`;
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from('profiles')
      .select('id, full_name, email, role, is_active')
      .or(`full_name.ilike.${like},email.ilike.${like}`)
      .neq('role', 'parent')
      .order('full_name', { ascending: true })
      .limit(SEARCH_LIMIT);

    if (error) {
      console.error('[GET /api/improvement/assignable-users] Search:', error);
      return NextResponse.json({ error: 'Search failed' }, { status: 500 });
    }

    const users: AssignableUser[] = ((data ?? []) as Array<{
      id: string;
      full_name: string | null;
      email: string | null;
      role: string | null;
      is_active: boolean | null;
    }>)
      .filter((p) => p.is_active !== false)
      .map((p) => ({
        id: p.id,
        name: p.full_name?.trim() || null,
        email: p.email,
        role: p.role ? p.role.replace(/_/g, ' ') : null,
      }));

    return NextResponse.json({ users, needs_query: false, min_query: MIN_QUERY });
  } catch (error) {
    console.error('[GET /api/improvement/assignable-users] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
