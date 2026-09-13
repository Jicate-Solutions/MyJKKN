export const dynamic = 'force-dynamic';

// POST /api/whatsapp-personal/disconnect
//
// 2026-09-13 — repointed. The campus bridge owns its WhatsApp session on a
// machine Vercel cannot reach, so there is no remote logout. This route makes
// that explicit instead of calling a dead Railway host and returning
// `{ success: true, message: 'Disconnected' }` for a session still very much
// logged in.

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { personalDisconnectAPI, getBridgeHealth } from '@/lib/whatsapp/personal-api-client';
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

  // AUTHORIZATION — preserved. Still gated even though the route is now inert:
  // the response discloses the bridge's pairing state and phone number.
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

  const [result, health] = await Promise.all([personalDisconnectAPI(), getBridgeHealth()]);

  // No DB write: wa_personal_connections no longer describes transport, and
  // flipping a row to 'disconnected' here would assert something this process
  // cannot know or cause.
  return NextResponse.json({
    success: result.success,
    remote_disconnect_supported: false,
    message: result.message,
    bridge: {
      connected: health.connected,
      logged_in: health.loggedIn,
      phone_number: health.phoneNumber,
      last_heartbeat_at: health.lastHeartbeatAt,
    },
  });
}
