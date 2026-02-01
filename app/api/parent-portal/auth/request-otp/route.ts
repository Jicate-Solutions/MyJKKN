// app/api/parent-portal/auth/request-otp/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requestOTPSchema } from '@/lib/validations/parent-portal';
import { z } from 'zod';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();

    const validated = requestOTPSchema.parse(body);

    // Call the database function to generate and store OTP
    const { data, error } = await supabase.rpc('send_parent_otp', {
      p_phone: validated.phone,
      p_institution_id: validated.institution_id,
    });

    if (error) throw error;

    // Note: In production, you would integrate with an SMS service here
    // The OTP is stored in the database, and you would send it via SMS
    // For now, we just return success

    return NextResponse.json({
      success: true,
      message: 'OTP sent to your phone number',
      expires_at: data.expires_at,
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
