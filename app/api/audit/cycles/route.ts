export const dynamic = 'force-dynamic';

import { NextResponse, connection } from 'next/server';
import { getAuthSession } from '@/lib/supabase/server';
import { AuditCycleService } from '@/lib/services/audit';
import type { CreateAuditCycleDto } from '@/lib/types/audit';

export async function GET(request: Request) {
  await connection();
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const includeClosed = searchParams.get('includeClosed') === 'true';

    const cycles = await AuditCycleService.list({ includeClosed });
    return NextResponse.json({ data: cycles, metadata: { count: cycles.length } });
  } catch (error) {
    console.error('[audit/cycles] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  await connection();
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as CreateAuditCycleDto;

    // Basic validation
    if (!body.name || !body.frameworks?.length || !body.start_date || !body.end_date || !body.lead_auditor_id) {
      return NextResponse.json(
        { error: 'Missing required fields: name, frameworks, start_date, end_date, lead_auditor_id' },
        { status: 400 }
      );
    }

    const cycle = await AuditCycleService.create(body);
    return NextResponse.json({ data: cycle, metadata: { created: true } }, { status: 201 });
  } catch (error) {
    console.error('[audit/cycles] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
