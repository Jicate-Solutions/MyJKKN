import { NextRequest, NextResponse } from 'next/server';
import { normalizePhone } from '@/lib/utils/phone';
import { logger } from '@/lib/utils/enhanced-logger';

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let payload: Record<string, string> = {};
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData();
      formData.forEach((value, key) => { payload[key] = value.toString(); });
    } else {
      payload = await request.json();
    }

    const dept = request.nextUrl.searchParams.get('dept') || '';
    const press = request.nextUrl.searchParams.get('press') || '';
    const step = request.nextUrl.searchParams.get('step') || 'start';
    const callSid = payload.CallSid || '';
    const callerPhone = normalizePhone(payload.From || '');
    const digits = payload.digits || payload.Digits || '';

    logger.info('telephony/passthru', 'IVR step captured', {
      callSid: callSid.slice(-8), from: callerPhone.slice(-4),
      digits, dept, press, step,
    });

    try {
      const { createServiceRoleClient } = await import('@/lib/supabase/server');
      const supabase = createServiceRoleClient();
      if (callSid) {
        const { data: callLog } = await supabase
          .from('admission_call_logs')
          .select('id, call_notes')
          .eq('call_sid', callSid)
          .maybeSingle();
        if (callLog) {
          const ivrStep = digits
            ? `[IVR] Pressed ${digits}${dept ? ` → ${dept}` : ''}`
            : `[IVR] Step: ${step}${dept ? ` (${dept})` : ''}`;
          const updatedNotes = callLog.call_notes
            ? `${callLog.call_notes} | ${ivrStep}`
            : ivrStep;
          await supabase.from('admission_call_logs')
            .update({ call_notes: updatedNotes }).eq('id', callLog.id);
        }
      }
    } catch (dbError) {
      logger.error('telephony/passthru', 'DB error (non-blocking)', dbError);
    }

    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { status: 200, headers: { 'Content-Type': 'application/xml' } }
    );
  } catch (error) {
    logger.error('telephony/passthru', 'Passthru error', error);
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { status: 200, headers: { 'Content-Type': 'application/xml' } }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    service: 'Exotel IVR Passthru Webhook',
    status: 'active',
    endpoint: '/api/webhooks/telephony/passthru',
    usage: 'Add as Passthru URL in Exotel flow editor',
    exampleUrl: 'https://www.jkkn.ai/api/webhooks/telephony/passthru?dept=pharmacy&press=1',
  });
}
