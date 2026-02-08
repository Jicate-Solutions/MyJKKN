// app/api/parent-portal/auth/verify-otp/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { verifyOTPSchema } from '@/lib/validations/parent-portal';
import { ParentSessionService } from '@/lib/services/parent-portal/parent-session-service';
import { setCSRFCookie } from '@/lib/utils/csrf';
import { checkRateLimit, clearRateLimit, RateLimitConfig } from '@/lib/utils/rate-limiter';
import { z } from 'zod';

// Fixed delay to prevent timing attacks
const VERIFICATION_DELAY_MS = 200;

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const validated = verifyOTPSchema.parse(body);

    // Rate limiting by phone number - prevent OTP brute force
    const rateLimitKey = `otp_verify:${validated.phone}:${validated.institution_id}`;
    const rateLimit = checkRateLimit(
      rateLimitKey,
      RateLimitConfig.OTP_VERIFY.maxRequests,
      RateLimitConfig.OTP_VERIFY.windowMs
    );

    if (!rateLimit.allowed) {
      const resetInMinutes = Math.ceil((rateLimit.resetAt - Date.now()) / 60000);
      // Add delay even for rate limit to prevent timing leaks
      await enforceMinimumDelay(startTime, VERIFICATION_DELAY_MS);
      return NextResponse.json(
        {
          error: 'Too many verification attempts. Please request a new OTP.',
          retry_after_minutes: resetInMinutes,
        },
        { status: 429 }
      );
    }

    const supabase = await createClient();

    // Call the database function to verify OTP
    const { data, error } = await supabase.rpc('verify_parent_otp', {
      p_phone: validated.phone,
      p_otp: validated.otp,
      p_institution_id: validated.institution_id,
    });

    if (error) {
      console.error('[parent-portal/auth/verify-otp] Database error:', error);
      await enforceMinimumDelay(startTime, VERIFICATION_DELAY_MS);
      return NextResponse.json(
        { error: 'Verification failed. Please try again.' },
        { status: 500 }
      );
    }

    // Invalid OTP - return generic error with consistent timing
    if (!data.success) {
      await enforceMinimumDelay(startTime, VERIFICATION_DELAY_MS);
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid or expired OTP. Please try again.',
        },
        { status: 401 }
      );
    }

    // Valid OTP - clear rate limit for this phone
    clearRateLimit(rateLimitKey);
    clearRateLimit(`otp_request:${validated.phone}:${validated.institution_id}`);

    // If parent exists, create secure session
    if (data.parent_id) {
      try {
        // Get client info for session tracking
        const ipAddress = getClientIP(request);
        const userAgent = request.headers.get('user-agent') || 'unknown';

        // Create secure session
        const sessionData = await ParentSessionService.createSession(
          data.parent_id,
          ipAddress,
          userAgent
        );

        // Get cookie store ONCE to avoid Next.js 16 deadlock
        // (multiple await cookies() calls in same request cause hangs)
        const cookieStore = await cookies();

        // Set httpOnly session cookie
        await ParentSessionService.setSessionCookie(sessionData.sessionToken, cookieStore);

        // Set CSRF token
        const csrfToken = await setCSRFCookie(undefined, cookieStore);

        // Log activity via SECURITY DEFINER RPC (bypasses RLS)
        await supabase.rpc('log_parent_activity', {
          p_parent_id: data.parent_id,
          p_activity_type: 'login',
          p_description: 'Logged in via OTP verification',
        });

        await enforceMinimumDelay(startTime, VERIFICATION_DELAY_MS);
        return NextResponse.json({
          success: true,
          parent_id: data.parent_id,
          is_new: data.is_new,
          message: data.message,
          csrf_token: csrfToken, // Send CSRF token to client
        });
      } catch (sessionError) {
        // CRITICAL: Session creation failed but OTP was already consumed
        // This is a known edge case - log it and return error
        console.error('[parent-portal/auth/verify-otp] Session creation failed:', sessionError);
        await enforceMinimumDelay(startTime, VERIFICATION_DELAY_MS);
        return NextResponse.json(
          {
            error: 'Authentication successful but session creation failed. Please request a new OTP.',
            // Include parent_id so client can show appropriate error
            parent_id: data.parent_id,
          },
          { status: 500 }
        );
      }
    }

    // New parent - no session yet
    await enforceMinimumDelay(startTime, VERIFICATION_DELAY_MS);
    return NextResponse.json({
      success: true,
      is_new: true,
      message: data.message,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      await enforceMinimumDelay(startTime, VERIFICATION_DELAY_MS);
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('[parent-portal/auth/verify-otp] POST error:', error);
    await enforceMinimumDelay(startTime, VERIFICATION_DELAY_MS);
    return NextResponse.json(
      { error: 'Failed to verify OTP' },
      { status: 500 }
    );
  }
}

/**
 * Enforces minimum delay to prevent timing attacks
 * All responses take at least VERIFICATION_DELAY_MS milliseconds
 */
async function enforceMinimumDelay(startTime: number, minDelayMs: number): Promise<void> {
  const elapsed = Date.now() - startTime;
  const remaining = minDelayMs - elapsed;

  if (remaining > 0) {
    await new Promise(resolve => setTimeout(resolve, remaining));
  }
}

/**
 * Gets client IP address with basic validation
 * Note: x-forwarded-for can be spoofed, but we log it for tracking
 */
function getClientIP(request: NextRequest): string {
  // Check various headers (proxy order matters)
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  const cfIP = request.headers.get('cf-connecting-ip'); // Cloudflare

  // Use the first valid IP
  const ip = cfIP || realIP || (forwarded ? forwarded.split(',')[0].trim() : null);

  return ip || 'unknown';
}
