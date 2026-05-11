// app/api/public/forms/[slug]/submit/route.ts
// POST — processes public form submission and creates lead
// Added: 2026-04-08

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { FormSubmissionService } from '@/lib/services/admission/form-submission-service';

export const dynamic = 'force-dynamic';

// Simple in-memory rate limiting (per IP, 5 submissions per hour)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Too many submissions. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { formData, honeypot, sessionId, ...meta } = body;

    // Honeypot check (spam bots fill invisible fields)
    if (honeypot) {
      return NextResponse.json({ success: true, leadId: null });
    }

    if (!formData || typeof formData !== 'object') {
      return NextResponse.json({ error: 'Invalid submission data' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: form, error: formError } = await supabase
      .from('admission_forms')
      .select('*')
      .eq('slug', slug)
      .eq('status', 'published')
      .eq('is_active', true)
      .single();

    if (formError || !form) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    }

    const { data: sections } = await supabase
      .from('admission_form_sections')
      .select('*')
      .eq('form_id', form.id)
      .order('display_order');

    const { data: fields } = await supabase
      .from('admission_form_fields')
      .select('*')
      .eq('form_id', form.id)
      .order('display_order');

    const sectionsWithFields = (sections ?? []).map((s: any) => ({
      ...s,
      fields: (fields ?? []).filter((f: any) => f.section_id === s.id),
    }));

    const formWithSchema = { ...form, sections: sectionsWithFields };

    const userAgent = request.headers.get('user-agent') || '';
    const deviceType = /mobile/i.test(userAgent)
      ? 'mobile'
      : /tablet/i.test(userAgent)
      ? 'tablet'
      : 'desktop';

    const result = await FormSubmissionService.processSubmission(
      formWithSchema as any,
      {
        formData,
        ipAddress: ip,
        userAgent,
        utmSource: meta.utmSource,
        utmMedium: meta.utmMedium,
        utmCampaign: meta.utmCampaign,
        referrerUrl: meta.referrerUrl,
        deviceType,
      },
      supabase
    );

    if (result.success && sessionId) {
      // 2026-05-03: emit lead_id into form_submitted metadata so the
      // form-abandon recovery cron can flip "abandoned" → "submitted" without
      // needing a hash match. Idempotency: this is the same session_id used by
      // the field_focused / field_completed events, so the cron's
      // session-level "any form_submitted exists?" check resolves cleanly.
      await supabase.from('admission_form_events').insert({
        form_id: form.id,
        event_type: 'form_submitted',
        session_id: sessionId,
        metadata: { deviceType, ip, lead_id: result.leadId ?? null },
      });
    }

    if (!result.success) {
      const status = result.isDuplicate ? 409 : 422;
      return NextResponse.json(
        { error: result.error, isDuplicate: result.isDuplicate },
        { status }
      );
    }

    return NextResponse.json(
      {
        success: true,
        leadId: result.leadId,
        submissionId: result.submissionId,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[public/forms] Submit error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
