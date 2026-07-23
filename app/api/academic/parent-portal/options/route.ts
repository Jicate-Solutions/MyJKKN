import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/utils/parent-admin-auth';

export const runtime = 'nodejs';

/**
 * GET /api/academic/parent-portal/options?institutionId=&programId=&sectionId=
 * Role-scoped, cascading picklists for the authoring UI:
 *   - institutions: super_admin → ALL; other staff → their OWN institution only
 *   - programs:  for the chosen institution
 *   - sections:  for the chosen institution (filtered by program when given)
 *   - learners:  for the chosen section
 */
export async function GET(req: NextRequest) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = createServiceRoleClient();
  const url = new URL(req.url);
  const institutionId = url.searchParams.get('institutionId');
  const csv = (k: string) => (url.searchParams.get(k) || '').split(',').filter(Boolean);
  const programIds = csv('programIds');
  const sectionIds = csv('sectionIds');

  // Institutions — scoped by role.
  let institutions: Array<{ id: string; name: string; entity_type: string }> = [];
  if (staff.role === 'super_admin') {
    const { data } = await db.from('institutions').select('id, name, entity_type').order('name');
    institutions = (data as unknown as typeof institutions) ?? [];
  } else {
    const { data: profile } = await db
      .from('profiles')
      .select('institution_id')
      .eq('id', staff.id)
      .maybeSingle();
    const ownId = (profile as unknown as { institution_id: string | null } | null)?.institution_id;
    if (ownId) {
      const { data } = await db
        .from('institutions')
        .select('id, name, entity_type')
        .eq('id', ownId);
      institutions = (data as unknown as typeof institutions) ?? [];
    }
  }

  // Cascading lists (only when the parent level is chosen).
  let programs: Array<{ id: string; program_name: string }> = [];
  let sections: Array<{ id: string; section_name: string }> = [];
  let learners: Array<{ id: string; name: string; admission: string }> = [];

  if (institutionId) {
    const [{ data: progs }, secQ] = await Promise.all([
      db.from('programs').select('id, program_name').eq('institution_id', institutionId).order('program_name'),
      (async () => {
        let q = db
          .from('sections')
          .select('id, section_name')
          .eq('institution_id', institutionId)
          .order('section_name');
        if (programIds.length) q = q.in('program_id', programIds);
        return q;
      })(),
    ]);
    programs = (progs as unknown as typeof programs) ?? [];
    sections = (secQ.data as unknown as typeof sections) ?? [];
  }

  if (sectionIds.length) {
    const { data: lrn } = await db
      .from('learners_profiles')
      .select('id, first_name, last_name, application_id, roll_number')
      .in('section_id', sectionIds)
      .order('first_name')
      .limit(1000);
    learners = ((lrn as unknown as Array<Record<string, string | null>>) ?? []).map((l) => ({
      id: l.id as string,
      name: [l.first_name, l.last_name].filter(Boolean).join(' '),
      admission: (l.application_id || l.roll_number || '') as string,
    }));
  }

  return NextResponse.json({ institutions, programs, sections, learners });
}
