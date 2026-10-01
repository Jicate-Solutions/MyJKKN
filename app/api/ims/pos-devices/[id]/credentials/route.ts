export const dynamic = 'force-dynamic';

// POST /api/ims/pos-devices/[id]/credentials → save or rotate the Ezetap username + app key.
// Write-only: the key is encrypted in the database and never read back to the browser.

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { setPosDeviceCredentials } from '@/lib/services/ims/pos-device-admin-service';
import { callerOf, deviceIdOf, errorResponse, writeOpts } from '../../_shared';

export const POST = withAuth(async (request, auth, context) => {
  try {
    const id = await deviceIdOf(context);
    const body = await request.json().catch(() => null);
    await setPosDeviceCredentials(callerOf(auth), id, body ?? {});
    return NextResponse.json({ success: true });
  } catch (e) {
    return errorResponse(e, 'Saving terminal credentials');
  }
}, writeOpts);
