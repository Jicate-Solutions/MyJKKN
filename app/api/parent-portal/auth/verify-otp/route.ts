// app/api/parent-portal/auth/verify-otp/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyOTPSchema } from '@/lib/validations/parent-portal';
import { ParentSessionService } from '@/lib/services/parent-portal/parent-session-service';
import { setCSRFCookie } from '@/lib/utils/csrf';
import { z } from 'zod';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();

    const validated = verifyOTPSchema.parse(body);

    // Call the database function to verify OTP
    const { data, error } = await supabase.rpc('verify_parent_otp', {
      p_phone: validated.phone,
      p_otp: validated.otp,
      p_institution_id: validated.institution_id,
    });

    if (error) throw error;

    if (!data.success) {
      return NextResponse.json(
        {
          success: false,
          message: data.message || 'Invalid or expired OTP',
        },
        { status: 401 }
      );
    }

    // If parent exists, create secure session
    if (data.parent_id) {
      // Get client info for session tracking
      const ipAddress = request.headers.get('x-forwarded-for') ||
                       request.headers.get('x-real-ip') ||
                       'unknown';
      const userAgent = request.headers.get('user-agent') || 'unknown';

      // Create secure session
      const sessionData = await ParentSessionService.createSession(
        data.parent_id,
        ipAddress,
        userAgent
      );

      // Set httpOnly session cookie
      await ParentSessionService.setSessionCookie(sessionData.sessionToken);

      // Set CSRF token
      const csrfToken = await setCSRFCookie();

      // Log activity via SECURITY DEFINER RPC (bypasses RLS)
      await supabase.rpc('log_parent_activity', {
        p_parent_id: data.parent_id,
        p_activity_type: 'login',
        p_description: 'Logged in via OTP verification',
      });

      return NextResponse.json({
        success: true,
        parent_id: data.parent_id,
        is_new: data.is_new,
        message: data.message,
        csrf_token: csrfToken, // Send CSRF token to client
      });
    }

    // New parent - no session yet
    return NextResponse.json({
      success: true,
      is_new: true,
      message: data.message,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('[parent-portal/auth/verify-otp] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to verify OTP' },
      { status: 500 }
    );
  }
}
