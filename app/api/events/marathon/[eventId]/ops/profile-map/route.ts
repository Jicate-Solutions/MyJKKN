// API route: GET /api/events/marathon/[eventId]/ops/profile-map
// Returns enriched profile data (institution, department, semester) for all
// registrations in a marathon event. Uses service role to bypass RLS so that
// committee members of any role (including students) see all institutions.
//
// Auth: requires authenticated user who is either admin, institution staff,
//       or a committee member for this event.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, getAuthUser } from '@/lib/supabase/server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { eventId } = await params;
  if (!eventId) {
    return NextResponse.json({ error: 'Missing eventId' }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  // Verify the user has access: admin, institution role, or committee member
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, institution_id, full_name')
    .eq('id', user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 403 });
  }

  const adminRoles = ['super_admin', 'admin', 'administrator', 'event_coordinator'];
  const institutionRoles = ['principal', 'hod', 'faculty', 'vice_principal', 'dean'];
  const isAdmin = adminRoles.includes(profile.role);
  const isInstitutionRole = institutionRoles.includes(profile.role);

  if (!isAdmin && !isInstitutionRole) {
    // Check committee membership for non-admin/non-institution roles (e.g., students)
    const { data: committees } = await supabase
      .from('marathon_committees')
      .select('id, lead_id, lead_name, member_ids, member_names')
      .eq('event_id', eventId);

    const isMember = (committees ?? []).some((c: any) => {
      if (c.lead_id === user.id) return true;
      if (profile.full_name && c.lead_name === profile.full_name) return true;
      const memberIds: string[] = Array.isArray(c.member_ids) ? c.member_ids : [];
      if (memberIds.includes(user.id)) return true;
      const memberNames: string[] = Array.isArray(c.member_names) ? c.member_names : [];
      if (profile.full_name && memberNames.includes(profile.full_name)) return true;
      return false;
    });

    if (!isMember) {
      return NextResponse.json({ error: 'Not a committee member' }, { status: 403 });
    }
  }

  // Fetch profiles with institution data (service role bypasses RLS)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, learner_id, institution:institutions(id, name)')
    .not('email', 'is', null)
    .not('institution_id', 'is', null);

  // Fetch learner profiles with department & semester
  const { data: learners } = await supabase
    .from('learners_profiles')
    .select('id, department:departments(id, department_name), semester:semesters(id, semester_name)');

  const learnerLookup = new Map<string, {
    dept_id: string | null; dept_name: string | null;
    sem_id: string | null; sem_name: string | null;
  }>();
  for (const l of learners ?? []) {
    learnerLookup.set(l.id, {
      dept_id: (l.department as any)?.id ?? null,
      dept_name: (l.department as any)?.department_name ?? null,
      sem_id: (l.semester as any)?.id ?? null,
      sem_name: (l.semester as any)?.semester_name ?? null,
    });
  }

  // Build email → enrichment map
  const map: Record<string, {
    institution_id: string; institution_name: string;
    department_id: string | null; department_name: string | null;
    semester_id: string | null; semester_name: string | null;
  }> = {};

  for (const p of profiles ?? []) {
    if (!p.email || !(p.institution as any)?.id) continue;
    const learner = p.learner_id ? learnerLookup.get(p.learner_id) : null;
    map[p.email.toLowerCase()] = {
      institution_id: (p.institution as any).id,
      institution_name: (p.institution as any).name,
      department_id: learner?.dept_id ?? null,
      department_name: learner?.dept_name ?? null,
      semester_id: learner?.sem_id ?? null,
      semester_name: learner?.sem_name ?? null,
    };
  }

  return NextResponse.json(map);
}
