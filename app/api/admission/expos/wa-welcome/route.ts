// app/api/admission/expos/wa-welcome/route.ts
// Triggers WhatsApp welcome message for a lead captured at an expo.
// Called by the capture form after successful lead creation.
// Non-blocking: returns 200 immediately, logs errors but never fails the capture.

import { NextRequest, NextResponse, connection } from 'next/server';
import { getAuthUser } from '@/lib/supabase/server';
import { ExpoWhatsAppService } from '@/lib/services/admission/expo-whatsapp-service';

export async function POST(request: NextRequest) {
  await connection();

  const { user, error: authError } = await getAuthUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      leadId,
      leadPhone,
      leadName,
      parentPhone,
      parentName,
      eventName,
      institutionId,
      institutionName,
      expoEventId,
    } = body;

    if (!leadId || !leadPhone || !leadName || !expoEventId || !institutionId) {
      return NextResponse.json(
        { error: 'Missing required fields: leadId, leadPhone, leadName, expoEventId, institutionId' },
        { status: 400 }
      );
    }

    const result = await ExpoWhatsAppService.sendExpoWelcome({
      leadId,
      leadPhone,
      leadName,
      parentPhone: parentPhone || null,
      parentName: parentName || null,
      eventName: eventName || 'Exhibition',
      institutionId,
      institutionName: institutionName || undefined,
      expoEventId,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('[admission/expo-wa] Welcome route error:', err);
    // Always return 200 — WA send failure should never block the capture flow
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : 'Internal error',
    });
  }
}
