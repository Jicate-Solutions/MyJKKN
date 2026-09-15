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
  normalizeToE164,
  BRIDGE_BULK_MAX_RECIPIENTS,
  ByowDisabledError,
  ByowPolicyUnreadableError,
  ByowBulkLimitError,
  BridgeRecipientError,
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

  if (!Array.isArray(recipients) || recipients.length === 0) {
    return NextResponse.json({ error: 'recipients required' }, { status: 400 });
  }

  // HARD FAN-OUT CAP. Every one of these messages leaves the SAME shared
  // institutional WhatsApp number. An unbounded burst from one number is the
  // pattern WhatsApp bans numbers for, and that ban would take every
  // department's sends down at once, permanently. The bridge paces the
  // individual sends; this bounds the burst it is ever handed.
  if (recipients.length > BRIDGE_BULK_MAX_RECIPIENTS) {
    return NextResponse.json(
      {
        error: `Too many recipients in one request: ${recipients.length}. The shared JKKN WhatsApp number accepts at most ${BRIDGE_BULK_MAX_RECIPIENTS} per request. Split the list and send again.`,
        max_recipients: BRIDGE_BULK_MAX_RECIPIENTS,
      },
      { status: 400 }
    );
  }

  // Normalise every recipient BEFORE anything is queued, so a single malformed
  // number fails the request rather than being quietly dropped mid-batch.
  let normalized: { phone: string; message: string }[];
  try {
    normalized = (recipients as { phone: string; message: string }[]).map((r) => ({
      phone: normalizeToE164(r?.phone),
      message: r?.message ?? '',
    }));
  } catch (err) {
    const msg = err instanceof BridgeRecipientError ? err.message : 'Invalid recipient';
    return NextResponse.json({ error: msg }, { status: 400 });
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
    const result = await personalSendBulkAPI(normalized, delay_ms || 1500, {
      institutionId,
      createdBy: user.id,
    });

    // History — unchanged table. Rows stay 'pending' until the bridge delivers.
    // Caller's own scope only — never an arbitrary department. See ../send.
    const logAnchor = await resolveHistoryAnchor(deptId, user.id);
    if (logAnchor) {
      await WhatsAppPersonalMessageService.logMessageBatch(
        normalized.map((r) => ({
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
      queuedCount: result.queuedCount,
      bridge_connected: result.bridgeConnected ?? false,
      logged: Boolean(logAnchor),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Queue failed';
    const status =
      error instanceof ByowDisabledError || error instanceof ByowPolicyUnreadableError
        ? 503
        : error instanceof ByowBulkLimitError || error instanceof BridgeRecipientError
          ? 400
          : 500;
    return NextResponse.json(
      { success: false, queued: false, ids: [], error: msg },
      { status }
    );
  }
}
