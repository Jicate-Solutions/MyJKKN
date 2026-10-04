export const dynamic = 'force-dynamic';

// PATCH  /api/ims/pos-devices/[id] → edit label / serial / store / type / environment
// DELETE /api/ims/pos-devices/[id] → remove (refused once payments reference it)

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { deletePosDevice, updatePosDeviceMeta } from '@/lib/services/ims/pos-device-admin-service';
import { callerOf, deviceIdOf, errorResponse, writeOpts } from '../_shared';

export const PATCH = withAuth(async (request, auth, context) => {
  try {
    const id = await deviceIdOf(context);
    const body = await request.json().catch(() => null);
    await updatePosDeviceMeta(callerOf(auth), id, body ?? {});
    return NextResponse.json({ success: true });
  } catch (e) {
    return errorResponse(e, 'Updating the payment terminal');
  }
}, writeOpts);

export const DELETE = withAuth(async (_request, auth, context) => {
  try {
    const id = await deviceIdOf(context);
    await deletePosDevice(callerOf(auth), id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return errorResponse(e, 'Deleting the payment terminal');
  }
}, writeOpts);
