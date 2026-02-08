// app/api/parent-portal/auth/logout/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ParentSessionService } from '@/lib/services/parent-portal/parent-session-service';
import { clearCSRFCookie, validateCSRFFromRequest } from '@/lib/utils/csrf';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    // Validate CSRF token - logout is a state-changing operation
    const isValidCSRF = await validateCSRFFromRequest(request);

    if (!isValidCSRF) {
      return NextResponse.json(
        { error: 'Invalid CSRF token. Please refresh and try again.' },
        { status: 403 }
      );
    }

    // Get cookie store ONCE to avoid Next.js 16 deadlock
    const cookieStore = await cookies();

    // Get the session token
    const sessionToken = await ParentSessionService.getSessionToken(cookieStore);

    if (sessionToken) {
      // Get parent ID for logging
      const parentId = await ParentSessionService.getCurrentParentId();

      // Revoke the session
      await ParentSessionService.revokeSession(sessionToken, 'User logout');

      // Log the logout activity using RPC (consistent with login)
      if (parentId) {
        const supabase = await createClient();
        await supabase.rpc('log_parent_activity', {
          p_parent_id: parentId,
          p_activity_type: 'logout',
          p_description: 'Logged out',
        });
      }
    }

    // Clear cookies using the same store
    await ParentSessionService.clearSessionCookie(cookieStore);
    await clearCSRFCookie(cookieStore);

    return NextResponse.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error('[parent-portal/auth/logout] POST error:', error);
    // Still clear cookies even if there's an error
    try {
      const cookieStore = await cookies();
      await ParentSessionService.clearSessionCookie(cookieStore);
      await clearCSRFCookie(cookieStore);
    } catch {
      // Ignore cookie clearing errors
    }

    return NextResponse.json(
      { error: 'Logout failed but cookies cleared' },
      { status: 500 }
    );
  }
}
