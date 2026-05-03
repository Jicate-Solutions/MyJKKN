// app/api/public/forms/events/route.ts
// POST — tracks form analytics events (views, field interactions, abandonment).
// 2026-05-03: extended to accept identity-bearing fields (phone/email/parent_phone/
// parent_email) on field_completed events. Raw PII is hashed SERVER-SIDE and only
// the hex digest is persisted into metadata.{phone_hash,email_hash}. The raw values
// never enter admission_form_events. Added: 2026-04-08

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { hashEmail, hashPhone } from '@/lib/utils/hash';

export const dynamic = 'force-dynamic';

// Public-form clients only emit the user-facing events. The sentinel
// 'abandon_recovery_triggered' is written by the recovery cron via
// service-role insert and is intentionally NOT in this list — clients
// must not be able to spoof it.
const VALID_EVENTS = [
  'form_viewed',
  'form_started',
  'field_focused',
  'field_completed',
  'form_abandoned',
];

// Field keys that carry identity. The form-abandon recovery cron matches on
// these hashes against admission_leads.phone / .email. Keep this list in sync
// with the form-builder's standard lead_field_map keys.
const IDENTITY_PHONE_KEYS = new Set(['phone', 'parent_phone', 'mobile', 'whatsapp_number']);
const IDENTITY_EMAIL_KEYS = new Set(['email', 'parent_email']);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      formId,
      eventType,
      fieldKey,
      sessionId,
      metadata,
      // 2026-05-03: optional identity payload — server hashes, never persists raw.
      fieldValue,
    } = body;

    if (!formId || !eventType || !sessionId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!VALID_EVENTS.includes(eventType)) {
      return NextResponse.json({ error: 'Invalid event type' }, { status: 400 });
    }

    // Build sanitized metadata. Pass-through everything the client sent EXCEPT
    // any keys reserved for hashed identity (defense-in-depth: client could try
    // to pre-poison metadata.phone_hash with a forged digest).
    const inMeta = (metadata && typeof metadata === 'object') ? metadata : {};
    const safeMeta: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(inMeta)) {
      if (k === 'phone_hash' || k === 'email_hash' || k === 'phone' || k === 'email') continue;
      safeMeta[k] = v;
    }

    // Hash identity ONLY on field_completed for known identity fields.
    if (
      eventType === 'field_completed' &&
      typeof fieldKey === 'string' &&
      typeof fieldValue === 'string' &&
      fieldValue.length > 0
    ) {
      if (IDENTITY_PHONE_KEYS.has(fieldKey)) {
        const h = hashPhone(fieldValue);
        if (h) safeMeta.phone_hash = h;
      } else if (IDENTITY_EMAIL_KEYS.has(fieldKey)) {
        const h = hashEmail(fieldValue);
        if (h) safeMeta.email_hash = h;
      }
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
      metadata: safeMeta,
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[public/forms/events] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
