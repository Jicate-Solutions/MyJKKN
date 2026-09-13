export const dynamic = 'force-dynamic';

// POST /api/whatsapp-personal/send-media
//
// 2026-09-13 — repointed onto the campus bridge outbox. The raw fetch to the
// Railway host is gone; the media URL rides on the outbox row and the bridge
// fetches and sends it. A 200 with `queued: true` means ACCEPTED, not DELIVERED.

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { WhatsAppPersonalMessageService } from '@/lib/services/whatsapp/whatsapp-personal-message-service';
import {
  personalSendMediaAPI,
  resolveHistoryAnchor,
  normalizeToE164,
  ByowDisabledError,
  ByowPolicyUnreadableError,
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
  const { department_id, to, media_url, caption, media_type, lead_id, recipient_name } = body;

  if (!to || !media_url) {
    return NextResponse.json({ error: 'to and media_url required' }, { status: 400 });
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

  let toE164: string;
  try {
    toE164 = normalizeToE164(to);
  } catch (err) {
    const msg = err instanceof BridgeRecipientError ? err.message : 'Invalid recipient';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Caller's own scope only — see ../send/route.ts.
  const logAnchor = await resolveHistoryAnchor(deptId, user.id);
  const logEntry = logAnchor
    ? await WhatsAppPersonalMessageService.logMessage({
        department_id: logAnchor.department_id,
        connection_id: logAnchor.id,
        recipient_type: 'individual',
        recipient_phone: toE164,
        recipient_name: recipient_name || undefined,
        message_content: caption || `[${media_type || 'media'}]`,
        lead_id: lead_id || undefined,
        sent_by: user.id,
        status: 'pending',
      })
    : null;

  try {
    const result = await personalSendMediaAPI(toE164, media_url, caption || undefined, {
      leadId: lead_id || null,
      institutionId,
      createdBy: user.id,
    });

    // Stays 'pending' until the bridge reports delivery.
    return NextResponse.json({
      success: true,
      queued: true,
      id: result.id,
      bridge_connected: result.bridgeConnected ?? false,
      log_id: logEntry?.id ?? null,
      logged: Boolean(logEntry),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Queue failed';
    if (logEntry) {
      await WhatsAppPersonalMessageService.updateStatus(logEntry.id, 'failed', {
        error_message: msg,
      });
    }
    // A rejected media `type` (BridgeOutboxTypeRejectedError) falls through to
    // 500, but its MESSAGE names the constraint and the contract, so the "every
    // media send fails" case is diagnosable from the response alone.
    const status =
      error instanceof ByowDisabledError || error instanceof ByowPolicyUnreadableError
        ? 503
        : error instanceof BridgeRecipientError
          ? 400
          : 500;
    return NextResponse.json({ success: false, queued: false, error: msg }, { status });
  }
}
