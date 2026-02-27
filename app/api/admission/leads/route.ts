// app/api/admission/leads/route.ts
// Public webhook endpoint for inbound lead capture from external systems.
// Auth: X-API-Key header must match ADMISSION_WEBHOOK_API_KEY env variable.
//
// Callers: website contact forms, Google Ads lead extensions, Facebook Lead Ads,
// and any third-party CRM integrations that push leads into MyJKKN.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { LeadService } from '@/lib/services/admission/lead-service';

interface WebhookLeadPayload {
  institution_id: string;
  full_name: string;
  phone: string;
  email?: string;
  source?: string;
  interested_programs?: string[];
  utm_source?: string;
  utm_campaign?: string;
  notes?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Validate API key — reject unauthenticated callers immediately
  const apiKey = request.headers.get('X-API-Key');
  if (!apiKey || apiKey !== process.env.ADMISSION_WEBHOOK_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Parse body
  let body: WebhookLeadPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    institution_id,
    full_name,
    phone,
    email,
    source,
    interested_programs,
    utm_source,
    utm_campaign,
    notes,
  } = body;

  // 3. Required field validation
  if (!institution_id || !full_name || !phone) {
    return NextResponse.json(
      { error: 'Missing required fields: institution_id, full_name, phone' },
      { status: 422 }
    );
  }

  // 4. Build notes with UTM attribution if provided
  const enrichedNotes =
    [
      notes,
      utm_source ? `utm_source: ${utm_source}` : null,
      utm_campaign ? `utm_campaign: ${utm_campaign}` : null,
    ]
      .filter(Boolean)
      .join(' | ') || undefined;

  // 5. Create lead — service role client bypasses RLS for unauthenticated webhook.
  //    The client is injected via supabaseOverride to avoid mutating shared static
  //    state on LeadService (safe for concurrent serverless invocations).
  try {
    const serviceClient = createServiceRoleClient();

    const lead = await LeadService.createLead(
      {
        institution_id,
        full_name: full_name.trim(),
        phone,
        email: email || undefined,
        source: (source as any) || 'website',
        interested_programs: interested_programs || [],
        notes: enrichedNotes,
      },
      undefined, // no authenticated user session for webhooks
      serviceClient
    );

    return NextResponse.json({ id: lead.id, status: 'created' }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create lead';

    // Duplicate lead — caller should update existing lead rather than create new
    if (message.startsWith('Duplicate lead:')) {
      return NextResponse.json({ error: message }, { status: 409 });
    }

    // Phone validation failure
    if (message.includes('Invalid phone number')) {
      return NextResponse.json({ error: message }, { status: 422 });
    }

    console.error('[webhook/leads] Failed to create lead:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
