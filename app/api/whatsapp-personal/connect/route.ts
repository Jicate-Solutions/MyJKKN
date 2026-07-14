export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { WhatsAppPersonalConnectionService } from '@/lib/services/whatsapp/whatsapp-personal-connection-service';
import { personalConnectAPI } from '@/lib/whatsapp/personal-api-client';
import { checkByowDeptAccess, byowAccessHttpStatus } from '@/lib/whatsapp/byow-authz';

export async function POST(request: NextRequest) {
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const departmentId = body.department_id;
  if (!departmentId) return NextResponse.json({ error: 'department_id required' }, { status: 400 });

  const access = await checkByowDeptAccess(user.id, departmentId);
  if (!access.ok) {
    return NextResponse.json(
      { error: 'You do not have access to this department’s WhatsApp connection' },
      { status: byowAccessHttpStatus(access) }
    );
  }

  const serviceUrl = process.env.WHATSAPP_PERSONAL_SERVICE_URL || '';
  const clientId = `dept-${departmentId}`;

  await WhatsAppPersonalConnectionService.upsertConnection(departmentId, {
    status: 'connecting',
    service_url: serviceUrl,
    client_id: clientId,
    connected_by: user.id,
  });

  const result = await personalConnectAPI({
    serviceUrl,
    apiKey: process.env.WHATSAPP_PERSONAL_API_KEY || '',
    departmentId: clientId,
  });

  if (result.success) {
    await WhatsAppPersonalConnectionService.updateStatus(departmentId, result.status, {
      connected_by: user.id,
    });
  }

  return NextResponse.json(result);
}
