// app/api/parent-portal/auth/verify-otp/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyOTPSchema } from '@/lib/validations/parent-portal';
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

    // If parent exists, log activity
    if (data.parent_id) {
      await supabase.from('parent_activity_log').insert({
        parent_id: data.parent_id,
        activity_type: 'login',
        description: 'Logged in via OTP verification',
      });
    }

    return NextResponse.json({
      success: true,
      parent_id: data.parent_id,
      is_new: data.is_new,
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
