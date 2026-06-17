// app/api/public/routing-form/[slug]/submit/route.ts
//
// POST — evaluate a routing form's rules against the visitor's answers, persist
// the response, and return the resolved destination. PUBLIC (no auth) — powers
// /r/[slug]. Added: 2026-06-17 — Universal Booking M1 (Routing Forms).
//
// Flow:
//   1. Load the active form + its rules via the anon RPC fn_get_active_routing_form
//      (single round-trip; base tables deny anon).
//   2. Run the SHARED pure evaluator (evaluateRouting) — same logic the admin
//      preview uses, so behaviour can never drift.
//   3. Persist via fn_submit_routing_form_response (anon RPC; only write path).
//   4. Return { redirect } for event_link/url, or { message } for a message
//      destination, or an explicit no_destination state (rule #27 — never fail
//      silently).
//
// Pattern: app/api/public/booking/[slug]/slots/route.ts (service-role client +
// in-memory IP rate limit + honeypot).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  evaluateRouting,
  type RoutingRule,
  type RoutingAnswers,
} from '@/lib/services/meetings/routing-rule-evaluator';

export const dynamic = 'force-dynamic';

// Submissions are write operations — bound them per-IP.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 15;
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

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;

    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 },
      );
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>));

    // Honeypot — invisible field; bots fill it. Pretend success without writing.
    if (typeof body.honeypot === 'string' && body.honeypot.trim().length > 0) {
      return NextResponse.json({ success: true, destination: null });
    }

    const answers: RoutingAnswers =
      body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers)
        ? (body.answers as RoutingAnswers)
        : {};
    const attendeeEmail =
      typeof body.email === 'string' && body.email.trim() ? body.email.trim() : null;

    const supabase = serviceClient();

    // 1. Load active form + rules via anon-callable RPC.
    const { data: formDoc, error: loadErr } = await supabase.rpc(
      'fn_get_active_routing_form',
      { p_slug: slug },
    );
    if (loadErr) {
      console.error('[routing-form/submit] load failed:', loadErr.message);
      return NextResponse.json(
        { error: 'Could not load this form. Please try again.' },
        { status: 500 },
      );
    }
    if (!formDoc) {
      return NextResponse.json(
        { error: 'form_not_found', message: 'This routing form is not available.' },
        { status: 404 },
      );
    }

    const rules: RoutingRule[] = Array.isArray((formDoc as Record<string, unknown>).rules)
      ? ((formDoc as Record<string, unknown>).rules as RoutingRule[])
      : [];

    // 2. Evaluate (shared pure function).
    const result = evaluateRouting(answers, rules);

    // 3. Persist the response (anon RPC — only write path).
    const { error: writeErr } = await supabase.rpc('fn_submit_routing_form_response', {
      p_slug: slug,
      p_answers: answers,
      p_matched_rule_id: result.rule?.id ?? null,
      p_resolved_destination: result.destination
        ? { type: result.destination.type, value: result.destination.value }
        : {},
      p_attendee_email: attendeeEmail,
    });
    if (writeErr) {
      // Log but do not fail the visitor — they still deserve their destination.
      console.error('[routing-form/submit] response insert failed:', writeErr.message);
    }

    // 4. Shape the destination for the client.
    if (!result.destination) {
      // No rule matched and no default configured — explicit, never silent.
      return NextResponse.json({
        success: true,
        destination: null,
        message: 'no_destination',
      });
    }

    const { type, value } = result.destination;
    if (type === 'event_link' || type === 'url') {
      const url = typeof value.url === 'string' ? value.url.trim() : '';
      if (!url) {
        return NextResponse.json({ success: true, destination: null, message: 'no_destination' });
      }
      return NextResponse.json({
        success: true,
        destination: { type, redirect: url },
      });
    }

    // type === 'message'
    const markdown = typeof value.markdown === 'string' ? value.markdown : '';
    return NextResponse.json({
      success: true,
      destination: { type: 'message', markdown },
    });
  } catch (err) {
    console.error('[routing-form/submit] unexpected error:', err);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 },
    );
  }
}
