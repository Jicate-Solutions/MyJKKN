export const dynamic = 'force-dynamic';

// app/api/whatsapp-bridge/status/route.ts
//
// GET /api/whatsapp-bridge/status
//
// The staff-facing view: is the campus bridge alive, is it still logged in to
// WhatsApp, and what is piled up behind it.
//
// This is the ONE endpoint in this folder that takes a normal MyJKKN session,
// and it refuses the bridge secret outright. The secret lives in a config file
// on a Windows machine in a staff room; if it leaks it must not become a way to
// read the queue. The two authentication paths are kept disjoint on purpose —
// a bridge route never reads a session, and this route never checks a secret.
//
// ⚠️ THE PERMISSION IS CHECKED HERE, NOT LEFT TO RLS ALONE. RLS filters rows;
// it does not answer questions. A user without
// `admission.settings.whatsapp.view` would be handed zero heartbeat rows and
// zero counts by RLS, and this endpoint would then render that as
// `connected: false, pending_count: 0` — "the bridge is dead and the queue is
// empty". That is a false statement about the world, delivered confidently, and
// it is the reading someone would act on. A denied user is told they are denied.
//
// The two failure modes are also kept apart, because this repo has been bitten
// by merging them before (the "Move to Counselor says Forbidden" report, where a
// database misconfiguration reached the user as "you are not allowed"):
//   - the check ran and said no          -> 403 Forbidden
//   - the check itself could not run     -> 500, and NOT the word Forbidden

import { connection } from 'next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rejectsBridgeSecret } from '../_lib/bridge-auth';
import { BridgeOutboxService } from '@/lib/services/whatsapp/bridge-outbox-service';

/**
 * The existing key that already governs this material on the WhatsApp settings
 * screens — message bodies to and from prospective learners and their parents.
 * Deliberately not a new key: a new one would be held by nobody on day one.
 */
const BRIDGE_STATUS_PERMISSION = 'admission.settings.whatsapp.view';

export async function GET(request: NextRequest) {
  await connection();

  const bridgeSecretPresented = rejectsBridgeSecret(request);
  if (bridgeSecretPresented) return bridgeSecretPresented;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Super admins and admins pass without the key, matching the RLS policies on
  // these tables exactly. If the two ever disagree, this endpoint is the one
  // that is wrong, because RLS is what actually holds.
  const [superAdmin, admin, permitted] = await Promise.all([
    supabase.rpc('is_super_admin'),
    supabase.rpc('is_admin'),
    supabase.rpc('user_has_permission', { permission_name: BRIDGE_STATUS_PERMISSION }),
  ]);

  if (superAdmin.error && admin.error && permitted.error) {
    console.error(
      '[whatsapp-bridge/status] permission check could not run:',
      permitted.error.message
    );
    // NOT 403. Nothing was decided about this user, and saying "Forbidden"
    // would send them asking for a permission they may already hold.
    return NextResponse.json(
      { error: 'Could not check your access to the bridge status' },
      { status: 500 }
    );
  }

  const allowed =
    superAdmin.data === true || admin.data === true || permitted.data === true;

  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    // The caller's own client, so the counts are read through RLS as well. The
    // check above decides whether they may ask at all; RLS still decides which
    // institutions' rows are inside the answer.
    const snapshot = await BridgeOutboxService.getStatus(supabase);
    return NextResponse.json(snapshot);
  } catch (err) {
    console.error(
      '[whatsapp-bridge/status] failed:',
      err instanceof Error ? err.message : err
    );
    return NextResponse.json({ error: 'Failed to read bridge status' }, { status: 500 });
  }
}
