export const dynamic = 'force-dynamic';

// POST /api/ims/pos-devices/[id]/deactivate

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { setPosDeviceActive } from '@/lib/services/ims/pos-device-admin-service';
import { callerOf, deviceIdOf, errorResponse, writeOpts } from '../../_shared';

export const POST = withAuth(async (_request, auth, context) => {
  try {
    const id = await deviceIdOf(context);
    await setPosDeviceActive(callerOf(auth), id, false);
    return NextResponse.json({ success: true });
  } catch (e) {
    return errorResponse(e, 'Deactivating the payment terminal');
  }
}, writeOpts);
