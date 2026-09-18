export const dynamic = 'force-dynamic';

/**
 * Drive attendance — who actually turned up.
 *
 * GET   /api/cdc/drives/[id]/attendance?round_no=1
 *         → the roster: every learner who declared willing / confirmed for this
 *           drive, plus everyone who declined (flagged `declined: true`, listed
 *           last, markable — Director ruling 2026-09-18 "let them be marked"),
 *           plus whatever attendance each already carries for that round, plus
 *           the marked / unmarked counts.
 * POST  /api/cdc/drives/[id]/attendance
 * PATCH /api/cdc/drives/[id]/attendance
 *         → { round_no?, round_type?, marks: [{ learner_id, attended, no_show_reason? }] }
 *           saves marks. POST and PATCH do the same thing: the write is an upsert on
 *           (drive_id, learner_id, round_no), so saving one learner and saving the
 *           whole screen are the same operation.
 *
 * Auth shape copied from the neighbouring drive routes, not invented here:
 *   GET   gates on cdc.drives.view  (same as /responses)
 *   write gates on cdc.drives.edit  (same as PATCH /api/cdc/drives/[id])
 * RLS on cdc_drive_attendance (is_cdc_staff) still applies to the write, which
 * runs on the caller's own client — see lib/services/cdc/attendance-service.ts.
 */

import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { CdcDriveService } from '@/lib/services/cdc/drive-service';
import {
  getDriveAttendanceRoster,
  normaliseRoundType,
  saveDriveAttendance,
  type CdcAttendanceMarkInput,
} from '@/lib/services/cdc/attendance-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await params;
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

    const drive = await CdcDriveService.getDrive(supabase, id);
    if (!drive) return NextResponse.json({ error: 'Drive not found' }, { status: 404 });

    // Service-role read AFTER the gate: a drive's audience is multi-college by
    // design, and a coordinator's own RLS scope would silently drop rows.
    // The roster the service returns includes declined learners; the write path
    // below needs no matching change, because cdc_drive_attendance has no
    // constraint tying a mark to the learner's willingness state.
    const roster = await getDriveAttendanceRoster(
      createServiceRoleClient(),
      id,
      request.nextUrl.searchParams.get('round_no')
    );

    return NextResponse.json(roster, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[cdc/drives/[id]/attendance] GET error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

async function handleSave(
  request: NextRequest,
  params: Promise<{ id: string }>
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: canEdit } = await supabase.rpc('user_has_permission', {
    permission_name: 'cdc.drives.edit',
  });
  if (canEdit !== true) {
    return NextResponse.json({ error: 'Forbidden — cdc.drives.edit required' }, { status: 403 });
  }

  const drive = await CdcDriveService.getDrive(supabase, id);
  if (!drive) return NextResponse.json({ error: 'Drive not found' }, { status: 404 });

  const body = (await request.json().catch(() => null)) as {
    round_no?: number | null;
    round_type?: string | null;
    marks?: CdcAttendanceMarkInput[];
  } | null;
  if (!body || typeof body !== 'object' || !Array.isArray(body.marks)) {
    return NextResponse.json(
      { error: 'Send { marks: [{ learner_id, attended, no_show_reason? }] }.' },
      { status: 400 }
    );
  }

  // The write runs on the caller's client so is_cdc_staff() is a real second
  // gate, and marked_by can only ever be the person actually signed in.
  const result = await saveDriveAttendance(
    supabase,
    id,
    {
      round_no: body.round_no ?? null,
      round_type: normaliseRoundType(body.round_type),
      marks: body.marks,
    },
    user.id
  );

  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    return await handleSave(request, params);
  } catch (err) {
    console.error('[cdc/drives/[id]/attendance] POST error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 400 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    return await handleSave(request, params);
  } catch (err) {
    console.error('[cdc/drives/[id]/attendance] PATCH error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 400 }
    );
  }
}
