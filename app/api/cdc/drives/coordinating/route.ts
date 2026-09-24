export const dynamic = 'force-dynamic';

/**
 * GET /api/cdc/drives/coordinating — the drives THIS user is assigned to as a
 * faculty / coordinator. Faculty hold no CDC permission, so the coordinator
 * list page reads this instead of the gated /api/cdc/drives list. Only the
 * caller's own assignments are returned.
 */

import { NextResponse, connection } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

export async function GET() {
  await connection();
  try {
    const session = await createClient();
    const {
      data: { user },
    } = await session.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const service = createServiceRoleClient();
    const { data: mine, error } = await service
      .from('cdc_drive_coordinators')
      .select('drive_id, assigned_at')
      .eq('user_id', user.id);
    if (error) throw error;
    const ids = (mine ?? []).map((m) => m.drive_id as string);
    if (ids.length === 0) return NextResponse.json({ data: [] }, { headers: { 'Cache-Control': 'no-store' } });

    const { data: drives, error: dErr } = await service
      .from('cdc_drives')
      .select('id, title, status, drive_date, drive_start_time, venue_label, participants_finalized_at, recruiter_id')
      .in('id', ids)
      .order('drive_date', { ascending: false, nullsFirst: false });
    if (dErr) throw dErr;

    const recruiterIds = Array.from(new Set((drives ?? []).map((d) => d.recruiter_id as string).filter(Boolean)));
    const recruiterName = new Map<string, string>();
    if (recruiterIds.length) {
      const { data: recs } = await service.from('cdc_recruiters').select('id, name').in('id', recruiterIds);
      (recs ?? []).forEach((r) => recruiterName.set(r.id as string, r.name as string));
    }

    return NextResponse.json(
      {
        data: (drives ?? []).map((d) => ({
          id: d.id,
          title: d.title,
          status: d.status,
          drive_date: d.drive_date,
          drive_start_time: d.drive_start_time,
          venue_label: d.venue_label,
          participants_finalized: !!d.participants_finalized_at,
          recruiter_name: d.recruiter_id ? recruiterName.get(d.recruiter_id as string) ?? null : null,
        })),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[cdc/drives/coordinating] GET error', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
