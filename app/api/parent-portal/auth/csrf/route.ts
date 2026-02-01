// app/api/parent-portal/auth/csrf/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getCSRFTokenForClient } from '@/lib/utils/csrf';

/**
 * Get CSRF token endpoint
 * This endpoint allows clients to retrieve a CSRF token for form submissions
 */
export async function GET(request: NextRequest) {
  try {
    const csrfToken = await getCSRFTokenForClient();

    return NextResponse.json({
      csrf_token: csrfToken,
    });
  } catch (error) {
    console.error('[parent-portal/auth/csrf] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to generate CSRF token' },
      { status: 500 }
    );
  }
}
