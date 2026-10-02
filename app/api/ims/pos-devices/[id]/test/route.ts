export const dynamic = 'force-dynamic';

// POST /api/ims/pos-devices/[id]/test  { confirmLive?: boolean }
// Pushes ₹1.00 to the terminal and withdraws it. A LIVE terminal needs
// confirmLive:true — its QR takes real money if someone pays it.
// A vendor refusal is a 200 with ok:false (the test ran; the terminal said no).

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { testPosDevice } from '@/lib/services/ims/pos-device-admin-service';
import { callerOf, deviceIdOf, errorResponse, writeOpts } from '../../_shared';

export const POST = withAuth(async (request, auth, context) => {
  try {
    const id = await deviceIdOf(context);
    const body = await request.json().catch(() => null);
    const data = await testPosDevice(callerOf(auth), id, { confirmLive: body?.confirmLive === true });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    return errorResponse(e, 'Testing the payment terminal');
  }
}, writeOpts);
