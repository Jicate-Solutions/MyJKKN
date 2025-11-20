// TEMPORARY: Debug endpoint to verify environment variables
// DELETE THIS FILE AFTER TESTING!

import { NextResponse } from 'next/server';

export async function GET() {
  // Only allow in non-production or with a secret key
  if (process.env.NODE_ENV === 'production' && process.env.DEBUG_SECRET !== 'allow-debug') {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  // Check which environment variables are set (don't show actual values for security)
  const envCheck = {
    HDFC_MERCHANT_ID: !!process.env.HDFC_MERCHANT_ID,
    HDFC_PAYMENT_PAGE_CLIENT_ID: !!process.env.HDFC_PAYMENT_PAGE_CLIENT_ID,
    HDFC_API_KEY: !!process.env.HDFC_API_KEY,
    HDFC_API_SECRET: !!process.env.HDFC_API_SECRET,
    HDFC_RESPONSE_KEY: !!process.env.HDFC_RESPONSE_KEY,
    HDFC_CARD_ENCODING_KEY: !!process.env.HDFC_CARD_ENCODING_KEY,
    HDFC_BASE_URL: process.env.HDFC_BASE_URL || 'NOT SET',
    HDFC_TEST_MODE: process.env.HDFC_TEST_MODE || 'NOT SET',
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'NOT SET',
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,

    // Show first 4 characters of API key for verification (masked)
    HDFC_API_KEY_PREFIX: process.env.HDFC_API_KEY?.substring(0, 4) || 'NONE',
  };

  return NextResponse.json(envCheck);
}
