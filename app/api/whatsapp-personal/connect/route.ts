export const dynamic = 'force-dynamic';

// POST /api/whatsapp-personal/connect
//
// 2026-09-13 — repointed. Pairing now happens ON the campus bridge machine: the
// bridge process owns the WhatsApp session and serves its own /qr page on that
// Windows box. Vercel cannot reach it (NAT), and there is no QR to relay.
//
// This route therefore performs NO remote call. It returns an explicit
// instruction — the alternative, left as-is, would have gone on calling a dead
// Railway host and reporting a generic failure the user cannot act on.

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getBridgeHealth, BRIDGE_PAIRING_HINT } from '@/lib/whatsapp/personal-api-client';
import {
  checkByowDeptAccess,
  checkByowInstitutionAccess,
  byowAccessHttpStatus,
} from '@/lib/whatsapp/byow-authz';

export async function POST(request: NextRequest) {
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const departmentId = typeof body?.department_id === 'string' ? body.department_id : null;

  // AUTHORIZATION — preserved. Read-only now, but still gated: the response
  // names the bridge host and its pairing state.
  const deptId = departmentId && departmentId !== 'any' ? departmentId : null;
  const access = deptId
    ? await checkByowDeptAccess(user.id, deptId)
    : await checkByowInstitutionAccess(user.id);

  if (!access.ok) {
    return NextResponse.json(
      { error: 'You do not have access to the shared JKKN WhatsApp number' },
      { status: byowAccessHttpStatus(access) }
    );
  }

  const health = await getBridgeHealth();
  const paired = health.connected && health.loggedIn;

  return NextResponse.json({
    success: false,
    remote_pairing_supported: false,
    status: paired ? 'ready' : 'disconnected',
    qrCode: null,
    message: paired
      ? 'The campus WhatsApp bridge is already paired and online. Nothing to do here.'
      : BRIDGE_PAIRING_HINT,
    bridge: {
      connected: health.connected,
      logged_in: health.loggedIn,
      phone_number: health.phoneNumber,
      last_heartbeat_at: health.lastHeartbeatAt,
      reason: health.reason ?? null,
    },
  });
}
