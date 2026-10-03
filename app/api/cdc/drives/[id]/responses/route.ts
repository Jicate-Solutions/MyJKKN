export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/cdc/drives/[id]/responses
 *   ?format=json (default) | xlsx
 *   &institution_id=<uuid>   optional filter
 *   &semester_order=<int>    optional filter
 *   &status=willing|withdrawn|confirmed|no_show   optional (default: all)
 *
 * Willingness responses for ONE drive — the "View Responses" table and the
 * "Download Excel" action on the drive page. Learner name / email / mobile /
 * CGPA / arrears come from the snapshot the learner permitted at submission
 * (cdc_drive_willingness.*, data_consent_at). Rows without consent (a decline,
 * or a legacy row) export only the identity columns that CDC could already see
 * on the drive: no contact or academic figures.
 *
 * Gate: cdc.drives.view. Reads run on the service-role client AFTER the gate
 * so a cross-college coordinator's RLS scope does not silently drop rows —
 * the drive's audience is multi-college by design.
 *
 * POST /api/cdc/drives/[id]/responses
 *   { action: 'reopen', willingness_id }
 *
 * Ruling B (Director, 2026-09-18): ANY CDC team member may reopen ONE learner's
 * DECLINED answer, up to and including the drive day — once that day has passed
 * nobody can. Gated on cdc.drives.view, the same permission that puts this
 * screen in front of a team member at all, because the ruling says "any CDC team
 * member" rather than "the drive's editor". The rule itself lives in
 * CdcWillingnessService.reopenDeclinedResponse; the reopening is recorded as one
 * entry in the row's existing willingness_audit jsonb, naming the actor.
 */

import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { CdcDriveService } from '@/lib/services/cdc/drive-service';
import { CdcWillingnessService, isReopenedForLearner } from '@/lib/services/cdc/willingness-service';
import { formatArrearsForExport } from '@/lib/services/cdc/academic-standing';
import type { CdcDriveResponseRow, CdcWillingnessStatus } from '@/types/cdc';

const STATUS_LABEL: Record<CdcWillingnessStatus, string> = {
  willing: 'Willing',
  confirmed: 'Confirmed',
  withdrawn: 'Declined',
  no_show: 'No show',
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function safeFilename(s: string): string {
  return s.replace(/[^A-Za-z0-9._ -]+/g, '_').replace(/\s+/g, '_').slice(0, 80) || 'drive';
}

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

    const sp = request.nextUrl.searchParams;
    const format = sp.get('format') === 'xlsx' ? 'xlsx' : 'json';
    const institutionFilter = sp.get('institution_id') || null;
    const semesterFilter = sp.get('semester_order') ? parseInt(sp.get('semester_order')!, 10) : null;
    const statusFilter = sp.get('status') as CdcWillingnessStatus | null;

    const service = createServiceRoleClient();

    let wq = service
      .from('cdc_drive_willingness')
      .select('*')
      .eq('drive_id', id)
      .order('declared_at', { ascending: true })
      .limit(20000);
    if (statusFilter && statusFilter in STATUS_LABEL) wq = wq.eq('status', statusFilter);
    const { data: rowsRaw, error: wErr } = await wq;
    if (wErr) throw wErr;
    const rows = (rowsRaw ?? []) as Array<Record<string, unknown>>;

    // Learner → institution / department / semester (current, for grouping).
    const learnerIds = Array.from(new Set(rows.map((r) => r.learner_id as string)));
    const learners = new Map<string, Record<string, unknown>>();
    for (const ids of chunk(learnerIds, 200)) {
      const { data, error } = await service
        .from('learners_profiles')
        .select('id, first_name, last_name, register_number, institution_id, department_id, semester_id, student_email, college_email, student_mobile')
        .in('id', ids);
      if (error) throw error;
      (data ?? []).forEach((l) => learners.set(l.id as string, l as Record<string, unknown>));
    }

    const instIds = Array.from(new Set(Array.from(learners.values()).map((l) => l.institution_id as string).filter(Boolean)));
    const deptIds = Array.from(new Set(Array.from(learners.values()).map((l) => l.department_id as string).filter(Boolean)));
    const semIds = Array.from(new Set(Array.from(learners.values()).map((l) => l.semester_id as string).filter(Boolean)));

    const [instRes, deptRes, semRes] = await Promise.all([
      instIds.length ? service.from('institutions').select('id, name').in('id', instIds) : Promise.resolve({ data: [], error: null }),
      deptIds.length ? service.from('departments').select('id, department_name').in('id', deptIds) : Promise.resolve({ data: [], error: null }),
      semIds.length ? service.from('semesters').select('id, semester_name, semester_order').in('id', semIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (instRes.error) throw instRes.error;
    if (deptRes.error) throw deptRes.error;
    if (semRes.error) throw semRes.error;

    const instName = new Map((instRes.data ?? []).map((r: any) => [r.id as string, r.name as string]));
    const deptName = new Map((deptRes.data ?? []).map((r: any) => [r.id as string, r.department_name as string]));
    const semInfo = new Map(
      (semRes.data ?? []).map((r: any) => [r.id as string, { name: r.semester_name as string | null, order: r.semester_order as number | null }])
    );

    const out: CdcDriveResponseRow[] = [];
    for (const r of rows) {
      const l = learners.get(r.learner_id as string);
      const sem = l?.semester_id ? semInfo.get(l.semester_id as string) : undefined;
      if (institutionFilter && (l?.institution_id as string | undefined) !== institutionFilter) continue;
      if (semesterFilter != null && sem?.order !== semesterFilter) continue;

      const consented = !!r.data_consent_at;
      const fallbackName = l
        ? [l.first_name, l.last_name].filter((v) => typeof v === 'string' && v.trim()).join(' ')
        : null;

      out.push({
        willingness_id: r.id as string,
        learner_id: r.learner_id as string,
        learner_name: (r.learner_name as string | null) || fallbackName || null,
        register_number: (l?.register_number as string | null) ?? null,
        institution_name: l?.institution_id ? instName.get(l.institution_id as string) ?? null : null,
        department_name: l?.department_id ? deptName.get(l.department_id as string) ?? null : null,
        semester_label: sem ? (sem.order != null ? `Semester ${sem.order}` : sem.name) : null,
        // Contact + academic figures only with the learner's recorded consent.
        email: consented ? ((r.learner_email as string | null) ?? null) : null,
        mobile: consented ? ((r.learner_mobile as string | null) ?? null) : null,
        additional_mobile: consented ? ((r.additional_mobile as string | null) ?? null) : null,
        cgpa: consented ? ((r.cgpa as number | null) ?? null) : null,
        arrears_count: consented ? ((r.arrears_count as number | null) ?? null) : null,
        arrears_details: consented ? ((r.arrears_details as CdcDriveResponseRow['arrears_details']) ?? null) : null,
        academic_source: (r.academic_source as string | null) ?? null,
        data_consent_at: (r.data_consent_at as string | null) ?? null,
        status: r.status as CdcWillingnessStatus,
        declared_at: r.declared_at as string,
        // A standing CDC reopening, read exactly as the learner's page reads it,
        // so the team sees "Reopened" instead of a bare "Declined" with a live
        // Reopen button that would only reopen it again.
        reopened: isReopenedForLearner(
          {
            status: r.status as CdcWillingnessStatus,
            willingness_audit: (r.willingness_audit as unknown[] | null) ?? [],
          },
          drive
        ),
      });
    }

    if (format === 'json') {
      return NextResponse.json(
        { data: out, total: out.length },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (out.length === 0) {
      return NextResponse.json(
        { error: 'No willingness submissions match this drive and filter yet — nothing to export.' },
        { status: 404 }
      );
    }

    const sheetRows = out.map((r, i) => ({
      'S.No': i + 1,
      'Learner Name': r.learner_name ?? '',
      'Register Number': r.register_number ?? '',
      Institution: r.institution_name ?? '',
      Department: r.department_name ?? '',
      Semester: r.semester_label ?? '',
      Email: r.email ?? '',
      'Mobile Number': r.mobile ?? '',
      'Additional Mobile': r.additional_mobile ?? '',
      CGPA: r.cgpa ?? '',
      'Arrears Count': r.arrears_count ?? '',
      'Arrear Details': formatArrearsForExport(r.arrears_details),
      'Willingness Status': STATUS_LABEL[r.status] ?? r.status,
      'Data Permission': r.data_consent_at ? 'Granted' : 'Not granted',
      'Submitted At': new Date(r.declared_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    }));

    const ws = XLSX.utils.json_to_sheet(sheetRows);
    ws['!cols'] = [
      { wch: 6 }, { wch: 28 }, { wch: 16 }, { wch: 34 }, { wch: 28 }, { wch: 12 },
      { wch: 30 }, { wch: 16 }, { wch: 18 }, { wch: 8 }, { wch: 14 }, { wch: 40 },
      { wch: 18 }, { wch: 16 }, { wch: 22 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Willingness');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const filename = `${safeFilename(drive.title)}_willingness_${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[cdc/drives/[id]/responses] GET error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * Reopen ONE learner's declined answer (Ruling B). Body: { action: 'reopen',
 * willingness_id }. Refused by the service once the drive day has passed (the
 * drive day itself is allowed); a refusal is a 400 carrying the plain-English
 * reason, never a silent no-op.
 */
export async function POST(
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

    const body = await request.json().catch(() => ({}));
    if (body.action !== 'reopen') {
      return NextResponse.json({ error: 'action must be "reopen"' }, { status: 400 });
    }
    const willingnessId = typeof body.willingness_id === 'string' ? body.willingness_id : '';
    if (!willingnessId) {
      return NextResponse.json({ error: 'willingness_id is required' }, { status: 400 });
    }

    // Same reason the GET reads on the service role: a drive's audience is
    // multi-college, so a coordinator's own RLS scope can hide the very row the
    // gate just said they may act on.
    const service = createServiceRoleClient();
    const updated = await CdcWillingnessService.reopenDeclinedResponse(
      service,
      id,
      willingnessId,
      user.id
    );
    return NextResponse.json({ data: updated }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[cdc/drives/[id]/responses] POST error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 400 }
    );
  }
}
