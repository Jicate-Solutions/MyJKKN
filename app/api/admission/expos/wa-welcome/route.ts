

// app/api/admission/expos/wa-welcome/route.ts
// Triggers WhatsApp welcome message for a lead captured at an expo.
// Supports both Meta WABA and personal WhatsApp channels.
// Called by the capture form after successful lead creation.

import { NextRequest, NextResponse, connection } from 'next/server';
import { getAuthUser } from '@/lib/supabase/server';
import { ExpoWhatsAppService } from '@/lib/services/admission/expo-whatsapp-service';
import type { ExpoWAChannelPreference } from '@/types/whatsapp-personal';

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
      channel = 'meta_waba' as ExpoWAChannelPreference,
    } = body;

    if (!leadId || !leadPhone || !leadName || !expoEventId || !institutionId) {
      return NextResponse.json(
        { error: 'Missing required fields: leadId, leadPhone, leadName, expoEventId, institutionId' },
        { status: 400 }
      );
    }

    const welcomeInput = {
      leadId,
      leadPhone,
      leadName,
      parentPhone: parentPhone || null,
      parentName: parentName || null,
      eventName: eventName || 'Exhibition',
      institutionId,
      institutionName: institutionName || undefined,
      expoEventId,
    };

    const results: { meta_waba?: any; personal?: any } = {};

    // Send via requested channel(s)
    if (channel === 'meta_waba' || channel === 'both') {
      results.meta_waba = await ExpoWhatsAppService.sendExpoWelcome(welcomeInput);
    }

    if (channel === 'personal' || channel === 'both') {
      results.personal = await ExpoWhatsAppService.sendExpoWelcomeViaPersonal(welcomeInput);
    }

    // Return combined results
    const anySuccess = results.meta_waba?.success || results.personal?.success;
    return NextResponse.json({
      success: anySuccess,
      channel,
      results,
    });
  } catch (err) {
    console.error('[admission/expo-wa] Welcome route error:', err);
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : 'Internal error',
    });
  }
}
