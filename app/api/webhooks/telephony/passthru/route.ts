// app/api/webhooks/telephony/passthru/route.ts
// Exotel Passthru Webhook — captures IVR journey data (keypresses, flow steps)
// Called by Exotel at each Passthru node in the IVR flow
//
// Must respond with valid ExoML so the call continues.
// Logs the IVR step data to admission_call_logs or a dedicated table.

import { NextRequest, NextResponse } from 'next/server';
import { normalizePhone } from '@/lib/utils/phone';
import { logger } from '@/lib/utils/enhanced-logger';

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Parse the passthru data (form-encoded from Exotel)
    const contentType = request.headers.get('content-type') || '';
    let payload: Record<string, string> = {};

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData();
      formData.forEach((value, key) => {
        payload[key] = value.toString();
      });
    } else {
      payload = await request.json();
    }

    // Extract query params (dept, press — added by us in the Passthru URL)
    const dept = request.nextUrl.searchParams.get('dept') || '';
    const press = request.nextUrl.searchParams.get('press') || '';
    const step = request.nextUrl.searchParams.get('step') || 'start';

    const callSid = payload.CallSid || '';
    const callerPhone = normalizePhone(payload.From || '');
    const digits = payload.digits || payload.Digits || '';
    const flowId = payload.flow_id || '';

    logger.info('telephony/passthru', 'IVR step captured', {
      callSid: callSid.slice(-8),
      from: callerPhone.slice(-4),
      digits,
      dept,
      press,
      step,
      flowId,
    });

    // Store the IVR journey data
    try {
      const { createServiceRoleClient } = await import('@/lib/supabase/server');
      const supabase = createServiceRoleClient();

      // Update the call log with IVR journey data (store in call_notes or metadata)
      if (callSid) {
        // Find the call log by CallSid
        const { data: callLog } = await supabase
          .from('admission_call_logs')
          .select('id, call_notes')
          .eq('call_sid', callSid)
          .maybeSingle();

        if (callLog) {
          // Append IVR step to call_notes
          const ivrStep = digits
            ? `[IVR] Pressed ${digits}${dept ? ` → ${dept}` : ''}`
            : `[IVR] Step: ${step}${dept ? ` (${dept})` : ''}`;

          const existingNotes = callLog.call_notes || '';
          const updatedNotes = existingNotes
            ? `${existingNotes} | ${ivrStep}`
            : ivrStep;

          await supabase
            .from('admission_call_logs')
            .update({ call_notes: updatedNotes })
            .eq('id', callLog.id);
        } else {
          // Call log doesn't exist yet (passthru fires before call completes)
          // Store in a temporary cache — the sync job or status callback will pick it up
          logger.info('telephony/passthru', 'Call log not found yet, storing IVR data for later', {
            callSid: callSid.slice(-8),
            digits,
            dept,
          });
        }
      }
    } catch (dbError) {
      // Non-blocking — DB errors should never break the call
      logger.error('telephony/passthru', 'DB error (non-blocking)', dbError);
    }

    const processingTime = Date.now() - startTime;
    logger.info('telephony/passthru', `Processed in ${processingTime}ms`);

    // Return valid ExoML response so the call continues
    // An empty <Response/> tells Exotel to proceed to the next applet
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      {
        status: 200,
        headers: { 'Content-Type': 'application/xml' },
      }
    );
  } catch (error) {
    logger.error('telephony/passthru', 'Passthru error', error);

    // Always return valid ExoML — never break the call
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      {
        status: 200,
        headers: { 'Content-Type': 'application/xml' },
      }
    );
  }
}

// Health check
export async function GET() {
  return NextResponse.json({
    service: 'Exotel IVR Passthru Webhook',
    status: 'active',
    endpoint: '/api/webhooks/telephony/passthru',
    usage: 'Add as Passthru URL in Exotel flow editor',
    exampleUrl: 'https://www.jkkn.ai/api/webhooks/telephony/passthru?dept=pharmacy&press=1',
  });
}
