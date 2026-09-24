export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/cdc/drives/[id]/assigned
 *   ?format=json (default) | xlsx
 *   &institution_id=<uuid>                    optional
 *   &semester_order=<int>                     optional
 *   &status=willing|not_willing|pending       optional (willingness bucket)
 *   &responded=yes|no                         optional
 *   &q=<text>                                 optional (name / register no / roll no / email / mobile / learner id)
 *
 * Every learner the drive targets (institution + semester audience), with the
 * willingness answer and notification delivery state for each. Pending
 * learners are included — that is the point of the view. The summary always
 * describes the WHOLE audience; `data` is the filtered slice, and the Excel
 * export honours the same filters.
 *
 * Gate: cdc.drives.willingness.view. Profile contact (email / mobile) is
 * released only when the caller may also view learner profiles; otherwise the
 * learner's consented snapshot is the only contact source (see
 * lib/services/cdc/drive-assigned.ts).
 */

import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { CdcDriveService } from '@/lib/services/cdc/drive-service';
import { formatArrearsForExport } from '@/lib/services/cdc/academic-standing';
import {
  ASSIGNED_BUCKET_LABEL,
  ASSIGNED_NOTIFICATION_LABEL,
  applyAssignedFilters,
  buildAssignedLearners,
} from '@/lib/services/cdc/drive-assigned';
import { canMarkWillingManually, markWillingManually } from '@/lib/services/cdc/willingness-manual';
import { logActivity } from '@/lib/services/cdc/drive-day';
import type { CdcAssignedWillingnessBucket, CdcDriveAssignedResponse, CdcWillingnessStatus } from '@/types/cdc';

const VIEW_PERMISSION = 'cdc.drives.willingness.view';
const LEARNER_PROFILE_PERMISSIONS = ['learners.profiles.view', 'learners.view'];

const RAW_STATUS_LABEL: Record<CdcWillingnessStatus, string> = {
  willing: 'Willing',
  confirmed: 'Confirmed',
  withdrawn: 'Declined',
  no_show: 'No show',
};

function safeFilename(s: string): string {
  return s.replace(/[^A-Za-z0-9._ -]+/g, '_').replace(/\s+/g, '_').slice(0, 80) || 'drive';
}

function fmtIst(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '';
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    const service = createServiceRoleClient();
    const [viewRes, editRes, coordRes, ...profileRes] = await Promise.all([
      supabase.rpc('user_has_permission', { permission_name: VIEW_PERMISSION }),
      supabase.rpc('user_has_permission', { permission_name: 'cdc.drives.edit' }),
      service.from('cdc_drive_coordinators').select('id').eq('drive_id', id).eq('user_id', user.id).maybeSingle(),
      ...LEARNER_PROFILE_PERMISSIONS.map((key) => supabase.rpc('user_has_permission', { permission_name: key })),
    ]);
    // An assigned coordinator of THIS drive sees its tracker too (2026-09-23),
    // so they can mark willing learners by hand on the drive day.
    const isCoordinator = !!coordRes.data;
    if (viewRes.data !== true && !isCoordinator) {
      return NextResponse.json({ error: `Forbidden — ${VIEW_PERMISSION} required` }, { status: 403 });
    }
    // Existing learner-profile access rule decides whether profile contact goes out.
    const releaseProfileContact = profileRes.some((r) => r.data === true);

    const drive = await CdcDriveService.getDrive(isCoordinator ? service : supabase, id);
    if (!drive) return NextResponse.json({ error: 'Drive not found' }, { status: 404 });
    const manual = canMarkWillingManually(drive);
    const canMark = (editRes.data === true || isCoordinator) && manual.ok;

    const sp = request.nextUrl.searchParams;
    const format = sp.get('format') === 'xlsx' ? 'xlsx' : 'json';
    const bucketParam = sp.get('status');
    const bucket =
      bucketParam && bucketParam in ASSIGNED_BUCKET_LABEL ? (bucketParam as CdcAssignedWillingnessBucket) : null;
    const respondedParam = sp.get('responded');
    const filters = {
      institution_id: sp.get('institution_id') || null,
      semester_order: sp.get('semester_order') ? parseInt(sp.get('semester_order')!, 10) : null,
      bucket,
      responded: respondedParam === 'yes' ? true : respondedParam === 'no' ? false : null,
      q: sp.get('q') || null,
    };

    const { rows, summary } = await buildAssignedLearners(service, drive, { releaseProfileContact });
    const filtered = applyAssignedFilters(rows, filters);

    if (format === 'json') {
      const body: CdcDriveAssignedResponse = {
        data: filtered,
        total: filtered.length,
        summary,
        contact_released: releaseProfileContact,
        can_mark_willing: canMark,
        mark_blocked_reason: editRes.data === true || isCoordinator ? manual.reason : null,
      };
      return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (filtered.length === 0) {
      return NextResponse.json(
        { error: 'No learners match this drive and filter — nothing to export.' },
        { status: 404 }
      );
    }

    const sheetRows = filtered.map((r, i) => ({
      'S.No': i + 1,
      'Learner Name': r.learner_name ?? '',
      'Roll Number': r.roll_number ?? '',
      'Register Number': r.register_number ?? '',
      'MyJKKN ID': r.learner_id,
      Institution: r.institution_name ?? '',
      Department: r.department_name ?? '',
      Semester: r.semester_label ?? '',
      Email: r.email ?? '',
      'Mobile Number': r.mobile ?? '',
      'Additional Mobile Number': r.additional_mobile ?? '',
      CGPA: r.cgpa ?? '',
      'Arrears Count': r.arrears_count ?? '',
      'Arrear Details': formatArrearsForExport(r.arrears_details),
      'Willingness Status': r.willingness_status
        ? RAW_STATUS_LABEL[r.willingness_status] ?? r.willingness_status
        : ASSIGNED_BUCKET_LABEL.pending,
      'Submitted At': fmtIst(r.declared_at),
      'Notification Status': ASSIGNED_NOTIFICATION_LABEL[r.notification_state],
      'Notified At': fmtIst(r.notification_sent_at),
    }));

    const ws = XLSX.utils.json_to_sheet(sheetRows);
    ws['!cols'] = [
      { wch: 6 }, { wch: 28 }, { wch: 14 }, { wch: 16 }, { wch: 38 }, { wch: 34 }, { wch: 28 }, { wch: 12 },
      { wch: 30 }, { wch: 16 }, { wch: 22 }, { wch: 8 }, { wch: 14 }, { wch: 40 }, { wch: 18 }, { wch: 22 },
      { wch: 18 }, { wch: 22 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Assigned learners');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const filename = `${safeFilename(drive.title)}_assigned_willingness_${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[cdc/drives/[id]/assigned] GET error', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}

/**
 * POST /api/cdc/drives/[id]/assigned  { learner_ids: string[] }
 * Marks the chosen learners as Willing on their behalf (manual willingness).
 * Gate: cdc.drives.edit OR an assigned coordinator of this drive.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const service = createServiceRoleClient();
    const [{ data: canEdit }, { data: coord }] = await Promise.all([
      supabase.rpc('user_has_permission', { permission_name: 'cdc.drives.edit' }),
      service.from('cdc_drive_coordinators').select('id').eq('drive_id', id).eq('user_id', user.id).maybeSingle(),
    ]);
    const isCoordinator = !!coord;
    if (canEdit !== true && !isCoordinator) {
      return NextResponse.json({ error: 'Forbidden — cdc.drives.edit or an assigned coordinator required' }, { status: 403 });
    }

    const drive = await CdcDriveService.getDrive(service, id);
    if (!drive) return NextResponse.json({ error: 'Drive not found' }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const learnerIds = Array.isArray(body.learner_ids)
      ? (body.learner_ids as unknown[]).filter((v): v is string => typeof v === 'string')
      : [];
    if (learnerIds.length === 0) return NextResponse.json({ error: 'learner_ids is required' }, { status: 400 });

    const actorRole = canEdit === true ? 'cdc' : 'coordinator';
    const result = await markWillingManually(service, drive, learnerIds, user.id, actorRole);
    await logActivity(service, [
      {
        drive_id: id,
        actor_id: user.id,
        actor_role: actorRole,
        action: 'willingness.marked_manually',
        new_value: { learner_ids: learnerIds, ...result },
      },
    ]);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[cdc/drives/[id]/assigned] POST error', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 400 });
  }
}
