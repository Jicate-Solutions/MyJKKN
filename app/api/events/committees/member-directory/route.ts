export const dynamic = 'force-dynamic';

// GET /api/events/committees/member-directory
//   ?role=staff|student&q=<search>&institution_id=&degree_id=&department_id=&program_id=&semester_id=
//
// MyJKKN user directory for the shared event-committee "Add Members" picker
// (components/events/shared/member-picker-dialog.tsx). Committees may include
// any JKKN staff member or current (active) student; free-text member entry is
// reserved for external guests.
//
// Security (mirrors /api/events/tournament/learner-search):
//   - requires a logged-in user (same gate as the event-agnostic committees
//     write route — committee management spans every event type, so there is no
//     single module permission to check).
//   - reads staff / learners_profiles via the service-role client (organizer
//     roles often don't hold staff.*/learners.* read perms), then RE-IMPOSES
//     institution scope with createApiInstitutionFilter, so non-bypass roles
//     only ever see their own institution's people.
//   - requires a search term (≥2 chars) OR an institution filter — never dumps
//     the whole directory. Returns at most 50 rows of directory-level fields
//     (name, designation/program, institutional email).

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import {
  createApiInstitutionFilter,
  applyInstitutionFilterToQuery,
} from '@/lib/auth/api-institution-filter';

export interface MemberDirectoryHit {
  /** Source-row id (staff.id / learners_profiles.id). */
  id: string;
  /** Value to store in event_committees.member_ids — staff profile_id when linked. */
  member_id: string;
  name: string;
  email: string | null;
  subtitle: string;
  role: 'staff' | 'student';
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { user, error: authError } = await getAuthUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const role = params.get('role') === 'student' ? 'student' : 'staff';
  // '@' allowed so people are findable by email; safe inside PostgREST .or().
  const q = (params.get('q') ?? '').replace(/[^A-Za-z0-9 @._/-]/g, '').trim().slice(0, 60);
  const institutionId = params.get('institution_id') || null;
  const degreeId = params.get('degree_id') || null;
  const departmentId = params.get('department_id') || null;
  const programId = params.get('program_id') || null;
  const semesterId = params.get('semester_id') || null;

  // Browsing requires SOME narrowing — a search term or an institution.
  if (q.length < 2 && !institutionId) {
    return NextResponse.json({ results: [] }, { status: 200 });
  }

  const filter = await createApiInstitutionFilter(request);
  if (!filter.isAllowed) {
    return NextResponse.json(
      { error: filter.reason || 'Institution access denied' },
      { status: 403 }
    );
  }

  try {
    const svc = createServiceRoleClient();
    let results: MemberDirectoryHit[] = [];

    if (role === 'staff') {
      let query = (svc as any)
        .from('staff')
        .select(
          'id, profile_id, first_name, last_name, designation, institution_email, department:departments(department_name), institution:institutions(name)'
        )
        .eq('is_active', true);
      if (institutionId) query = query.eq('institution_id', institutionId);
      if (departmentId) query = query.eq('department_id', departmentId);
      if (q.length >= 2) {
        query = query.or(
          `first_name.ilike.%${q}%,last_name.ilike.%${q}%,institution_email.ilike.%${q}%`
        );
      }
      query = applyInstitutionFilterToQuery(query, filter);
      const { data, error } = await query.order('first_name', { ascending: true }).limit(50);
      if (error) throw error;

      results = ((data ?? []) as any[]).map((s) => ({
        id: s.id,
        member_id: s.profile_id ?? s.id,
        name: `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim(),
        email: s.institution_email ?? null,
        subtitle: [s.designation, s.department?.department_name, s.institution?.name]
          .filter(Boolean)
          .join(' · '),
        role: 'staff' as const,
      }));
    } else {
      let query = (svc as any)
        .from('learners_profiles')
        .select(
          'id, first_name, last_name, register_number, college_email, department:departments(department_name), program:programs(program_name), institution:institutions(name)'
        )
        // Current students only — same rule as tournament participants.
        .eq('lifecycle_status', 'active');
      if (institutionId) query = query.eq('institution_id', institutionId);
      if (degreeId) query = query.eq('degree_id', degreeId);
      if (departmentId) query = query.eq('department_id', departmentId);
      if (programId) query = query.eq('program_id', programId);
      if (semesterId) query = query.eq('semester_id', semesterId);
      if (q.length >= 2) {
        query = query.or(
          `first_name.ilike.%${q}%,last_name.ilike.%${q}%,register_number.ilike.%${q}%,college_email.ilike.%${q}%`
        );
      }
      query = applyInstitutionFilterToQuery(query, filter);
      const { data, error } = await query.order('first_name', { ascending: true }).limit(50);
      if (error) throw error;

      results = ((data ?? []) as any[]).map((l) => ({
        id: l.id,
        member_id: l.id,
        name: `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim(),
        email: l.college_email ?? null,
        subtitle: [l.register_number, l.program?.program_name, l.department?.department_name]
          .filter(Boolean)
          .join(' · '),
        role: 'student' as const,
      }));
    }

    return NextResponse.json(
      { results },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err: any) {
    console.error('[committees/member-directory] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Failed to search directory' }, { status: 500 });
  }
}
