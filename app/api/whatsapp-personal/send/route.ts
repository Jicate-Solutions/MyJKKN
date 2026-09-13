export const dynamic = 'force-dynamic';

// POST /api/whatsapp-personal/send
//
// 2026-09-13 — repointed onto the campus bridge outbox. This route no longer
// waits for a delivery result: it queues the message and returns immediately.
// A 200 with `queued: true` means ACCEPTED, not DELIVERED.

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { WhatsAppPersonalMessageService } from '@/lib/services/whatsapp/whatsapp-personal-message-service';
import {
  personalSendMessageAPI,
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
  const { department_id, to, message, lead_id, recipient_name } = body;

  if (!to || !message) {
    return NextResponse.json({ error: 'to and message required' }, { status: 400 });
  }

  // AUTHORIZATION — unchanged in strength, only in what it keys off.
  // A named department still goes through the PR #2064 department gate. When no
  // department is named (callers pass 'any'), the institution gate grants only
  // the cross-department tier that gate already grants. Never removed.
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

  // History log — unchanged table, unchanged reporting. wa_personal_message_logs
  // still requires a department_id and a connection_id (both NOT NULL with FKs),
  // so we reuse an existing wa_personal_connections row purely as history
  // metadata. It no longer decides where the message goes.
  // Recipient phone is normalised HERE too, so the history row and the outbox
  // row carry the identical canonical number rather than two spellings.
  let toE164: string;
  try {
    toE164 = normalizeToE164(to);
  } catch (err) {
    const msg = err instanceof BridgeRecipientError ? err.message : 'Invalid recipient';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // History anchor is resolved from the CALLER's own scope only — never from an
  // arbitrary department, which would write this message body and this phone
  // number into a department the caller was never authorised for.
  const logAnchor = await resolveHistoryAnchor(deptId, user.id);
  const logEntry = logAnchor
    ? await WhatsAppPersonalMessageService.logMessage({
        department_id: logAnchor.department_id,
        connection_id: logAnchor.id,
        recipient_type: 'individual',
        recipient_phone: toE164,
        recipient_name: recipient_name || undefined,
        message_content: message,
        lead_id: lead_id || undefined,
        sent_by: user.id,
        status: 'pending',
      })
    : null;

  try {
    const result = await personalSendMessageAPI(toE164, message, {
      leadId: lead_id || null,
      institutionId,
      createdBy: user.id,
    });

    // The log row stays 'pending' until the bridge reports delivery — marking it
    // 'sent' here would claim a delivery that has not happened yet.
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
    // An unreadable kill switch is a refusal to send, not a server fault — it
    // gets the same 503 as an explicitly disabled switch.
    const status =
      error instanceof ByowDisabledError || error instanceof ByowPolicyUnreadableError
        ? 503
        : error instanceof BridgeRecipientError
          ? 400
          : 500;
    return NextResponse.json({ success: false, queued: false, error: msg }, { status });
  }
}
