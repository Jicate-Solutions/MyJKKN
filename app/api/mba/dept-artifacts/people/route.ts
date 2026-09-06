// app/api/mba/dept-artifacts/people/route.ts
// GET ?area_id=<uuid>&q=<search> — real MyJKKN people who can hold an organogram
// role, to fill in the department playbook's "who holds it" field.
//
// The holder is stored as hr_additional_roles.staff_id, so this returns team
// member records (public.staff) — NOT every profile. That is deliberate: an
// organogram role is an operational responsibility and a learner must never be
// offered as a holder. Every associate posted to an area is a learner today, so
// they surface here only when they also have a team member record.
//
// Personal data: the improvement.board.manage gate below is load-bearing, and a
// bare listing is never returned — the directory search needs a real search term.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

/** Minimum characters before the directory is searched at all. */
const MIN_QUERY = 3;
/** Cap on directory matches, and on the whole response. */
const SEARCH_LIMIT = 25;
const MAX_RESULTS = 30;

export interface AreaPerson {
  /** public.staff id — the value stored against the role. */
  staff_id: string;
  /** Linked login account, when the team member has one. */
  user_id: string | null;
  name: string | null;
  email: string | null;
  designation: string | null;
  source: 'posted_associate' | 'me' | 'directory';
}

interface TeamMemberRow {
  id: string;
  profile_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  designation: string | null;
}

const COLUMNS = 'id, profile_id, first_name, last_name, email, designation';

function fullName(row: TeamMemberRow): string | null {
  const name = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
  return name || null;
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

    // Manager-only: the edit form this feeds is a manager surface, and the
    // response is personal data.
    const { data: canManage } = await supabase.rpc('user_has_permission', {
      permission_name: 'improvement.board.manage',
    });
    if (canManage !== true) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const areaId = request.nextUrl.searchParams.get('area_id');
    if (!areaId) {
      return NextResponse.json({ error: 'area_id is required' }, { status: 400 });
    }
    const q = sanitize(request.nextUrl.searchParams.get('q') ?? '');

    const admin = createServiceRoleClient();
    const people: AreaPerson[] = [];
    const seen = new Set<string>();

    const push = (row: TeamMemberRow, source: AreaPerson['source']) => {
      if (seen.has(row.id) || people.length >= MAX_RESULTS) return;
      seen.add(row.id);
      people.push({
        staff_id: row.id,
        user_id: row.profile_id,
        name: fullName(row),
        email: row.email,
        designation: row.designation,
        source,
      });
    };

    // 1) Preferred: people already connected to this area (associates posted to
    //    it, plus the caller) — filtered through the team member table, so this
    //    can never offer a learner as a role holder.
    const { data: postings } = await admin
      .from('mba_associate_postings')
      .select('associate_user_id')
      .eq('area_id', areaId);

    const profileIds = Array.from(
      new Set([...(postings ?? []).map((p) => p.associate_user_id), user.id].filter(Boolean)),
    ) as string[];

    if (profileIds.length > 0) {
      const { data: connected, error: connectedError } = await admin
        .from('staff')
        .select(COLUMNS)
        .in('profile_id', profileIds)
        .eq('is_active', true);
      if (connectedError) {
        console.error('[GET /api/mba/dept-artifacts/people] Connected lookup:', connectedError);
      }
      for (const row of (connected ?? []) as TeamMemberRow[]) {
        push(row, row.profile_id === user.id ? 'me' : 'posted_associate');
      }
    }

    // 2) Directory search — only with a real search term, never a bulk listing.
    if (q.length >= MIN_QUERY) {
      const like = `%${q}%`;
      const { data: matches, error: searchError } = await admin
        .from('staff')
        .select(COLUMNS)
        .eq('is_active', true)
        .or(`first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like}`)
        .order('first_name', { ascending: true })
        .limit(SEARCH_LIMIT);
      if (searchError) {
        console.error('[GET /api/mba/dept-artifacts/people] Search:', searchError);
        return NextResponse.json({ error: 'Search failed' }, { status: 500 });
      }
      for (const row of (matches ?? []) as TeamMemberRow[]) push(row, 'directory');

      // "Firstname Lastname" matches neither column on its own — try the split.
      const tokens = q.split(' ').filter(Boolean);
      if (tokens.length > 1 && people.length < MAX_RESULTS) {
        const { data: pairs } = await admin
          .from('staff')
          .select(COLUMNS)
          .eq('is_active', true)
          .ilike('first_name', `%${tokens[0]}%`)
          .ilike('last_name', `%${tokens[tokens.length - 1]}%`)
          .limit(SEARCH_LIMIT);
        for (const row of (pairs ?? []) as TeamMemberRow[]) push(row, 'directory');
      }
    }

    return NextResponse.json({
      people,
      // Lets the picker say "keep typing" instead of showing a misleading empty.
      needs_query: q.length < MIN_QUERY,
      min_query: MIN_QUERY,
    });
  } catch (error) {
    console.error('[GET /api/mba/dept-artifacts/people] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
