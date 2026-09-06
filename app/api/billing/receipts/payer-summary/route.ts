export const dynamic = 'force-dynamic';

// app/api/billing/receipts/payer-summary/route.ts
//
// GET /api/billing/receipts/payer-summary?bill_ids=<uuid,uuid,…>
//
// Returns the minimal learner identity the New Receipt form needs to show who
// it is collecting from: roll number, display name and a single contact number
// for the receipt's payer fields. Nothing else about the learner is exposed
// here.
//
// WHY THIS EXISTS
// ---------------
// /billing/receipts/new used to read the learner through a PostgREST embed
// (`student:learners_profiles(...)`) on the client. learners_profiles is gated
// by learners.admissions.view / learners.profiles.view / learners.view, and a
// collection-only role has none of them — it reaches billing through the
// SECURITY DEFINER fn_list_transport_collectables and deliberately has no raw
// learner access. An RLS-filtered to-one embed comes back as NULL rather than
// as an error, so those fields silently rendered blank.
//
// institution_id and student_id were recoverable from billing_student_bills
// itself, but roll_number lives only on learners_profiles. This route resolves
// it server-side, exactly the way the transport list already does: privileged
// read behind an explicit permission gate plus an institution-scope check.
//
// AUTHORIZATION
// -------------
// Two independent gates, both required:
//   1. withAuth demands billing.receipts.create — the same key that lets the
//      caller create the receipt these bills belong to.
//   2. Every institution owning one of the requested bills must pass
//      role_has_institution_access(), evaluated through the caller's OWN
//      RLS-scoped client. This is what stops a holder of the permission from
//      enumerating roll numbers outside their own institution by feeding in
//      arbitrary bill ids.
// Only after both pass does the service-role client read the learner row.

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { createServiceRoleClient } from '@/lib/supabase/server';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A receipt is always created against one learner's bills, and the New Receipt
// form loads a single learner's outstanding items. This ceiling keeps the
// endpoint from being usable as a bulk roll-number scraper.
const MAX_BILL_IDS = 50;

export const GET = withAuth(
  async (request, auth) => {
    const { searchParams } = new URL(request.url);

    const billIds = (searchParams.get('bill_ids') || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    if (billIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'bill_ids is required' },
        { status: 400 }
      );
    }
    if (billIds.length > MAX_BILL_IDS) {
      return NextResponse.json(
        { success: false, error: `At most ${MAX_BILL_IDS} bill_ids` },
        { status: 400 }
      );
    }
    if (!billIds.every((id) => UUID_RE.test(id))) {
      return NextResponse.json(
        { success: false, error: 'bill_ids must be UUIDs' },
        { status: 400 }
      );
    }

    const admin = createServiceRoleClient();

    const { data: bills, error: billsError } = await admin
      .from('billing_student_bills')
      .select('id, student_id, institution_id')
      .in('id', billIds);

    if (billsError) {
      return NextResponse.json(
        { success: false, error: billsError.message },
        { status: 500 }
      );
    }
    if (!bills || bills.length === 0) {
      return NextResponse.json({ success: true, data: null });
    }

    // Institution-scope check, through the CALLER's client so RLS-side helpers
    // see the caller's identity rather than the service role's.
    const institutionIds = Array.from(
      new Set(bills.map((b) => b.institution_id).filter(Boolean))
    );
    for (const institutionId of institutionIds) {
      const { data: allowed, error: accessError } = await auth.supabase.rpc(
        'role_has_institution_access',
        { check_institution_id: institutionId }
      );
      if (accessError) {
        return NextResponse.json(
          { success: false, error: accessError.message },
          { status: 500 }
        );
      }
      if (allowed !== true) {
        return NextResponse.json(
          { success: false, error: 'Forbidden' },
          { status: 403 }
        );
      }
    }

    // The form is single-learner; if a caller mixes learners we answer for the
    // first bill's learner, matching how the page prefills from bills[0].
    const studentId = bills[0].student_id;
    if (!studentId) {
      return NextResponse.json({ success: true, data: null });
    }

    const { data: learner, error: learnerError } = await admin
      .from('learners_profiles')
      .select(
        'id, first_name, last_name, roll_number, institution_id, student_mobile, father_mobile, mother_mobile'
      )
      .eq('id', studentId)
      .maybeSingle();

    if (learnerError) {
      return NextResponse.json(
        { success: false, error: learnerError.message },
        { status: 500 }
      );
    }
    if (!learner) {
      return NextResponse.json({ success: true, data: null });
    }

    return NextResponse.json({
      success: true,
      data: {
        student_id: learner.id,
        roll_number: learner.roll_number,
        full_name:
          `${learner.first_name || ''} ${learner.last_name || ''}`.trim() ||
          null,
        // Single contact number for the receipt's "Payer Contact" field. The
        // learner's own mobile is the one number that is always present
        // (4940/4940 active learners); father / mother are the fallbacks for
        // the handful of legacy rows that predate that requirement. The
        // individual columns are deliberately NOT exposed — this endpoint
        // hands back only what the receipt prints.
        payer_contact:
          [learner.student_mobile, learner.father_mobile, learner.mother_mobile]
            .map((v) => (v || '').trim())
            .find(Boolean) || null,
        institution_id: learner.institution_id
      }
    });
  },
  {
    requiredPermission: 'read',
    requirePermission: 'billing.receipts.create',
    allowApiKey: false
  }
);
