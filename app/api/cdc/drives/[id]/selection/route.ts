export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * /api/cdc/drives/[id]/selection
 *
 * GET  → { drive, rows[], summary, can_decide, decide_blocked_reason }   (cdc.drives.view)
 *        ?format=xlsx&decision=selected|waitlisted|rejected|hold|undecided&attended=1 → Excel
 * POST → { learner_ids: string[], decision: 'selected'|'waitlisted'|'rejected'|'hold'|null, remarks? }
 *                                                                        (cdc.drives.edit)
 *
 * Rows are the finalized participants with attendance, decision and current
 * documents — the single list the coordinator works from after the drive day.
 */

import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { CdcDriveService } from '@/lib/services/cdc/drive-service';
import { ATTENDANCE_LABEL } from '@/lib/services/cdc/drive-day';
import { DOCUMENT_TYPE_LABEL } from '@/lib/services/cdc/drive-documents';
import {
  SELECTION_DECISIONS,
  SELECTION_LABEL,
  canRecordDecisions,
  getSelectionView,
  recordDecisions,
} from '@/lib/services/cdc/drive-selection';
import type { CdcSelectionDecision } from '@/types/cdc';

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
    const [{ data: canView }, { data: canEdit }, { data: p1 }, { data: p2 }] = await Promise.all([
      session.rpc('user_has_permission', { permission_name: 'cdc.drives.view' }),
      session.rpc('user_has_permission', { permission_name: 'cdc.drives.edit' }),
      session.rpc('user_has_permission', { permission_name: 'learners.profiles.view' }),
      session.rpc('user_has_permission', { permission_name: 'learners.view' }),
    ]);
    if (canView !== true && canEdit !== true) return NextResponse.json({ error: 'Forbidden — cdc.drives.view required' }, { status: 403 });

    const service = createServiceRoleClient();
    const drive = await CdcDriveService.getDrive(service, id);
    if (!drive) return NextResponse.json({ error: 'Drive not found' }, { status: 404 });

    const { rows, summary } = await getSelectionView(service, drive, { releaseProfileContact: p1 === true || p2 === true });
    const gate = canRecordDecisions(drive);
    const sp = request.nextUrl.searchParams;

    if (sp.get('format') !== 'xlsx') {
      const { data: recruiter } = await service.from('cdc_recruiters').select('name').eq('id', drive.recruiter_id).maybeSingle();
      return NextResponse.json(
        {
          drive: {
            id: drive.id,
            title: drive.title,
            status: drive.status,
            drive_date: drive.drive_date,
            job_role_title: drive.job_role_title,
            expected_package_lpa: drive.expected_package_lpa,
            recruiter_name: (recruiter?.name as string | undefined) ?? null,
            participants_finalized_at: drive.participants_finalized_at ?? null,
          },
          rows,
          summary,
          can_decide: canEdit === true && gate.ok,
          decide_blocked_reason: canEdit === true ? gate.reason : 'You need cdc.drives.edit to record decisions.',
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const filter = sp.get('decision');
    const attendedOnly = sp.get('attended') === '1';
    const filtered = rows.filter((r) => {
      if (attendedOnly && r.attendance_status !== 'present' && r.attendance_status !== 'late') return false;
      return !filter ? true : filter === 'undecided' ? !r.decision : r.decision === filter;
    });
    if (filtered.length === 0) return NextResponse.json({ error: 'No learners match this filter — nothing to export.' }, { status: 404 });

    const ws = XLSX.utils.json_to_sheet(
      filtered.map((r, i) => ({
        'S.No': i + 1,
        'Register No': r.register_number ?? '',
        'Learner Name': r.learner_name ?? '',
        Institution: r.institution_name ?? '',
        Department: r.department_name ?? '',
        Semester: r.semester_label ?? '',
        Email: r.email ?? '',
        Mobile: r.mobile ?? '',
        Attendance: r.attendance_status ? ATTENDANCE_LABEL[r.attendance_status] : 'Not marked',
        Decision: r.decision ? SELECTION_LABEL[r.decision] : 'Undecided',
        'Decision Date': r.decided_at ? new Date(r.decided_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '',
        Remarks: r.decision_remarks ?? '',
        Documents: r.documents.map((d) => `${DOCUMENT_TYPE_LABEL[d.document_type]} v${d.version}`).join('; '),
      }))
    );
    ws['!cols'] = [{ wch: 6 }, { wch: 16 }, { wch: 28 }, { wch: 34 }, { wch: 26 }, { wch: 12 }, { wch: 30 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 22 }, { wch: 30 }, { wch: 40 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Selection');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${safeFilename(drive.title)}_selection${filter ? `_${filter}` : ''}_${new Date().toISOString().slice(0, 10)}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[cdc/drives/[id]/selection] GET error', err);
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
    const { data: canEdit } = await session.rpc('user_has_permission', { permission_name: 'cdc.drives.edit' });
    if (canEdit !== true) return NextResponse.json({ error: 'Forbidden — cdc.drives.edit required' }, { status: 403 });

    const service = createServiceRoleClient();
    const drive = await CdcDriveService.getDrive(service, id);
    if (!drive) return NextResponse.json({ error: 'Drive not found' }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const decision = body.decision === null ? null : (body.decision as CdcSelectionDecision);
    if (decision !== null && !SELECTION_DECISIONS.includes(decision)) {
      return NextResponse.json({ error: `decision must be one of ${SELECTION_DECISIONS.join(', ')} or null` }, { status: 400 });
    }
    const ids = Array.isArray(body.learner_ids) ? body.learner_ids.filter((v: unknown): v is string => typeof v === 'string') : [];
    const remarks = typeof body.remarks === 'string' && body.remarks.trim() ? body.remarks.trim().slice(0, 500) : null;
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

    const result = await recordDecisions(service, drive, ids, decision, remarks, { id: user.id, ip });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[cdc/drives/[id]/selection] POST error', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 400 });
  }
}
