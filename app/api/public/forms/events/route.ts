// app/api/public/forms/events/route.ts
// POST — tracks form analytics events (views, field interactions, abandonment)
// Added: 2026-04-08

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';



const VALID_EVENTS = [
  'form_viewed',
  'form_started',
  'field_focused',
  'field_completed',
  'form_abandoned',
];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { formId, eventType, fieldKey, sessionId, metadata } = body;

    if (!formId || !eventType || !sessionId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!VALID_EVENTS.includes(eventType)) {
      return NextResponse.json({ error: 'Invalid event type' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    await supabase.from('admission_form_events').insert({
      form_id: formId,
      event_type: eventType,
      field_key: fieldKey || null,
      session_id: sessionId,
      metadata: metadata || {},
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[public/forms/events] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
