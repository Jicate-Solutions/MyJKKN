export const dynamic = 'force-dynamic';

// ============================================================================
// GET /api/hr/recruitment/taggable-people?q=<search>
//
// Who can be tagged on a recruitment candidate's discussion.
//
// ── Why this exists instead of the events member-directory ─────────────────
// The tag pickers for events and room bookings read the `staff` table, which is
// right for them: those threads are about one campus's team. Recruitment is
// not, and more importantly A TAG TARGETS A PROFILE, not a staff record — the
// notification goes to profiles.id and the guard trigger on
// hr_recruitment_comment_mentions checks `profiles` (active, non-learner role).
//
// Searching `staff` therefore disagreed with the rule that authorises the tag.
// Measured on production 2026-09-24: of 699 active non-learner profiles, 62 had
// no staff row and so could never be offered — 16 faculty, 8 HODs, 5 super
// admins, among them Ommsharravana S (director@jkkn.ac.in). Someone reported it
// the obvious way: "there is a name Ommsaravana, why does it say no match".
//
// So this route searches PROFILES — the same set the trigger admits — and
// merely decorates each hit with staff designation/department when a staff row
// happens to exist. The picker and the database now answer the same question.
//
// ── Disclosure ─────────────────────────────────────────────────────────────
// Any signed-in user may search, and only name, email and designation come
// back — the same shape and posture as the events member-directory, which is
// also open to any signed-in user. The thread this feeds is itself gated
// (hr.recruitment.view on the candidate page), and a tag grants nothing.
// ============================================================================

import { NextResponse, connection, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { CookieOptions } from '@supabase/ssr';
import { createServiceRoleClient } from '@/lib/supabase/server';

/** Learner-side roles, mirroring the mention guard trigger exactly. */
const LEARNER_ROLES = ['student', 'course_participant', 'parent'];
const LIMIT = 30;

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

/** profiles.role is a snake_case key; render it as words for the subtitle. */
function roleLabel(role: string | null): string {
  if (!role) return '';
  return role
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export async function GET(request: NextRequest) {
  await connection();

  const supabase = await getClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Same sanitising as the events directory: '@' and '.' survive so an address
  // can be typed, everything that could alter PostgREST filter syntax does not.
  const q = (request.nextUrl.searchParams.get('q') ?? '')
    .replace(/[^A-Za-z0-9 @._/-]/g, '')
    .trim()
    .slice(0, 60);

  // Browsing the whole directory is not a feature — a search term is required.
  if (q.length < 2) return NextResponse.json({ results: [] });

  try {
    const svc = createServiceRoleClient();

    const { data: profiles, error } = await (svc as any)
      .from('profiles')
      .select('id, full_name, email, role')
      .eq('is_active', true)
      .not('role', 'in', `(${LEARNER_ROLES.join(',')})`)
      .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
      .order('full_name', { ascending: true })
      .limit(LIMIT);
    if (error) throw error;

    const rows = (profiles ?? []) as {
      id: string; full_name: string | null; email: string | null; role: string | null;
    }[];
    if (rows.length === 0) return NextResponse.json({ results: [] });

    // Decoration only — a profile with no staff row is still taggable, it just
    // shows its role instead of a designation.
    const { data: staffRows } = await (svc as any)
      .from('staff')
      .select('profile_id, designation, department:departments(department_name), institution:institutions!staff_institution_id_fkey(name)')
      .in('profile_id', rows.map((r) => r.id));

    const staffByProfile = new Map<string, any>(
      ((staffRows ?? []) as any[]).map((s) => [s.profile_id, s]),
    );

    const results = rows.map((p) => {
      const s = staffByProfile.get(p.id);
      const subtitle = s
        ? [s.designation, s.department?.department_name, s.institution?.name]
            .filter(Boolean)
            .join(' · ')
        : roleLabel(p.role);
      return {
        id: p.id,
        name: p.full_name?.trim() || p.email || 'Unnamed',
        email: p.email,
        subtitle: subtitle || null,
      };
    });

    return NextResponse.json({ results });
  } catch (err) {
    console.error('[hr/recruitment/taggable-people] GET error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
