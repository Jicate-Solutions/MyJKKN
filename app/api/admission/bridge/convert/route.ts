export const dynamic = 'force-dynamic';

// app/api/admission/bridge/convert/route.ts
// Converts an admission application into a learners_profiles draft.
// Atomically: INSERT learners_profiles → UPDATE admission_leads.learner_profile_id

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest): Promise<NextResponse> {
  console.log('[bridge/convert] Request received');

  // ── 1. Authenticate ─────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user || authError) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── 2. Parse body ────────────────────────────────────────────────────────────
  let leadId: string;
  let institutionId: string;
  try {
    const body = await request.json();
    leadId = body.leadId;
    institutionId = body.institutionId;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  if (!leadId || !institutionId) {
    return NextResponse.json({ error: 'leadId and institutionId are required' }, { status: 400 });
  }

  const svc = createServiceRoleClient();

  // ── 3. Fetch lead ────────────────────────────────────────────────────────────
  // 2026-04-23: include the admission_year join so we can populate BOTH the FK
  // (admission_year_id) and the legacy integer (admission_year) on the new
  // learner profile in one shot — keeps B2A endpoint back-compat without an
  // extra query.
  const { data: lead, error: leadError } = await (svc as any)
    .from('admission_leads')
    .select('*, admission_year:admission_years(id, program_start_year, program_end_year, admission_year_name)')
    .eq('id', leadId)
    .eq('institution_id', institutionId)
    .single();

  if (leadError || !lead) {
    console.error('[bridge/convert] Lead not found:', leadError?.message);
    return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  }

  // ── 4. Guard: already converted ─────────────────────────────────────────────
  if (lead.learner_profile_id) {
    console.log('[bridge/convert] Already converted:', lead.learner_profile_id);
    return NextResponse.json(
      { error: 'Already converted', profileId: lead.learner_profile_id },
      { status: 409 }
    );
  }

  // ── 5. Map fields ────────────────────────────────────────────────────────────
  const profileData = {
    // Name
    first_name: lead.first_name || '',
    last_name: lead.last_name || '',
    // Contact
    student_mobile: lead.phone || '',
    student_email: lead.email || '',
    // Personal
    date_of_birth: lead.date_of_birth || '',
    gender: lead.gender || '',
    // Address
    permanent_address_street: lead.address_line1 || '',
    permanent_address_state: lead.state || '',
    permanent_address_district: lead.district || '',
    permanent_address_pin_code: lead.pincode || '',
    // Academic
    institution_id: lead.institution_id,
    degree_id: lead.degree_id || null,
    department_id: lead.department_id || null,
    program_id: lead.program_id || null,
    // 2026-04-23: propagate the lead's admission cohort to the new learner.
    // Before this fix the FK was silently dropped on every conversion (the
    // very picker a user had filled in on the lead form was thrown away).
    // We write BOTH columns:
    //   - admission_year_id (UUID FK): the new source of truth
    //   - admission_year (INT): legacy column kept for B2A/MCP back-compat
    //                           (6 endpoints expose ?admission_year=N)
    admission_year_id: lead.admission_year_id || null,
    admission_year: lead.admission_year?.program_start_year ?? null,
    // Parent (best-effort)
    father_name: lead.parent_name || '',
    father_mobile: lead.parent_phone || '',
    mother_name: '',
    mother_mobile: '',
    // Referral attribution — preserve the source that brought this lead in.
    // These columns were added to learners_profiles on 2026-04-18. Before that
    // migration this data was dropped on conversion; now it flows through.
    referral_type: lead.referral_type || null,
    referred_by_id: lead.referred_by_id || null,
    referred_by_name: lead.referred_by_name || null,
    // Required fields with safe defaults
    lifecycle_status: 'admitted',
    accommodation_type: 'DAY SCHOLAR',
    entry_type: 'FIRST YEAR',
    last_school: '',
    board_of_study: '',
    tenth_marks: {},
    twelfth_marks: {},
    religion: '',
    community: '',
    // Audit
    created_by: user.id,
  };

  // ── 6. Insert learner profile ────────────────────────────────────────────────
  const { data: profile, error: insertError } = await (svc as any)
    .from('learners_profiles')
    .insert(profileData)
    .select('id')
    .single();

  if (insertError || !profile) {
    console.error('[bridge/convert] Failed to create learner profile:', insertError?.message);
    return NextResponse.json(
      { error: `Failed to create learner profile: ${insertError?.message}` },
      { status: 500 }
    );
  }
  console.log('[bridge/convert] ✓ Created learner profile:', profile.id);

  // ── 7. Update admission_leads.learner_profile_id ─────────────────────────────
  const { error: updateError } = await (svc as any)
    .from('admission_leads')
    .update({ learner_profile_id: profile.id })
    .eq('id', leadId);

  if (updateError) {
    console.error('[bridge/convert] Failed to update lead FK — rolling back profile');
    // Compensating rollback: delete the profile we just created
    await (svc as any).from('learners_profiles').delete().eq('id', profile.id);
    return NextResponse.json(
      { error: `Failed to link profile to lead: ${updateError.message}` },
      { status: 500 }
    );
  }

  console.log('[bridge/convert] ✓ Linked profile to lead. Done.');
  return NextResponse.json({ profileId: profile.id });
}
