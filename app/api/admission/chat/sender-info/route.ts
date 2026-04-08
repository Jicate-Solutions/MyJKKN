

import { NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// GET /api/admission/chat/sender-info — returns the configured WhatsApp sender number
export async function GET() {
  await connection();
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json({
      phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID || null,
      dedicated_number: process.env.WHATSAPP_DEDICATED_NUMBER || null,
      configured: !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
    });
  } catch {
    return NextResponse.json({ error: 'Failed to get sender info' }, { status: 500 });
  }
}
