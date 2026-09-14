export const dynamic = 'force-dynamic';

// GET /api/cohorts/coordinators
// Every cohort across all six programme kinds, with its member count and who
// coordinates it — the whole payload the Cohort Coordinators console renders.
//
// The read runs through fn_cohort_coordinators_overview(), a super-admin-gated
// SECURITY DEFINER function, using the caller's own session client. That means
// the identity the RPC checks is the signed-in person's, never a service-role
// identity that would make the gate meaningless.

import { NextResponse } from 'next/server';
import { requireSuperAdmin } from './_guard';

export async function GET() {
  const guard = await requireSuperAdmin();
  if (guard instanceof NextResponse) return guard;

  const { data, error } = await guard.supabase.rpc('fn_cohort_coordinators_overview');
  if (error) {
    return NextResponse.json(
      { error: `Could not load cohort coordinators: ${error.message}` },
      { status: 400 }
    );
  }

  return NextResponse.json({ overview: data ?? { programmes: [] } });
}
