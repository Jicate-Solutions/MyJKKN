export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/cdc/drives/clash-check
 *   ?drive_date=YYYY-MM-DD        required — no date means nothing can clash
 *   &drive_start_time=HH:MM       optional
 *   &drive_end_time=HH:MM         optional
 *   &venue_label=<free text>      optional
 *   &exclude_drive_id=<uuid>      the drive being edited, so it never clashes with itself
 *
 * Tells a CDC coordinator, BEFORE they save, that the room is already booked
 * that day and how many learners have already said yes to another drive on the
 * same date. A warning, never a block (Director ruling, 2026-09-18).
 *
 * Gate: cdc.drives.view. Reads run on the service-role client AFTER the gate —
 * same reason as the responses export: a drive's audience is multi-college by
 * design, so a coordinator's own RLS scope would silently hide the very clash
 * they need to see. Nothing learner-identifying leaves this route: only other
 * drives' titles, venues, times and counts.
 */

import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  EMPTY_CLASH_REPORT,
  findDriveClashes,
  type ClashOtherDrive,
  type DriveClashReport,
} from '@/lib/services/cdc/drive-clash';

export interface DriveClashCheckResponse extends DriveClashReport {
  /**
   * Learners who have already said yes to the drive being edited. The
   * late-clash half: moving a drive's date moves these learners with it.
   * Always 0 when creating.
   */
  own_willing_count: number;
}

/** Willingness rows that mean "this learner has said yes". */
const SAID_YES: readonly string[] = ['willing', 'confirmed'];

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: canView } = await supabase.rpc('user_has_permission', {
      permission_name: 'cdc.drives.view',
    });
    if (canView !== true) {
      return NextResponse.json({ error: 'Forbidden — cdc.drives.view required' }, { status: 403 });
    }

    const url = new URL(request.url);
    const driveDate = url.searchParams.get('drive_date');
    const excludeId = url.searchParams.get('exclude_drive_id');

    const empty: DriveClashCheckResponse = { ...EMPTY_CLASH_REPORT, own_willing_count: 0 };
    if (!driveDate || !/^\d{4}-\d{2}-\d{2}$/.test(driveDate)) {
      return NextResponse.json(empty);
    }

    const service = createServiceRoleClient();

    const { data: driveRows, error: drivesError } = await service
      .from('cdc_drives')
      .select('id, title, status, drive_date, drive_start_time, drive_end_time, venue_label')
      .eq('drive_date', driveDate);
    if (drivesError) throw drivesError;

    const rows = driveRows ?? [];
    const otherIds = rows.map((r) => r.id).filter((id) => id !== excludeId);

    // One read for every drive that day, plus the drive being edited, so the
    // late-clash count comes back in the same round trip.
    const willingnessIds = excludeId ? [...otherIds, excludeId] : otherIds;
    const willingByDrive = new Map<string, string[]>();
    if (willingnessIds.length > 0) {
      const { data: willingRows, error: willingError } = await service
        .from('cdc_drive_willingness')
        .select('drive_id, learner_id')
        .in('drive_id', willingnessIds)
        .in('status', SAID_YES);
      if (willingError) throw willingError;
      for (const row of willingRows ?? []) {
        const list = willingByDrive.get(row.drive_id) ?? [];
        list.push(row.learner_id);
        willingByDrive.set(row.drive_id, list);
      }
    }

    const others: ClashOtherDrive[] = rows.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      drive_date: r.drive_date,
      drive_start_time: r.drive_start_time,
      drive_end_time: r.drive_end_time,
      venue_label: r.venue_label,
      willing_learner_ids: willingByDrive.get(r.id) ?? [],
    }));

    const report = findDriveClashes(
      {
        id: excludeId,
        drive_date: driveDate,
        drive_start_time: url.searchParams.get('drive_start_time'),
        drive_end_time: url.searchParams.get('drive_end_time'),
        venue_label: url.searchParams.get('venue_label'),
      },
      others
    );

    const response: DriveClashCheckResponse = {
      ...report,
      own_willing_count: excludeId ? (willingByDrive.get(excludeId)?.length ?? 0) : 0,
    };
    return NextResponse.json(response);
  } catch (err) {
    console.error('[cdc/drives/clash-check] GET error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
