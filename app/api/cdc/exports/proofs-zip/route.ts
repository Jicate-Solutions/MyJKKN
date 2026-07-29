// GET /api/cdc/exports/proofs-zip — BUG-004082
//
// Returns the manifest of offer-letter "proof" documents for the NAAC 8.2
// (Graduate Progression) / AICTE placement set (cdc_placements where
// status = 'accepted'). The browser
// fetches each public cdc-docs URL in the manifest and bundles them into a ZIP
// via jszip (see hooks/cdc/use-cdc-exports.ts -> useProofsZip). We return only
// { url, filename } pairs — the server never buffers the PDFs themselves.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { listPlacementProofs } from '@/lib/services/cdc/export-service';

export async function GET(_req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // CDC-staff gate — identical to /api/cdc/exports/naac. The proof set is the
    // institution-wide accepted-placement list (offer letters carry student
    // name, register number, recruiter, salary). The 401 above only proves
    // "logged in"; without this an authenticated learner could pull the
    // cross-institution manifest. cdc_placements_read RLS would still scope a
    // learner to their own row, but we fail closed at the app layer to match
    // the NAAC route's posture.
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_super_admin')
      .eq('id', user.id)
      .single();
    const CDC_EXPORT_ROLES = ['cdc_head', 'cdc_coordinator', 'admin', 'super_admin', 'administrator'];
    const isCdcStaff =
      profile?.is_super_admin === true ||
      (profile?.role != null && CDC_EXPORT_ROLES.includes(profile.role));
    if (!isCdcStaff) {
      return NextResponse.json({ error: 'Forbidden — CDC staff only' }, { status: 403 });
    }

    const proofs = await listPlacementProofs();
    return NextResponse.json({ proofs }, { status: 200 });
  } catch (e) {
    console.error('[cdc/exports/proofs-zip] error', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
