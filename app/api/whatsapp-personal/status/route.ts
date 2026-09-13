export const dynamic = 'force-dynamic';

// GET /api/whatsapp-personal/status
//
// 2026-09-13 — repointed onto the campus bridge. Health is now the heartbeat in
// `wa_bridge_status`, not a live poll of a remote HTTP service. A heartbeat
// older than 5 minutes reads as disconnected.
//
// There is ONE shared JKKN number, so the reported state is the same for every
// caller. `department_id` survives only as an authorization scope.

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getBridgeHealth,
  syncConnectionsToBridgeHealth,
  BRIDGE_HEARTBEAT_STALE_MS,
} from '@/lib/whatsapp/personal-api-client';
import {
  checkByowDeptAccess,
  checkByowInstitutionAccess,
  byowAccessHttpStatus,
} from '@/lib/whatsapp/byow-authz';

export async function GET(request: NextRequest) {
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const departmentId = request.nextUrl.searchParams.get('department_id');

  // AUTHORIZATION — preserved. A named department still runs the PR #2064
  // department gate; 'any'/absent falls back to the cross-department tier.
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
  const connected = health.connected && health.loggedIn;

  // KEEP A WRITER for wa_personal_connections.status. This route was that
  // column's only updater; without it the BYOW health badge — and
  // isConnected() / getAnyReadyConnection(), which the expo and auto-trigger
  // services branch on — freeze on whatever the dead Railway service last said
  // and report it as live state forever. Best-effort, never fails the read.
  await syncConnectionsToBridgeHealth(health);

  return NextResponse.json({
    department_id: deptId,
    status: connected ? 'ready' : 'disconnected',
    connected,
    phone_number: health.phoneNumber,
    // The QR lives on the bridge machine and is never relayed through the app.
    qr_code: null,
    bridge: {
      logged_in: health.loggedIn,
      version: health.version,
      last_heartbeat_at: health.lastHeartbeatAt,
      heartbeat_age_ms: health.heartbeatAgeMs,
      stale_after_ms: BRIDGE_HEARTBEAT_STALE_MS,
      reason: health.reason ?? null,
      // Distinguishes "we could not ask" from "the bridge is quiet".
      error: health.error ?? null,
    },
  });
}
