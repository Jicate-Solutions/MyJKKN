// app/api/admission/leads/route.ts
// Public webhook endpoint for inbound lead capture from external systems.
// Auth: X-API-Key header must match ADMISSION_WEBHOOK_API_KEY env variable.
//
// Callers: website contact forms, Google Ads lead extensions, Facebook Lead Ads,
// and any third-party CRM integrations that push leads into MyJKKN.

import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse, connection } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { LeadService } from '@/lib/services/admission/lead-service';
import type { LeadSource } from '@/types/admission';

// Fix 3: runtime list of valid source values (union types don't exist at runtime)
const VALID_SOURCES: LeadSource[] = [
  'website', 'walk_in', 'referral', 'social_media', 'newspaper',
  'education_fair', 'agent', 'publisher', 'google_ads', 'facebook_ads', 'other',
];

interface WebhookLeadPayload {
  institution_id: string;
  // New format (preferred)
  first_name?: string;
  last_name?: string | null;
  // Legacy format — still accepted so existing Google Ads / Facebook / CRM integrations keep working
  full_name?: string;
  phone: string;
  email?: string;
  source?: string;
  interested_programs?: unknown[];
  utm_source?: string;
  utm_campaign?: string;
  notes?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Validate API key — reject unauthenticated callers immediately.
  //    Fix 1: timing-safe comparison prevents timing-based key enumeration.
  const submittedKey = request.headers.get('X-API-Key') ?? '';
  const expectedKey = process.env.ADMISSION_WEBHOOK_API_KEY ?? '';

  const submittedBuf = Buffer.from(submittedKey);
  const expectedBuf = Buffer.from(expectedKey);

  const isValid =
    expectedBuf.length > 0 &&
    submittedBuf.length === expectedBuf.length &&
    timingSafeEqual(submittedBuf, expectedBuf);

  if (!isValid) {
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
    phone,
    email,
    source,
    interested_programs,
    utm_source,
    utm_campaign,
    notes,
  } = body;

  // 3. Resolve first_name / last_name — support both new and legacy full_name format
  let first_name: string;
  let last_name: string | null = null;
  if (body.first_name?.trim()) {
    first_name = body.first_name.trim();
    last_name = body.last_name?.trim() || null;
  } else if (body.full_name?.trim()) {
    // Legacy: split "John Doe" → first_name="John", last_name="Doe"
    const parts = body.full_name.trim().split(/\s+/);
    first_name = parts[0];
    last_name = parts.length > 1 ? parts.slice(1).join(' ') : null;
  } else {
    first_name = '';
  }

  // 4. Required field validation
  if (!institution_id || !first_name || !phone) {
    return NextResponse.json(
      { error: 'Missing required fields: institution_id, first_name (or full_name), phone' },
      { status: 422 }
    );
  }

  // 4. Build notes with UTM attribution if provided.
  //    Fix 2: trim notes and utm values before including in the joined string.
  const enrichedNotes =
    [
      notes?.trim(),
      utm_source ? `utm_source: ${utm_source.trim()}` : null,
      utm_campaign ? `utm_campaign: ${utm_campaign.trim()}` : null,
    ]
      .filter(Boolean)
      .join(' | ') || undefined;

  // Fix 3: validate source against the LeadSource enum; default to 'website'
  //        for unknown values so callers without exact source control still work.
  const rawSource = source?.trim();
  const validatedSource: LeadSource =
    rawSource && VALID_SOURCES.includes(rawSource as LeadSource)
      ? (rawSource as LeadSource)
      : 'website';

  // Fix 4: validate interested_programs — keep only non-empty strings, trim each.
  const validatedPrograms = (interested_programs ?? [])
    .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    .map((p) => p.trim());

  // 5. Create lead — service role client bypasses RLS for unauthenticated webhook.
  //    The client is injected via supabaseOverride to avoid mutating shared static
  //    state on LeadService (safe for concurrent serverless invocations).
  try {
    const serviceClient = createServiceRoleClient();

    // Fix 2: all string fields explicitly trimmed at the route boundary.
    const lead = await LeadService.createLead(
      {
        institution_id,
        first_name,
        last_name,
        phone: phone.trim(),
        email: email?.trim() || undefined,
        source: validatedSource,
        interested_programs: validatedPrograms,
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
