// app/api/cdc/drives/mine/route.ts — the campus drives THIS learner can act on.
//
// GET → drives currently open for willingness whose eligibility criteria include
//       the caller's program, each carrying the caller's own declaration state.
//
// Why this exists: until now the only route to a drive was the notification
// dropped when it opened. A learner who missed, dismissed or never received that
// notification had no way to find the drive at all — /cdc/drives is coordinator
// surface and gated on cdc.drives.view, which learners do not hold. This is the
// second door.
//
// No service-role client here, unlike the sibling /api/cdc/udyog/mine: every
// table this reads is already learner-readable under RLS —
//   cdc_drives.cdc_drives_read              → any authenticated user
//   cdc_drive_eligibility.cdc_drive_eligibility_read → any authenticated user
//   cdc_drive_willingness.cdc_drive_willingness_read → cdc staff OR this learner
//   learners_profiles                       → the learner's own row
// so the caller's own session is both sufficient and the safer choice: a learner
// can never see another learner's declaration, enforced by the database rather
// than by this file.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { CdcDriveEligibility, CdcWillingnessStatus } from '@/types/cdc';
import { computeIsEligible } from '@/lib/services/cdc/willingness-service';

/**
 * Lifecycle states that may be shown a drive. Mirrors the recipient filter in
 * fn_cdc_emit_drive_notification exactly — if the notification would not reach
 * them, the dashboard must not imply they can apply.
 */
const ELIGIBLE_LIFECYCLE = ['active', 'graduated'];

export interface MyCdcDrive {
  id: string;
  title: string;
  recruiter_name: string | null;
  drive_date: string | null;
  job_role_title: string | null;
  job_location: string | null;
  expected_package_lpa: number | null;
  willingness_window_close_at: string | null;
  /** The caller's own declaration, or null when they have not responded yet. */
  willingness_status: CdcWillingnessStatus | null;
}

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const empty = NextResponse.json(
    { drives: [] },
    { headers: { 'Cache-Control': 'no-store' } }
  );

  try {
    // 1. Is the caller a learner at all? Team members viewing the learner
    //    dashboard have no learner_id and simply see nothing.
    const { data: profile } = await supabase
      .from('profiles')
      .select('learner_id')
      .eq('id', user.id)
      .maybeSingle();
    const learnerId = (profile as { learner_id: string | null } | null)?.learner_id ?? null;
    if (!learnerId) return empty;

    const { data: learner } = await supabase
      .from('learners_profiles')
      .select('id, program_id, lifecycle_status')
      .eq('id', learnerId)
      .maybeSingle();
    const row = learner as
      | { id: string; program_id: string | null; lifecycle_status: string | null }
      | null;
    if (!row?.program_id) return empty;
    if (!ELIGIBLE_LIFECYCLE.includes(row.lifecycle_status ?? '')) return empty;

    // 2. Drives currently open for willingness.
    const { data: drives, error: drivesErr } = await supabase
      .from('cdc_drives')
      .select(
        'id, title, drive_date, job_role_title, job_location, expected_package_lpa, willingness_window_close_at, recruiter_id'
      )
      .eq('status', 'willingness_open')
      .order('drive_date', { ascending: true });
    if (drivesErr) throw drivesErr;
    if (!drives || drives.length === 0) return empty;

    const driveIds = drives.map((d) => (d as { id: string }).id);

    // 3. Keep only the drives whose criteria name this learner's program. A drive
    //    with no eligibility row reaches nobody by design (the state-machine guard
    //    now prevents that combination, but older drives predate the guard).
    const { data: eligibility, error: eligErr } = await supabase
      .from('cdc_drive_eligibility')
      .select('drive_id, program_ids')
      .in('drive_id', driveIds);
    if (eligErr) throw eligErr;

    // computeIsEligible is the SAME predicate the learner's willingness page uses.
    // Sharing it is the point: if this card decided eligibility on its own, it
    // could offer a drive whose page then tells the learner they are not eligible.
    const eligibleDriveIds = new Set(
      ((eligibility ?? []) as { drive_id: string; program_ids: string[] | null }[])
        .filter((e) =>
          computeIsEligible(
            { program_ids: e.program_ids ?? [] } as CdcDriveEligibility,
            row.program_id
          )
        )
        .map((e) => e.drive_id)
    );
    if (eligibleDriveIds.size === 0) return empty;

    // 4. Recruiter names + this learner's own declarations, in parallel.
    const visible = drives.filter((d) => eligibleDriveIds.has((d as { id: string }).id));
    const recruiterIds = Array.from(
      new Set(
        visible
          .map((d) => (d as { recruiter_id: string | null }).recruiter_id)
          .filter((x): x is string => !!x)
      )
    );

    const [recruitersRes, willingnessRes] = await Promise.all([
      recruiterIds.length
        ? supabase.from('cdc_recruiters').select('id, name').in('id', recruiterIds)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from('cdc_drive_willingness')
        .select('drive_id, status')
        .eq('learner_id', learnerId)
        .in('drive_id', Array.from(eligibleDriveIds)),
    ]);

    const recruiterName = new Map(
      ((recruitersRes.data ?? []) as { id: string; name: string }[]).map((r) => [r.id, r.name])
    );
    const myStatus = new Map(
      ((willingnessRes.data ?? []) as { drive_id: string; status: CdcWillingnessStatus }[]).map(
        (w) => [w.drive_id, w.status]
      )
    );

    const result: MyCdcDrive[] = visible.map((d) => {
      const drive = d as Record<string, unknown>;
      const rid = drive.recruiter_id as string | null;
      return {
        id: drive.id as string,
        title: (drive.title as string) ?? 'Campus drive',
        recruiter_name: rid ? recruiterName.get(rid) ?? null : null,
        drive_date: (drive.drive_date as string | null) ?? null,
        job_role_title: (drive.job_role_title as string | null) ?? null,
        job_location: (drive.job_location as string | null) ?? null,
        expected_package_lpa: (drive.expected_package_lpa as number | null) ?? null,
        willingness_window_close_at:
          (drive.willingness_window_close_at as string | null) ?? null,
        willingness_status: myStatus.get(drive.id as string) ?? null,
      };
    });

    return NextResponse.json(
      { drives: result },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[cdc/drives/mine] read failed:', err);
    return NextResponse.json(
      { error: 'Could not load your campus drives.' },
      { status: 500 }
    );
  }
}
