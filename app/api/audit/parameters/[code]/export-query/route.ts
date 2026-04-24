export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/audit/parameters/[code]/export-query
// Body: { cycle_id: string; institution_id: string }
// Response: text/csv attachment — the full result of the parameter's saved
//           discovery_query_sql for the given cycle × institution.
//
// Auth: session cookie required. Permission `audit.parameter.view` OR super_admin.
// The DB RPC audit_execute_discovery_query is SECURITY DEFINER and re-checks
// the same permission; this API-side check is fast-fail + defence-in-depth.
//
// Streaming strategy: we call AuditDiscoveryService.runQuery in a loop,
// emitting CSV chunks per page (up to the service's MAX_PAGE_SIZE=100 per
// call). This keeps memory bounded even on large result sets and lets the
// browser start receiving the download immediately.
//
// Spec: specs/myjkkn-audit-workflow-sprint-01-plan.md §T4 (companion to the
// paginated run-query endpoint).

import { NextResponse, connection } from 'next/server';
import { createServerSupabaseClient, getAuthSession } from '@/lib/supabase/server';
import { AuditDiscoveryService } from '@/lib/services/audit';

interface ExportQueryBody {
  cycle_id?: string;
  institution_id?: string;
}

// Hard ceiling — refuses to stream more than 50,000 rows. Chosen to match
// typical "large discovery" bounds in §T4 (10k-rows example). If a parameter
// legitimately needs more, we'd revisit with a background job.
const MAX_EXPORT_ROWS = 50_000;
const PAGE_SIZE = 100;

function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s: string;
  if (typeof value === 'string') {
    s = value;
  } else if (typeof value === 'number' || typeof value === 'boolean') {
    s = String(value);
  } else {
    // Objects/arrays serialize as JSON so consumers can post-process.
    try {
      s = JSON.stringify(value);
    } catch {
      s = String(value);
    }
  }
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsvRow(values: unknown[]): string {
  return values.map(escapeCsvField).join(',');
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  await connection();

  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createServerSupabaseClient();
    const [superAdminRes, permRes] = await Promise.all([
      (supabase as any).rpc('is_super_admin'),
      (supabase as any).rpc('user_has_permission', {
        permission_name: 'audit.parameter.view',
      }),
    ]);
    const isSuperAdmin = superAdminRes.data === true;
    const hasPerm = permRes.data === true;
    if (!isSuperAdmin && !hasPerm) {
      return NextResponse.json(
        { error: 'Forbidden: audit.parameter.view permission required' },
        { status: 403 }
      );
    }

    const { code } = await params;
    if (!code) {
      return NextResponse.json({ error: 'Missing parameter code' }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as ExportQueryBody;
    const cycleId = body.cycle_id;
    const institutionId = body.institution_id;
    if (!cycleId || !institutionId) {
      return NextResponse.json(
        { error: 'Missing required fields: cycle_id, institution_id' },
        { status: 400 }
      );
    }

    // Fetch the first page to get total_count + header columns.
    const firstPage = await AuditDiscoveryService.runQuery(code, institutionId, cycleId, {
      page: 1,
      page_size: PAGE_SIZE,
    });

    const headers: string[] = firstPage.rows.length
      ? Object.keys(firstPage.rows[0])
      : [];

    const total = Math.min(firstPage.total_count, MAX_EXPORT_ROWS);
    const totalPages = total === 0 ? 0 : Math.ceil(total / PAGE_SIZE);

    // Build a ReadableStream so the browser starts downloading immediately.
    const encoder = new TextEncoder();
    // UTF-8 BOM (﻿) so Excel opens the file with correct encoding.
    const BOM = '﻿';

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode(BOM));

          if (headers.length === 0) {
            // Empty result set — still emit a header-less 0-row file rather
            // than a totally blank body, but keep it small.
            controller.close();
            return;
          }

          controller.enqueue(encoder.encode(toCsvRow(headers) + '\r\n'));

          const emitRows = (rows: Array<Record<string, unknown>>) => {
            for (const row of rows) {
              const values = headers.map((h) => row[h]);
              controller.enqueue(encoder.encode(toCsvRow(values) + '\r\n'));
            }
          };

          emitRows(firstPage.rows);

          for (let page = 2; page <= totalPages; page++) {
            const pageResult = await AuditDiscoveryService.runQuery(
              code,
              institutionId,
              cycleId,
              { page, page_size: PAGE_SIZE }
            );
            emitRows(pageResult.rows);
          }

          controller.close();
        } catch (streamErr) {
          console.error('[audit/parameters/export-query] stream error:', streamErr);
          controller.error(streamErr);
        }
      },
    });

    const filename = `discovery-${code}-${todayIsoDate()}.csv`;

    return new NextResponse(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    const lowered = message.toLowerCase();
    let status = 500;
    if (
      lowered.includes('discovery sql rejected') ||
      lowered.includes('must start with select') ||
      lowered.includes('forbidden keyword') ||
      lowered.includes('reserved schema') ||
      lowered.includes('single statement') ||
      lowered.includes('no saved discovery query') ||
      lowered.includes('not found') ||
      lowered.includes('missing required')
    ) {
      status = 400;
    } else if (lowered.includes('permission denied')) {
      status = 403;
    }

    console.error('[audit/parameters/export-query] POST error:', error);
    return NextResponse.json({ error: message }, { status });
  }
}
