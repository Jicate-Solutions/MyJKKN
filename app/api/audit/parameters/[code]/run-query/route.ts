export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/audit/parameters/[code]/run-query
// Body: { cycle_id: string; institution_id: string; page?: number; page_size?: number }
// Response: { data: { rows, total_count, page, page_size, sample, warning? }, metadata }
//
// Security: session-only (no API key). Whitelist validation lives in
// AuditDiscoveryService + the DB RPC audit_execute_discovery_query.
// The DB RPC also gates on user_has_permission('audit.parameter.view').

import { NextResponse, connection } from 'next/server';
import { getAuthSession } from '@/lib/supabase/server';
import { AuditDiscoveryService } from '@/lib/services/audit';

interface RunQueryBody {
  cycle_id?: string;
  institution_id?: string;
  page?: number;
  page_size?: number;
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

    const { code } = await params;
    if (!code) {
      return NextResponse.json({ error: 'Missing parameter code' }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as RunQueryBody;
    const cycleId = body.cycle_id;
    const institutionId = body.institution_id;

    if (!cycleId || !institutionId) {
      return NextResponse.json(
        { error: 'Missing required fields: cycle_id, institution_id' },
        { status: 400 }
      );
    }

    const result = await AuditDiscoveryService.runQuery(code, institutionId, cycleId, {
      page: typeof body.page === 'number' ? body.page : undefined,
      page_size: typeof body.page_size === 'number' ? body.page_size : undefined,
    });

    return NextResponse.json({
      data: result,
      metadata: {
        parameter_code: code,
        cycle_id: cycleId,
        institution_id: institutionId,
        executed_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';

    // SQL rejection → 400 so the client can show a clean message without
    // suggesting a backend bug. Permission denied → 403. Everything else → 500.
    const lowered = message.toLowerCase();
    let status = 500;
    if (lowered.includes('discovery sql rejected') || lowered.includes('must start with select') ||
        lowered.includes('forbidden keyword') || lowered.includes('reserved schema') ||
        lowered.includes('single statement') || lowered.includes('not found') ||
        lowered.includes('no saved discovery query') || lowered.includes('missing required')) {
      status = 400;
    } else if (lowered.includes('permission denied')) {
      status = 403;
    }

    console.error('[audit/parameters/run-query] POST error:', error);
    return NextResponse.json({ error: message }, { status });
  }
}
