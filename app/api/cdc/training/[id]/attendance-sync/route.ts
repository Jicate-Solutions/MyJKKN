// app/api/cdc/training/[id]/attendance-sync/route.ts — BUG-004201.
// POST → recompute every enrolled learner's attendance_pct for this programme from
// the academic attendance master (student_attendance) over the programme's date
// window (Model A). Gated on cdc.training.edit + the programme's institution scope;
// the actual jsonb computation runs in fn_cdc_training_attendance_sync (service_role).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { createApiInstitutionFilter } from '@/lib/auth/api-institution-filter';

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { data: canEdit } = await supabase.rpc('user_has_permission', { permission_name: 'cdc.training.edit' });
    if (canEdit !== true) return NextResponse.json({ error: 'Forbidden — cdc.training.edit required' }, { status: 403 });

    const filter = await createApiInstitutionFilter(_req);
    if (!filter.isAllowed) {
      return NextResponse.json({ error: filter.reason ?? 'Not authorized' },
        { status: filter.reason === 'User not authenticated' ? 401 : 403 });
    }

    const svc = createServiceRoleClient();

    // Programme scope check: super_admin/admission (institutionIds=[]) see all; others
    // must own the programme's institution. Cross-college programmes (null institution)
    // are visible to any cdc.training.edit holder.
    const { data: prog, error: progErr } = await svc
      .from('cdc_training_programmes')
      .select('id, institution_id, start_date, end_date')
      .eq('id', id)
      .maybeSingle();
    if (progErr || !prog) return NextResponse.json({ error: 'Programme not found' }, { status: 404 });

    const instIds = filter.institutionIds ?? [];
    if (instIds.length > 0 && prog.institution_id && !instIds.includes(prog.institution_id)) {
      return NextResponse.json({ error: 'Outside your institution scope' }, { status: 403 });
    }
    if (!prog.start_date || !prog.end_date) {
      return NextResponse.json(
        { error: 'Set the programme start and end dates first — attendance is computed over that window.' },
        { status: 400 }
      );
    }

    const { data: result, error: rpcErr } = await svc.rpc('fn_cdc_training_attendance_sync', { p_programme_id: id });
    if (rpcErr) {
      console.error('[cdc/training/attendance-sync] rpc failed:', rpcErr);
      return NextResponse.json({ error: 'Could not recompute attendance.' }, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (e) {
    console.error('[cdc/training/attendance-sync] unexpected error:', e);
    return NextResponse.json({ error: 'Unexpected error.' }, { status: 500 });
  }
}
