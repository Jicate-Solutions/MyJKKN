// app/api/webhooks/telephony/passthru/route.ts
// Exotel Passthru URL Handler — routes calls to department-specific numbers
// POST /api/webhooks/telephony/passthru

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  // Stub: passthru handler to be implemented
  return NextResponse.json({ status: 'ok', message: 'passthru stub' });
}

export async function GET(request: NextRequest) {
  return NextResponse.json({ status: 'ok', message: 'passthru stub' });
}
