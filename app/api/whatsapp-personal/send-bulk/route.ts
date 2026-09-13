export const dynamic = 'force-dynamic';

// POST /api/whatsapp-personal/send-bulk
//
// 2026-09-13 — repointed onto the campus bridge outbox. Every recipient becomes
// one `pending` row; the bridge drains them and paces the sends. A 200 with
// `queued: true` means ACCEPTED, not DELIVERED.

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { WhatsAppPersonalMessageService } from '@/lib/services/whatsapp/whatsapp-personal-message-service';
import {
  personalSendBulkAPI,
  resolveHistoryAnchor,
  ByowDisabledError,
} from '@/lib/whatsapp/personal-api-client';
import {
  checkByowDeptAccess,
  checkByowInstitutionAccess,
  getByowSenderInstitution,
  byowAccessHttpStatus,
} from '@/lib/whatsapp/byow-authz';

export async function POST(request: NextRequest) {
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { department_id, recipients, delay_ms } = body;

  if (!recipients?.length) {
    return NextResponse.json({ error: 'recipients required' }, { status: 400 });
  }

  // AUTHORIZATION — see the note in ../send/route.ts. Named department keeps the
  // PR #2064 gate; no department falls back to the cross-department tier.
  const deptId =
    typeof department_id === 'string' && department_id !== 'any' && department_id.length > 0
      ? department_id
      : null;

  let institutionId: string | null;
  if (deptId) {
    const access = await checkByowDeptAccess(user.id, deptId);
    if (!access.ok) {
      return NextResponse.json(
        { error: 'You do not have access to this department’s WhatsApp' },
        { status: byowAccessHttpStatus(access) }
      );
    }
    institutionId = await getByowSenderInstitution(user.id);
  } else {
    const access = await checkByowInstitutionAccess(user.id);
    if (!access.ok) {
      return NextResponse.json(
        { error: 'You do not have access to the shared JKKN WhatsApp number' },
        { status: byowAccessHttpStatus(access) }
      );
    }
    institutionId = access.institutionId ?? null;
  }

  try {
    const result = await personalSendBulkAPI(recipients, delay_ms || 1500, {
      institutionId,
      createdBy: user.id,
    });

    // History — unchanged table. Rows stay 'pending' until the bridge delivers.
    const logAnchor = await resolveHistoryAnchor(deptId);
    if (logAnchor) {
      await WhatsAppPersonalMessageService.logMessageBatch(
        (recipients as { phone: string; message: string }[]).map((r) => ({
          department_id: logAnchor.department_id,
          connection_id: logAnchor.id,
          recipient_type: 'bulk' as const,
          recipient_phone: r.phone,
          message_content: r.message || '',
          sent_by: user.id,
          status: 'pending' as const,
        }))
      );
    }

    return NextResponse.json({
      success: true,
      queued: true,
      ids: result.ids,
      queuedCount: result.ids.length,
      bridge_connected: result.bridgeConnected ?? false,
      logged: Boolean(logAnchor),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Queue failed';
    const status = error instanceof ByowDisabledError ? 503 : 500;
    return NextResponse.json(
      { success: false, queued: false, ids: [], error: msg },
      { status }
    );
  }
}
