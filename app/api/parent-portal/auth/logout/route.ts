// app/api/parent-portal/auth/logout/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { ParentSessionService } from '@/lib/services/parent-portal/parent-session-service';
import { clearCSRFCookie } from '@/lib/utils/csrf';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    // Get the session token
    const sessionToken = await ParentSessionService.getSessionToken();

    if (sessionToken) {
      // Get parent ID for logging
      const parentId = await ParentSessionService.getCurrentParentId();

      // Revoke the session
      await ParentSessionService.revokeSession(sessionToken, 'User logout');

      // Log the logout activity
      if (parentId) {
        const supabase = await createClient();
        await supabase.from('parent_activity_log').insert({
          parent_id: parentId,
          activity_type: 'logout',
          description: 'Logged out',
        });
      }
    }

    // Clear cookies
    await ParentSessionService.clearSessionCookie();
    await clearCSRFCookie();

    return NextResponse.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error('[parent-portal/auth/logout] POST error:', error);
    // Still clear cookies even if there's an error
    await ParentSessionService.clearSessionCookie();
    await clearCSRFCookie();

    return NextResponse.json(
      { error: 'Logout failed but cookies cleared' },
      { status: 500 }
    );
  }
}
