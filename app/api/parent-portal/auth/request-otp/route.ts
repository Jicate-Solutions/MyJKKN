// app/api/parent-portal/auth/request-otp/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requestOTPSchema } from '@/lib/validations/parent-portal';
import { checkRateLimit, RateLimitConfig } from '@/lib/utils/rate-limiter';
import { z } from 'zod';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = requestOTPSchema.parse(body);

    // Rate limiting by phone number - prevent OTP spam
    const rateLimitKey = `otp_request:${validated.phone}:${validated.institution_id}`;
    const rateLimit = checkRateLimit(
      rateLimitKey,
      RateLimitConfig.OTP_REQUEST.maxRequests,
      RateLimitConfig.OTP_REQUEST.windowMs
    );

    if (!rateLimit.allowed) {
      const resetInMinutes = Math.ceil((rateLimit.resetAt - Date.now()) / 60000);
      return NextResponse.json(
        {
          error: 'Too many OTP requests. Please try again later.',
          retry_after_minutes: resetInMinutes,
        },
        { status: 429 }
      );
    }

    const supabase = await createClient();

    // Call the database function to generate and store OTP
    const { data, error } = await supabase.rpc('send_parent_otp', {
      p_phone: validated.phone,
      p_institution_id: validated.institution_id,
    });

    if (error) {
      console.error('[parent-portal/auth/request-otp] Database error:', error);
      throw new Error('Failed to generate OTP');
    }

    // Note: In production, you would integrate with an SMS service here
    // The OTP is stored in the database, and you would send it via SMS
    // For now, we just return success

    return NextResponse.json({
      success: true,
      message: 'OTP sent to your phone number',
      // Don't return expires_at - potential timing leak
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('[parent-portal/auth/request-otp] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to send OTP' },
      { status: 500 }
    );
  }
}
