export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { RecruitmentService } from '@/lib/services/hr/recruitment-service';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { OnboardToStaffPayload } from '@/types/hr-recruitment';
import { normalizeStaffName } from '@/lib/utils/staff-name';

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

const REQUIRED: (keyof OnboardToStaffPayload)[] = [
  'first_name', 'last_name', 'gender', 'date_of_birth', 'marital_status',
  'email', 'phone', 'date_of_joining', 'designation', 'category_id', 'institution_id',
];

/**
 * POST /api/hr/recruitment/candidates/[id]/onboard-to-staff
 *
 * Final step of the recruitment pipeline: creates the staff record from the
 * finally-approved candidate and marks the candidacy 'joined'.
 * - Gated on staff.create (same permission as /api/staff POST) or super-admin.
 * - Staff insert uses the service-role client (mirrors /api/staff: staff RLS
 *   insert policies are stricter than the permission model here).
 * - Candidate transition approved → joined is done directly (updateStatus's
 *   allow-list requires offer_issued first; the dynamic-flow spec goes
 *   straight from final approval to onboarding).
 * - Login is NOT provisioned here — enable it later from the Staff module.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await params;
    const supabase = await getClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Permission gate — identical to /api/staff POST.
    const { data: isSuperAdmin } = await supabase.rpc('is_super_admin');
    if (!isSuperAdmin) {
      const { data: canCreate } = await supabase.rpc('user_has_permission', {
        permission_name: 'staff.create',
      });
      if (!canCreate) {
        return NextResponse.json(
          { error: 'Insufficient permissions to onboard staff (needs staff.create)' },
          { status: 403 }
        );
      }
    }

    const body = (await request.json()) as OnboardToStaffPayload;
    for (const key of REQUIRED) {
      if (!body[key]) {
        return NextResponse.json({ error: `${key} is required` }, { status: 400 });
      }
    }

    // Candidate must be finally approved (not yet joined).
    const candidate = await RecruitmentService.getCandidate(supabase, id);
    if (!candidate) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    if (!['approved', 'package_fixed', 'offer_issued'].includes(candidate.status)) {
      return NextResponse.json(
        { error: `Candidate must be finally approved before onboarding (current status: '${candidate.status}').` },
        { status: 400 }
      );
    }
    const details = (candidate.role_specific_details ?? {}) as Record<string, unknown>;
    if (details.staff_record_id) {
      return NextResponse.json(
        { error: 'This candidate has already been onboarded to staff.' },
        { status: 409 }
      );
    }

    // Checklist gate (2026-07-06): the staff record may ONLY be created after
    // the onboarding checklist has been started AND every step is completed.
    const onboardingSteps = Array.isArray(details.onboarding_steps)
      ? (details.onboarding_steps as Array<{ completed?: boolean }>)
      : null;
    if (!onboardingSteps || onboardingSteps.length === 0) {
      return NextResponse.json(
        {
          error:
            'Onboarding checklist has not been started for this candidate. ' +
            'Start onboarding and complete every step before creating the staff record.',
        },
        { status: 400 }
      );
    }
    const pendingCount = onboardingSteps.filter((s) => s.completed !== true).length;
    if (pendingCount > 0) {
      return NextResponse.json(
        {
          error:
            `${pendingCount} of ${onboardingSteps.length} onboarding steps are still pending. ` +
            'All checklist steps must be completed before the staff record can be created.',
        },
        { status: 400 }
      );
    }

    const admin = createServiceRoleClient();

    // Teaching categories require a department (mirrors StaffService rule).
    const { data: category, error: catErr } = await admin
      .from('employment_categories')
      .select('id, is_teaching')
      .eq('id', body.category_id)
      .single();
    if (catErr) return NextResponse.json({ error: 'Invalid staff category' }, { status: 400 });
    let departmentId = body.department_id ?? null;
    if (category.is_teaching === true && !departmentId) {
      return NextResponse.json(
        { error: 'Department is required for teaching staff' },
        { status: 400 }
      );
    }
    if (category.is_teaching === false) departmentId = null;

    // Duplicate guard on personal email.
    const { data: dupe } = await admin
      .from('staff')
      .select('id, first_name, last_name')
      .eq('email', body.email.trim().toLowerCase())
      .maybeSingle();
    if (dupe) {
      return NextResponse.json(
        { error: `A staff record with email ${body.email} already exists.` },
        { status: 409 }
      );
    }

    // Create the staff record.
    const { data: staff, error: staffErr } = await admin
      .from('staff')
      .insert({
        // Canonical staff name (UPPERCASE, trimmed, single-spaced) — matches
        // what trg_normalize_staff_names would store anyway, but doing it here
        // keeps the value returned to the caller consistent with the row.
        first_name: normalizeStaffName(body.first_name),
        last_name: normalizeStaffName(body.last_name),
        gender: body.gender,
        date_of_birth: body.date_of_birth,
        marital_status: body.marital_status,
        email: body.email.trim().toLowerCase(),
        phone: body.phone.trim(),
        date_of_joining: body.date_of_joining,
        designation: body.designation.trim(),
        category_id: body.category_id,
        institution_id: body.institution_id,
        department_id: departmentId,
        institution_email: body.institution_email?.trim() || null,
        created_by: user.id,
        updated_by: user.id,
      })
      .select('id, first_name, last_name, email, institution_id')
      .single();
    if (staffErr) {
      console.error('[onboard-to-staff] staff insert failed:', staffErr);
      return NextResponse.json(
        { error: `Staff creation failed: ${staffErr.message}` },
        { status: 500 }
      );
    }

    // Mark the candidacy joined + link the staff record for traceability.
    const { data: updatedCandidate, error: candErr } = await admin
      .from('hr_recruitment_candidates')
      .update({
        status: 'joined',
        actual_joining_date: body.date_of_joining,
        role_specific_details: {
          ...(candidate.role_specific_details ?? {}),
          staff_record_id: staff.id,
          onboarded_at: new Date().toISOString(),
          onboarded_by: user.id,
        },
      })
      .eq('id', id)
      .select()
      .single();
    if (candErr) {
      // Staff row exists but candidate flag failed — surface loudly, don't hide.
      console.error('[onboard-to-staff] candidate update failed after staff insert:', candErr);
      return NextResponse.json(
        {
          error:
            `Staff record ${staff.id} was created, but marking the candidate as joined failed: ` +
            `${candErr.message}. Fix the candidate manually.`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: { staff, candidate: updatedCandidate } });
  } catch (err) {
    console.error('[hr/recruitment/candidates/:id/onboard-to-staff] error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 400 }
    );
  }
}
