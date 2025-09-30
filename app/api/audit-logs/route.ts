// app/api/audit-logs/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getAuditLogs,
  createAuditLog
} from '@/lib/services/audit-trail/audit-service';
import { createAuditLogSchema } from '@/types/audit-trail';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const filters = {
      user_id: searchParams.get('user_id') || undefined,
      action: (searchParams.get('action') as any) || undefined,
      module: (searchParams.get('module') as any) || undefined,
      severity: (searchParams.get('severity') as any) || undefined,
      entity_type: searchParams.get('entity_type') || undefined,
      entity_id: searchParams.get('entity_id') || undefined,
      search: searchParams.get('search') || undefined,
      from_date: searchParams.get('from_date') || undefined,
      to_date: searchParams.get('to_date') || undefined,
      limit: searchParams.get('limit')
        ? parseInt(searchParams.get('limit')!)
        : undefined,
      offset: searchParams.get('offset')
        ? parseInt(searchParams.get('offset')!)
        : undefined
    };

    const logs = await getAuditLogs(filters);

    return NextResponse.json({
      data: logs,
      count: logs.length
    });
  } catch (error: any) {
    console.error('Error fetching audit logs:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = createAuditLogSchema.parse(body);
    const log = await createAuditLog(validatedData);

    return NextResponse.json({
      data: log,
      message: 'Audit log created successfully'
    });
  } catch (error: any) {
    console.error('Error creating audit log:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
