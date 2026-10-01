export const dynamic = 'force-dynamic';

// IMS counter payment terminals (Razorpay POS DQR) — ims.settings.pos_devices.manage
// GET  → terminals in the caller's institutions + the selling counters they can go on
// POST → register a terminal (created inactive, no credentials)
//
// The app key is never returned; rows carry `hasCredentials` only.

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { createPosDevice, listPosDevices } from '@/lib/services/ims/pos-device-admin-service';
import { callerOf, errorResponse, readOpts, writeOpts } from './_shared';

export const GET = withAuth(async (_request, auth) => {
  try {
    const data = await listPosDevices(callerOf(auth));
    return NextResponse.json({ success: true, data });
  } catch (e) {
    return errorResponse(e, 'Listing payment terminals');
  }
}, readOpts);

export const POST = withAuth(async (request, auth) => {
  try {
    const body = await request.json().catch(() => null);
    const data = await createPosDevice(callerOf(auth), body ?? {});
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (e) {
    return errorResponse(e, 'Registering the payment terminal');
  }
}, writeOpts);
