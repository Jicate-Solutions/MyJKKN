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

  // ── 1b. Permission gate ────────────────────────────────────────────────────
  // Defense-in-depth: this route uses createServiceRoleClient() below (bypasses
  // RLS) so the UI PermissionGuard alone is not a security boundary — every
  // authenticated user could otherwise POST here directly. user_has_permission
  // honors super_admin bypass internally; we just call it with the catalog key.
  //
  // Use the ONE-ARG overload user_has_permission(permission_name text). It
  // resolves auth.uid() internally, and `supabase` here is the cookie-scoped
  // client, so it answers about exactly this caller — identical to passing
  // user.id explicitly, which is all this route ever did.
  //
  // Do NOT switch back to user_has_permission(user_id uuid, permission_key text).
  // Migration 20260811100100 deliberately REVOKED EXECUTE on that overload from
  // `authenticated` because it is SECURITY DEFINER, accepts a caller-supplied
  // uuid, and never compares it to auth.uid() — a signed-in user could ask
  // "does <anyone> hold <any key>" and harvest the whole role map, handover
  // delegations included. Calling it from a cookie-scoped client now yields
  // 42501 and the button dies for everyone. (The service-role callers in
  // /api/admission/leads/program-counts and lib/auth/bulk-receipt-access.ts
  // still use the 2-arg form legitimately — service_role kept its grant.)
  const { data: canConvert, error: permError } = await (supabase as any)
    .rpc('user_has_permission', {
      permission_name: 'admission.leads.convert_to_admitted',
    });
  // A check that could not RUN is not a denial. Reading `data` alone conflates
  // the two — both arrive falsy — and that conflation is what shipped: when the
  // (uuid, text) overload lost its EXECUTE grant to `authenticated`, PostgREST
  // returned 42501 and every caller was told "Forbidden", including admission
  // officers whose role plainly carried the key. Wrong AND unactionable: it
  // points the reader at the permissions catalog, where nothing is broken.
  // This branch is what makes the next occurrence legible instead of silent.
  if (permError) {
    console.error(
      '[bridge/convert] Permission check could not run:',
      permError.code,
      permError.message,
    );
    return NextResponse.json(
      { error: 'Permission check failed. Please report this to support.' },
      { status: 500 },
    );
  }
  if (!canConvert) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
    .select('*, admission_year:admission_years(id, institution_id, year, admission_year_name)')
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

  // ── 5a. Resolve a valid admission_year_id for the new learner ───────────────
  // Why this exists:
  //   admission_years is now institution-wide (program_id dropped; cohort key is
  //   `year`). The validation trigger rejects an FK attach whose admission_years
  //   row belongs to a different institution than the learner. If the lead's
  //   stored AY does not match this lead's institution, we re-resolve by
  //   (institution_id, year). If nothing matches, we drop the FK to NULL (legacy
  //   integer column still propagates so B2A / MCP back-compat keeps working).
  let resolvedAdmissionYearId: string | null = lead.admission_year_id || null;
  if (resolvedAdmissionYearId) {
    const ay = lead.admission_year;
    const ayInstitutionMismatch =
      !ay || (ay.institution_id && ay.institution_id !== lead.institution_id);

    if (ayInstitutionMismatch) {
      // Try to find the correct admission_year for this lead's institution.
      const cohortYear = ay?.year;
      let lookup = (svc as any)
        .from('admission_years')
        .select('id')
        .eq('institution_id', lead.institution_id);
      if (cohortYear) lookup = lookup.eq('year', cohortYear);
      const { data: matchAy } = await lookup.limit(1).maybeSingle();

      if (matchAy?.id) {
        console.log(
          '[bridge/convert] Re-resolved admission_year_id from',
          resolvedAdmissionYearId,
          '→',
          matchAy.id
        );
        resolvedAdmissionYearId = matchAy.id;
      } else {
        console.warn(
          '[bridge/convert] No matching admission_year for institution; dropping FK'
        );
        resolvedAdmissionYearId = null;
      }
    }
  }

  // accommodation_type TEXT is retired — convert defaults a lead to day-scholar,
  // so resolve the global 'dayscholar' accommodation_types FK to persist.
  const { data: accRow } = await (svc as any)
    .from('accommodation_types')
    .select('id')
    .eq('code', 'dayscholar')
    .maybeSingle();
  const accommodationTypeId: string | null = accRow?.id ?? null;

  // ── 5b. Resolve the institution's ACTIVE academic year (BUG-005352) ─────────
  // Profiles created by this bridge never carried academic_year_id, so every
  // downstream year-keyed read found nothing: fn_learner_current_year_academic_fee
  // matches bills on academic_year_id = learners_profiles.academic_year_id, and
  // trg_billing_bill_default_academic_year copies the year FROM this profile
  // column onto new bills. NULL here → unstamped bills → fee lookup empty →
  // fresher reads as "not eligible" for hostel allocation. Same active-AY
  // resolution the campus-living RPCs use (~8 migrations share the idiom).
  const { data: activeAy } = await (svc as any)
    .from('academic_years')
    .select('id')
    .eq('institution_id', lead.institution_id)
    .eq('is_active', true)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  const academicYearId: string | null = activeAy?.id ?? null;
  if (!academicYearId) {
    console.warn(
      '[bridge/convert] No active academic year for institution',
      lead.institution_id,
      '— academic_year_id left NULL (fee-eligibility lookups will not resolve until stamped)'
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
    // 2026-05-02 (Phase D): write FK only. The integer column has been
    // dropped; Phase C-8 backfilled all readers (B2A, api-management, MCP,
    // Excel export) to derive the legacy integer from the FK in their
    // response shape, so external consumers see no change.
    admission_year_id: resolvedAdmissionYearId,
    // BUG-005352: stamp the institution's active academic year at creation so
    // the billing default-AY trigger and fee-eligibility functions can resolve.
    academic_year_id: academicYearId,
    // Parent (best-effort)
    father_name: lead.parent_name || '',
    father_mobile: lead.parent_phone || '',
    mother_name: '',
    mother_mobile: '',
    // Referral attribution — referred_by_id / referral_type are DEFERRED to
    // step 7b. Setting referred_by_id on this INSERT fires the learner-side
    // sync trigger BEFORE step 7 links the lead, racing the lead-side trigger
    // and violating uniq_attribution_consultant_learner. referred_by_name is
    // a plain text shadow with no triggers attached, so it stays here.
    referred_by_name: lead.referred_by_name || null,
    // Required fields with safe defaults
    // 2026-05-20: re-introduced 'enquiry' as the entry-point status for the
    // counselor workflow. Previous attempt (2026-05-08 → 2026-05-09 revert)
    // failed because the /learners/enquiries tabs didn't include 'enquiry'.
    // That gap was closed in this rollout: migration
    // 20260520120100_realign_lifecycle_statuses_data_and_seed re-added the
    // enum value, and the enquiries list filter now includes 'enquiry' and
    // 'enquiry_submitted'. Old 'admitted' rows were migrated to 'enquiry' in
    // the same migration. The new meaning of 'admitted' is post-threshold
    // (auto-set by evaluate_learner_status_after_payment when fees clear 50%).
    lifecycle_status: 'enquiry',
    // accommodation_type TEXT retired — write the resolved 'dayscholar' FK.
    accommodation_type_id: accommodationTypeId,
    entry_type: 'FIRST YEAR',
    last_school: '',
    board_of_study: '',
    tenth_marks: {},
    twelfth_marks: {},
    religion: '',
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
    // The validate_learner_admission_year_scope trigger raises a check_violation
    // with a fairly technical message. Surface a friendlier one to the UI while
    // keeping the original detail in the server log.
    const isAyScopeError =
      insertError?.code === '23514' ||
      /admission_year_id .* does not match learner/i.test(
        insertError?.message || ''
      );
    const userMessage = isAyScopeError
      ? "This lead's admission year doesn't belong to its program. Please correct the lead's program/admission year and try again."
      : `Failed to create learner profile: ${insertError?.message}`;
    return NextResponse.json({ error: userMessage }, { status: 500 });
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

  // ── 7b. Propagate referral attribution onto the new learner ────────────────
  // Deferred from step 5 to break a trigger race:
  //   step 6 INSERT learner with referred_by_id  →  learner-trigger inserts
  //     attribution row L (admission_id=NULL, learner_profile_id=new) because
  //     the lead doesn't yet point at the learner.
  //   step 7 UPDATE lead.learner_profile_id      →  lead-trigger DO UPDATEs
  //     existing row A to set learner_profile_id=new, colliding with row L on
  //     uniq_attribution_consultant_learner.
  // By updating referred_by_id here — after the lead is linked — the
  // learner-trigger's EXISTS guard finds the lead-link and skips the insert,
  // so only row A (now populated with learner_profile_id) remains.
  if (lead.referred_by_id || lead.referral_type) {
    const { error: refError } = await (svc as any)
      .from('learners_profiles')
      .update({
        referred_by_id: lead.referred_by_id || null,
        referral_type: lead.referral_type || null,
      })
      .eq('id', profile.id);
    if (refError) {
      // Non-fatal: row A on consultant_lead_attributions already carries the
      // consultant link via the lead-trigger; the learner's referred_by_id
      // column is a denormalized convenience that read sites can fall back on.
      console.warn(
        '[bridge/convert] Could not propagate referral attribution to learner:',
        refError.message
      );
    }
  }

  // ── 8. Self-heal the lead's own admission_year_id when we re-resolved it ───
  // Best-effort: if the new resolved id differs from what the lead carried,
  // patch the lead so the UI stops showing the wrong cohort going forward.
  if (
    resolvedAdmissionYearId &&
    resolvedAdmissionYearId !== lead.admission_year_id
  ) {
    const { error: ayHealError } = await (svc as any)
      .from('admission_leads')
      .update({ admission_year_id: resolvedAdmissionYearId })
      .eq('id', leadId);
    if (ayHealError) {
      // Non-fatal: log only — the conversion has already succeeded.
      console.warn(
        '[bridge/convert] Could not self-heal lead admission_year_id:',
        ayHealError.message
      );
    }
  }

  console.log('[bridge/convert] ✓ Linked profile to lead. Done.');
  return NextResponse.json({ profileId: profile.id });
}
