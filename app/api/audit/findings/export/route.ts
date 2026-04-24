export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/audit/findings/export
// Streams a CSV attachment of audit findings matching the provided filters.
//
// Query params (all optional):
//   cycle_id         — uuid, filter to one audit cycle
//   parameter_code   — filter to one catalog parameter
//   institution_id   — filter to one institution
//   status           — service_requests.status enum value
//   severity         — red | yellow | green
//   owner_id         — uuid, matches requester_id
//   q                — free-text search across notes / request_number / parameter_code
//
// Auth: session cookie required. Permission `audit.finding.view` OR super_admin.
// RLS on service_requests already scopes result set by role; we redundantly
// gate via user_has_permission so we fail fast before CSV assembly.
//
// Spec: specs/myjkkn-audit-workflow-sprint-01-plan.md §T4 (CSV export companion
// to paginated discovery).

import { NextResponse, connection } from 'next/server';
import { createServerSupabaseClient, getAuthSession } from '@/lib/supabase/server';
import type { AuditFindingFormData, FindingSeverity } from '@/lib/types/audit';

// ---------------------------------------------------------------------------
// CSV escaping — server-side, no dependency on lib/utils/csv-export (which
// targets the browser via URL.createObjectURL). RFC 4180 compliant with an
// anti-CSV-injection guard on the leading character.
// ---------------------------------------------------------------------------
function escapeCsvField(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  // Anti-injection: any field starting with =, +, -, @, TAB, CR gets prefixed
  // with a single quote so spreadsheet apps don't evaluate it as a formula.
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsvRow(values: Array<string | number | boolean | null | undefined>): string {
  return values.map(escapeCsvField).join(',');
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

interface FindingJoinRow {
  id: string;
  request_number: string | null;
  status: string;
  institution_id: string;
  requester_id: string;
  submitted_at: string | null;
  closed_at: string | null;
  form_data: AuditFindingFormData | null;
  institutions: { id: string; name: string | null } | null;
  requester: { id: string; email: string | null } | null;
}

export async function GET(request: Request) {
  await connection();

  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createServerSupabaseClient();

    // Permission gate — super_admin OR audit.finding.view.
    const [superAdminRes, permRes] = await Promise.all([
      (supabase as any).rpc('is_super_admin'),
      (supabase as any).rpc('user_has_permission', {
        permission_name: 'audit.finding.view',
      }),
    ]);
    const isSuperAdmin = superAdminRes.data === true;
    const hasPerm = permRes.data === true;
    if (!isSuperAdmin && !hasPerm) {
      return NextResponse.json(
        { error: 'Forbidden: audit.finding.view permission required' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const cycleId = searchParams.get('cycle_id');
    const parameterCode = searchParams.get('parameter_code');
    const institutionId = searchParams.get('institution_id');
    const status = searchParams.get('status');
    const severity = searchParams.get('severity') as FindingSeverity | null;
    const ownerId = searchParams.get('owner_id');
    const q = searchParams.get('q');

    // Resolve audit_finding service_type_id first (keeps the main query simple).
    const { data: stRow, error: stErr } = await (supabase as any)
      .from('service_types')
      .select('id')
      .eq('slug', 'audit_finding')
      .single();
    if (stErr || !stRow) {
      return NextResponse.json(
        { error: 'audit_finding service_type not found — seeds not applied' },
        { status: 500 }
      );
    }
    const serviceTypeId = stRow.id as string;

    // Build the main query with inline joins. We use left joins (the `!left`
    // hint is implicit here since we don't specify `!inner`) so a missing
    // institution/profile doesn't silently drop a finding row.
    let query = (supabase as any)
      .from('service_requests')
      .select(
        `
        id,
        request_number,
        status,
        institution_id,
        requester_id,
        submitted_at,
        closed_at,
        form_data,
        institutions:institution_id ( id, name ),
        requester:requester_id ( id, email )
      `
      )
      .eq('service_type_id', serviceTypeId)
      .order('created_at', { ascending: false })
      .limit(5000); // hard safety ceiling; spec T4 export target is bounded

    if (cycleId) {
      query = query.eq('form_data->>audit_cycle_id', cycleId);
    }
    if (parameterCode) {
      query = query.eq('form_data->>parameter_code', parameterCode);
    }
    if (severity && (severity === 'red' || severity === 'yellow' || severity === 'green')) {
      query = query.eq('form_data->>severity', severity);
    }
    if (status) {
      query = query.eq('status', status);
    }
    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }
    if (ownerId) {
      query = query.eq('requester_id', ownerId);
    }
    if (q && q.trim()) {
      const like = `%${q.trim()}%`;
      // OR across request_number and the JSONB notes/parameter_code fields.
      query = query.or(
        `request_number.ilike.${like},form_data->>parameter_code.ilike.${like},form_data->>notes.ilike.${like}`
      );
    }

    const { data, error } = await query;
    if (error) {
      console.error('[audit/findings/export] query error:', error);
      return NextResponse.json({ error: error.message ?? 'Query failed' }, { status: 500 });
    }

    const rows = (data ?? []) as FindingJoinRow[];

    // Collect unique cycle_ids + parameter_codes from the result set so we can
    // do a single follow-up fetch for cycle_name + parameter_name.
    const cycleIds = new Set<string>();
    const paramCodes = new Set<string>();
    for (const r of rows) {
      if (r.form_data?.audit_cycle_id) cycleIds.add(r.form_data.audit_cycle_id);
      if (r.form_data?.parameter_code) paramCodes.add(r.form_data.parameter_code);
    }

    const [cyclesRes, paramsRes] = await Promise.all([
      cycleIds.size > 0
        ? (supabase as any)
            .from('audit_cycles')
            .select('id, name')
            .in('id', Array.from(cycleIds))
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }>, error: null }),
      paramCodes.size > 0
        ? (supabase as any)
            .from('audit_parameter_catalog')
            .select('code, name, institution_id')
            .in('code', Array.from(paramCodes))
        : Promise.resolve({
            data: [] as Array<{ code: string; name: string; institution_id: string | null }>,
            error: null,
          }),
    ]);

    const cycleNameById = new Map<string, string>();
    for (const c of (cyclesRes.data ?? []) as Array<{ id: string; name: string }>) {
      cycleNameById.set(c.id, c.name);
    }
    // Parameter names: prefer the system default row (institution_id IS NULL) — the
    // CSV is cross-institution, so showing a single institution's override name
    // would be confusing. A per-row precise resolution would require knowing
    // each finding's institution; we keep the name lookup coarse but correct.
    const paramNameByCode = new Map<string, string>();
    for (const p of (paramsRes.data ?? []) as Array<{
      code: string;
      name: string;
      institution_id: string | null;
    }>) {
      // Take system default first; only overwrite if we don't have a value yet.
      if (!paramNameByCode.has(p.code) || p.institution_id === null) {
        paramNameByCode.set(p.code, p.name);
      }
    }

    // Assemble CSV
    const header = [
      'request_number',
      'cycle_name',
      'parameter_code',
      'parameter_name',
      'severity',
      'status',
      'institution_name',
      'owner_email',
      'opened_at',
      'closed_at',
      'resolution',
      'evidence_count',
    ];
    const lines: string[] = [toCsvRow(header)];

    for (const r of rows) {
      const fd = r.form_data ?? ({} as AuditFindingFormData);
      const cycleName = fd.audit_cycle_id ? cycleNameById.get(fd.audit_cycle_id) ?? '' : '';
      const paramName = fd.parameter_code ? paramNameByCode.get(fd.parameter_code) ?? '' : '';
      const evidenceCount = Array.isArray(fd.evidence_uploaded)
        ? fd.evidence_uploaded.length
        : 0;

      lines.push(
        toCsvRow([
          r.request_number ?? r.id.slice(0, 8),
          cycleName,
          fd.parameter_code ?? '',
          paramName,
          fd.severity ?? '',
          r.status ?? '',
          r.institutions?.name ?? '',
          r.requester?.email ?? '',
          r.submitted_at ?? '',
          r.closed_at ?? '',
          fd.resolution ?? '',
          evidenceCount,
        ])
      );
    }

    // UTF-8 BOM so Excel opens the file with correct encoding. \r\n line
    // endings per RFC 4180.
    const BOM = '﻿';
    const csv = BOM + lines.join('\r\n') + '\r\n';

    const filename = `audit-findings-${todayIsoDate()}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('[audit/findings/export] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
