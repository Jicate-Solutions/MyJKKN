export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * /api/cdc/drives/[id]/attendance
 *
 * GET  → { drive, rows[], summary, access }
 *        ?format=xlsx&status=present|absent|late|excused|not_attended|unmarked  → Excel
 * POST → { learner_ids: string[], status, remarks? }
 *        status = null clears a wrong mark (back to "Not marked"), audited.
 *
 * The roster is the FINALIZED participant list — nobody types a learner in.
 *
 * Access: cdc.drives.view reads; an ASSIGNED COORDINATOR of this drive reads
 * and marks without holding any CDC permission. Marking is allowed for
 * coordinators while the drive is Participants Finalized / Drive In Progress;
 * after results only cdc.drives.edit may correct. Every change is audited.
 */

import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { CdcDriveService } from '@/lib/services/cdc/drive-service';
import {
  ATTENDANCE_LABEL,
  ATTENDANCE_STATUSES,
  clearAttendance,
  getAttendanceRoster,
  markAttendance,
  resolveDriveDayAccess,
} from '@/lib/services/cdc/drive-day';
import type { CdcDriveAttendanceStatus } from '@/types/cdc';

function safeFilename(s: string): string {
  return s.replace(/[^A-Za-z0-9._ -]+/g, '_').replace(/\s+/g, '_').slice(0, 80) || 'drive';
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const session = await createClient();
    const {
      data: { user },
    } = await session.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const service = createServiceRoleClient();
    const drive = await CdcDriveService.getDrive(service, id);
    if (!drive) return NextResponse.json({ error: 'Drive not found' }, { status: 404 });

    const access = await resolveDriveDayAccess(session, service, user.id, drive);
    if (!access.canView && !access.isCoordinator) {
      return NextResponse.json({ error: 'Forbidden — you are not assigned to this drive' }, { status: 403 });
    }

    const [{ data: a }, { data: b }] = await Promise.all([
      session.rpc('user_has_permission', { permission_name: 'learners.profiles.view' }),
      session.rpc('user_has_permission', { permission_name: 'learners.view' }),
    ]);
    const { rows, summary, preview } = await getAttendanceRoster(service, drive, { releaseProfileContact: a === true || b === true });

    const sp = request.nextUrl.searchParams;
    if (sp.get('format') !== 'xlsx') {
      return NextResponse.json(
        {
          drive: {
            id: drive.id,
            title: drive.title,
            status: drive.status,
            drive_date: drive.drive_date,
            venue_label: drive.venue_label,
            participants_finalized_at: drive.participants_finalized_at ?? null,
          },
          rows,
          summary,
          preview,
          access,
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const statusFilter = sp.get('status');
    const instFilter = sp.get('institution_id');
    const programFilter = sp.get('program_id');
    const semFilter = sp.get('semester_order');
    const filtered = rows.filter((r) => {
      if (statusFilter && (statusFilter === 'unmarked' ? !!r.attendance_status : r.attendance_status !== statusFilter)) return false;
      if (instFilter && r.institution_id !== instFilter) return false;
      if (programFilter && r.program_id !== programFilter) return false;
      if (semFilter && String(r.semester_order ?? '') !== semFilter) return false;
      return true;
    });
    if (filtered.length === 0) {
      return NextResponse.json({ error: 'No participants match this filter — nothing to export.' }, { status: 404 });
    }

    const sheetRows = filtered.map((r, i) => ({
      'S.No': i + 1,
      'Register No': r.register_number ?? '',
      'Learner Name': r.learner_name ?? '',
      Institution: r.institution_name ?? '',
      Program: r.program_name ?? '',
      Department: r.department_name ?? '',
      Semester: r.semester_label ?? '',
      Willingness: r.bucket === 'willing' ? 'Yes' : r.bucket === 'not_willing' ? 'No' : 'Pending',
      Attendance: r.attendance_status ? ATTENDANCE_LABEL[r.attendance_status] : 'Not marked',
      'Marked At': r.attendance_marked_at ? new Date(r.attendance_marked_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '',
      'Marked By': r.attendance_marked_by ?? '',
      Remarks: r.attendance_remarks ?? '',
    }));
    const ws = XLSX.utils.json_to_sheet(sheetRows);
    ws['!cols'] = [{ wch: 6 }, { wch: 16 }, { wch: 28 }, { wch: 34 }, { wch: 28 }, { wch: 26 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 22 }, { wch: 24 }, { wch: 30 }];
    const summarySheet = XLSX.utils.json_to_sheet([
      { Metric: 'Drive', Value: drive.title },
      { Metric: 'Drive date', Value: drive.drive_date ?? '' },
      { Metric: 'Total participants', Value: summary.total },
      { Metric: 'Present', Value: summary.present },
      { Metric: 'Absent', Value: summary.absent },
      { Metric: 'Late', Value: summary.late },
      { Metric: 'Excused', Value: summary.excused },
      { Metric: 'Not attended', Value: summary.not_attended },
      { Metric: 'Not marked', Value: summary.unmarked },
    ]);
    summarySheet['!cols'] = [{ wch: 22 }, { wch: 40 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const suffix = statusFilter ? `_${statusFilter}` : '';
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${safeFilename(drive.title)}_attendance${suffix}_${new Date().toISOString().slice(0, 10)}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[cdc/drives/[id]/attendance] GET error', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const session = await createClient();
    const {
      data: { user },
    } = await session.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const service = createServiceRoleClient();
    const drive = await CdcDriveService.getDrive(service, id);
    if (!drive) return NextResponse.json({ error: 'Drive not found' }, { status: 404 });

    const access = await resolveDriveDayAccess(session, service, user.id, drive);
    if (!access.canMark) {
      return NextResponse.json({ error: access.markBlockedReason ?? 'You cannot mark attendance for this drive.' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const clearing = body.status === null;
    const status = body.status as CdcDriveAttendanceStatus;
    if (!clearing && !ATTENDANCE_STATUSES.includes(status)) {
      return NextResponse.json({ error: `status must be one of ${ATTENDANCE_STATUSES.join(', ')} or null` }, { status: 400 });
    }
    const ids = Array.isArray(body.learner_ids) ? body.learner_ids.filter((v: unknown): v is string => typeof v === 'string') : [];
    const remarks = typeof body.remarks === 'string' && body.remarks.trim() ? body.remarks.trim().slice(0, 500) : null;

    const { data: profile } = await service.from('profiles').select('role').eq('id', user.id).maybeSingle();
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

    const actor = {
      id: user.id,
      role: access.canManage ? ((profile?.role as string | null) ?? 'cdc') : 'drive_coordinator',
      ip,
    };
    if (clearing) {
      const cleared = await clearAttendance(service, drive, ids, remarks, actor);
      return NextResponse.json({ marked: 0, cleared: cleared.cleared });
    }
    const result = await markAttendance(service, drive, ids, status, remarks, actor);
    return NextResponse.json({ ...result, cleared: 0 });
  } catch (err) {
    console.error('[cdc/drives/[id]/attendance] POST error', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 400 });
  }
}
