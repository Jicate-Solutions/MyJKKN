// app/api/cdc/requirements/[id]/roles/[roleId]/publish/route.ts
// CDC staff — publish a requirement role to the Opportunities Bulletin
// (cdc_external_opportunities), broadcasting it to students. Creates the bulletin
// row via the service-role client (after an is_cdc_staff gate) so a coordinator
// who holds cdc.requirements.* but not cdc.bulletin.create can still publish, and
// links it back onto the role (status='published_bulletin').

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

interface RoleRow {
  id: string;
  requirement_id: string;
  role_title: string;
  description: string | null;
  skills: string[] | null;
  experience_level: string | null;
  experience_min_years: number | null;
  education_text: string | null;
  location: string | null;
  work_mode: string | null;
  status: string;
  published_opportunity_id: string | null;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; roleId: string }> }
) {
  const { id, roleId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { data: isStaff } = await supabase.rpc('is_cdc_staff');
  if (isStaff !== true) return NextResponse.json({ error: 'Forbidden — CDC staff only' }, { status: 403 });

  const svc = createServiceRoleClient();

  // Load the role + its parent company via service-role (RLS-exempt read after the
  // staff gate). Verify it belongs to the requirement in the URL.
  const { data: role, error: roleErr } = await svc
    .from('cdc_employer_requirement_roles')
    .select('*')
    .eq('id', roleId)
    .eq('requirement_id', id)
    .single<RoleRow>();
  if (roleErr || !role) return NextResponse.json({ error: 'Role not found' }, { status: 404 });

  if (role.published_opportunity_id) {
    return NextResponse.json({ error: 'This role is already on the Bulletin.' }, { status: 409 });
  }

  const { data: reqRow } = await svc
    .from('cdc_employer_requirements')
    .select('company_name, status')
    .eq('id', id)
    .single<{ company_name: string; status: string }>();
  if (!reqRow) return NextResponse.json({ error: 'Requirement not found' }, { status: 404 });
  if (reqRow.status === 'pending_review' || reqRow.status === 'rejected') {
    return NextResponse.json(
      { error: 'Approve this submission before publishing its roles.' },
      { status: 409 }
    );
  }

  const skills = Array.isArray(role.skills) ? role.skills : [];
  const eligibilityBits: string[] = [];
  if (role.experience_level && role.experience_level !== 'any') eligibilityBits.push(`${role.experience_level}`);
  if (role.experience_min_years) eligibilityBits.push(`${role.experience_min_years}+ yrs`);
  if (role.education_text) eligibilityBits.push(role.education_text);
  const descBits: string[] = [];
  if (role.description) descBits.push(role.description);
  if (skills.length) descBits.push(`Skills: ${skills.join(', ')}`);

  // work_mode → bulletin mode label (bulletin mode is free text/nullable).
  const modeMap: Record<string, string> = { in_person: 'On-site', remote: 'Remote', hybrid: 'Hybrid' };

  const { data: opp, error: oppErr } = await svc
    .from('cdc_external_opportunities')
    .insert({
      title: role.role_title,
      description: descBits.join('\n\n') || null,
      source_organisation: reqRow.company_name,
      category: 'job',
      eligibility_text: eligibilityBits.join(' · ') || null,
      mode: role.work_mode ? modeMap[role.work_mode] ?? null : null,
      is_active: true,
      posted_by: user.id,
    })
    .select('id')
    .single();

  if (oppErr || !opp) {
    console.error('[cdc/requirements/publish] bulletin insert error:', oppErr?.message);
    return NextResponse.json({ error: 'Failed to publish to Bulletin' }, { status: 500 });
  }

  const { error: updErr } = await svc
    .from('cdc_employer_requirement_roles')
    .update({ status: 'published_bulletin', published_opportunity_id: opp.id })
    .eq('id', roleId);
  if (updErr) {
    // Roll back the bulletin row so we don't leave a published post the role
    // doesn't know about.
    await svc.from('cdc_external_opportunities').delete().eq('id', opp.id);
    console.error('[cdc/requirements/publish] role link error:', updErr.message);
    return NextResponse.json({ error: 'Failed to link published role' }, { status: 500 });
  }

  return NextResponse.json({ opportunityId: opp.id });
}
