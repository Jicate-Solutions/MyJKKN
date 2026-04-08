import { NextResponse } from 'next/server';

// Passthru endpoint — not used. Exotel calls are handled via
// StatusCallback on each ExoPhone + cron sync at /api/admission/calls/sync.
export async function POST() {
  return NextResponse.json({
    status: 'not_used',
    message: 'Call handling uses StatusCallback webhooks, not passthru. See /api/webhooks/telephony for the active handler.',
  });
}

export async function GET() {
  return NextResponse.json({
    status: 'not_used',
    message: 'Call handling uses StatusCallback webhooks, not passthru.',
    active_handler: '/api/webhooks/telephony',
  });
}
