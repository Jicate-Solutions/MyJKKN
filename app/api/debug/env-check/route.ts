export const dynamic = 'force-dynamic';

// TEMPORARY: Debug endpoint to verify payment-gateway environment variables.
// DELETE THIS FILE AFTER VERIFYING THE RAZORPAY ENV IS LOADED.

import { NextResponse, connection } from 'next/server';

export async function GET() {
  await connection();

  // Report presence only (never the actual secret values).
  const envCheck = {
    BILLING_PAYMENT_PROVIDER: process.env.BILLING_PAYMENT_PROVIDER || 'NOT SET (defaults to razorpay)',
    EVENTS_PAYMENT_PROVIDER: process.env.EVENTS_PAYMENT_PROVIDER || 'NOT SET (defaults to razorpay)',
    RAZORPAY_KEY_ID: !!process.env.RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET: !!process.env.RAZORPAY_KEY_SECRET,
    RAZORPAY_WEBHOOK_SECRET: !!process.env.RAZORPAY_WEBHOOK_SECRET,
    RAZORPAY_CREDENTIALS_MASTER_SECRET: !!process.env.RAZORPAY_CREDENTIALS_MASTER_SECRET,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'NOT SET',
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,

    // Show the key-id prefix (rzp_live_ / rzp_test_) for a quick mode sanity check.
    RAZORPAY_KEY_ID_PREFIX: process.env.RAZORPAY_KEY_ID?.substring(0, 8) || 'NONE',
  };

  return NextResponse.json(envCheck);
}
