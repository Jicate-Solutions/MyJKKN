export const dynamic = 'force-dynamic';

import { NextResponse, connection } from 'next/server';
import { getAuthSession } from '@/lib/supabase/server';
import { AuditFindingService } from '@/lib/services/audit';
import type { LogAuditFindingDto } from '@/lib/types/audit';

export async function POST(request: Request) {
  await connection();
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as LogAuditFindingDto;

    if (!body.audit_cycle_id || !body.parameter_code || !body.severity || !body.institution_id) {
      return NextResponse.json(
        { error: 'Missing required fields: audit_cycle_id, parameter_code, severity, institution_id' },
        { status: 400 }
      );
    }

    const finding = await AuditFindingService.log(body, { requesterId: session.user.id });
    return NextResponse.json({ data: finding, metadata: { logged: true } }, { status: 201 });
  } catch (error) {
    console.error('[audit/findings/log] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
