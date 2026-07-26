// app/api/public/stakeholder-survey/[token]/submit/route.ts
// PUBLIC (no auth) — one external stakeholder submits one short feedback form.
//
// Anti-abuse, copied from the two public write paths already in production:
//   * honeypot field `company_fax` (app/api/public/cdc/employer-submit) —
//     silently returns a plausible success so bots learn nothing
//   * in-memory per-IP rate limit (app/api/public/forms/[slug]/submit)
//   * single-use: the token is spent the moment responded_at is stamped, and
//     the stamp is written with a `responded_at IS NULL` predicate so two
//     concurrent submits cannot both win
//   * answers are coerced against the cycle's OWN frozen question set — any
//     key the cycle did not ask is dropped, scales are clamped to ints in
//     range, free text is truncated
//
// PRIVACY: three writes, and what goes where is the whole design.
//   1. accreditation_survey_consents — the EXISTING DPDPA 2023 consent table,
//      keyed on its nullable alumni_email slot. No second consent mechanism.
//   2. accreditation_stakeholder_responses — answers and nothing else. No
//      email, no name, no IP, no user-agent on the answer row.
//   3. the invite row gets responded_at. Identity stays there, and only there.
// IP and user-agent are recorded ONCE, on the consent row, because DPDPA
// consent evidence is exactly what they are for — they are never attached to
// the opinions.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  MAX_FREE_TEXT,
  SCALE_MAX,
  SCALE_MIN,
  type StakeholderQuestion,
} from '@/types/accreditation/stakeholder-survey';

// The version the existing consent page already issues — reused, not re-minted.
const CONSENT_VERSION = '1.0-2026-04-19';
const CONSENT_PURPOSE = 'accreditation_surveys';

const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

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
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

/**
 * Build the stored answer object from the cycle's own questions. Anything the
 * cycle did not ask never reaches the row, so a crafted payload cannot widen
 * what we store about a person.
 */
function coerceAnswers(
  questions: StakeholderQuestion[],
  raw: Record<string, unknown>
): { answers: Record<string, number | string>; scaleCount: number } {
  const answers: Record<string, number | string> = {};
  let scaleCount = 0;

  for (const q of questions) {
    const v = raw?.[q.key];
    if (q.type === 'scale') {
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(n)) continue;
      const min = q.min ?? SCALE_MIN;
      const max = q.max ?? SCALE_MAX;
      const clamped = Math.min(max, Math.max(min, Math.round(n)));
      answers[q.key] = clamped;
      scaleCount++;
    } else if (typeof v === 'string') {
      const t = v.trim().slice(0, MAX_FREE_TEXT);
      if (t) answers[q.key] = t;
    }
  }

  return { answers, scaleCount };
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await ctx.params;

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Too many submissions from this connection. Please try again later.' },
        { status: 429 }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // Honeypot — a real person never sees this field. Return a plausible
    // success without persisting anything.
    if (typeof body.company_fax === 'string' && body.company_fax.trim() !== '') {
      return NextResponse.json({ success: true });
    }

    if (body.consent !== true) {
      return NextResponse.json(
        { error: 'Please tick the consent box before sending your feedback.' },
        { status: 400 }
      );
    }

    if (!token || token.length < 8) {
      return NextResponse.json({ error: 'This feedback link is not active.' }, { status: 400 });
    }

    const svc = serviceClient();

    const { data: invite, error: inviteErr } = await (svc as any)
      .from('accreditation_stakeholder_invites')
      .select('id, survey_id, invited_email, responded_at, expires_at')
      .eq('token', token)
      .maybeSingle();

    if (inviteErr) {
      console.error('[public/stakeholder-survey/submit] invite read failed:', inviteErr.message);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
    if (!invite) {
      return NextResponse.json({ error: 'This feedback link is not active.' }, { status: 400 });
    }
    if (invite.responded_at) {
      return NextResponse.json({ error: 'Your feedback has already been recorded. Thank you.' }, { status: 409 });
    }
    if (new Date(invite.expires_at).getTime() <= Date.now()) {
      return NextResponse.json({ error: 'This feedback link has expired.' }, { status: 400 });
    }

    const { data: cycle, error: cycleErr } = await (svc as any)
      .from('accreditation_stakeholder_surveys')
      .select('id, body_code, audience, questions, status, opens_at, closes_at')
      .eq('id', invite.survey_id)
      .maybeSingle();

    if (cycleErr) {
      console.error('[public/stakeholder-survey/submit] cycle read failed:', cycleErr.message);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
    if (!cycle || cycle.status !== 'active') {
      return NextResponse.json({ error: 'This feedback round is not open right now.' }, { status: 400 });
    }
    const now = Date.now();
    if (cycle.opens_at && new Date(cycle.opens_at).getTime() > now) {
      return NextResponse.json({ error: 'This feedback round has not opened yet.' }, { status: 400 });
    }
    if (cycle.closes_at && new Date(cycle.closes_at).getTime() <= now) {
      return NextResponse.json({ error: 'This feedback round has closed.' }, { status: 400 });
    }

    const questions = (cycle.questions ?? []) as StakeholderQuestion[];
    const rawAnswers = (body.answers && typeof body.answers === 'object')
      ? (body.answers as Record<string, unknown>)
      : {};
    const { answers, scaleCount } = coerceAnswers(questions, rawAnswers);

    const scaleQuestions = questions.filter((q) => q.type === 'scale').length;
    if (scaleCount < scaleQuestions) {
      return NextResponse.json(
        { error: 'Please answer every rating question before sending.' },
        { status: 400 }
      );
    }

    // 1. Spend the token FIRST, guarded on responded_at IS NULL. If a second
    //    request is racing this one, exactly one update matches a row — so at
    //    most one answer row can ever be written per invite.
    const stampedAt = new Date().toISOString();
    const { data: stamped, error: stampErr } = await (svc as any)
      .from('accreditation_stakeholder_invites')
      .update({ responded_at: stampedAt })
      .eq('id', invite.id)
      .is('responded_at', null)
      .select('id');

    if (stampErr) {
      console.error('[public/stakeholder-survey/submit] token spend failed:', stampErr.message);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
    if (!stamped || stamped.length === 0) {
      return NextResponse.json({ error: 'Your feedback has already been recorded. Thank you.' }, { status: 409 });
    }

    // 2. Consent row on the EXISTING DPDPA table. IP + user-agent live here,
    //    where consent evidence belongs — never on the answer row.
    const { error: consentErr } = await (svc as any)
      .from('accreditation_survey_consents')
      .insert({
        alumni_email: invite.invited_email,
        consent_version: CONSENT_VERSION,
        body_codes: [cycle.body_code ?? 'NAAC'],
        purpose: CONSENT_PURPOSE,
        legal_basis: 'consent',
        scope: {
          audience: cycle.audience,
          survey_id: cycle.id,
          collects: 'ratings_and_optional_comment',
          shared_as: 'aggregate_counts_and_averages_only',
        },
        consented_at: stampedAt,
        ip_address: ip !== 'unknown' ? ip : null,
        user_agent: req.headers.get('user-agent')?.slice(0, 500) ?? null,
      });

    if (consentErr) {
      // Consent is the legal basis for storing the answers, so a failure here
      // must NOT leave the answers stored. Release the token and stop.
      console.error('[public/stakeholder-survey/submit] consent write failed:', consentErr.message);
      await (svc as any)
        .from('accreditation_stakeholder_invites')
        .update({ responded_at: null })
        .eq('id', invite.id);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    // 3. The answers. No email, no name, no IP, no user-agent.
    const { error: respErr } = await (svc as any)
      .from('accreditation_stakeholder_responses')
      .insert({
        survey_id: cycle.id,
        invite_id: invite.id,
        answers,
        submitted_at: stampedAt,
      });

    if (respErr) {
      console.error('[public/stakeholder-survey/submit] response write failed:', respErr.message);
      await (svc as any)
        .from('accreditation_stakeholder_invites')
        .update({ responded_at: null })
        .eq('id', invite.id);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[public/stakeholder-survey/submit] unexpected error:', e);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
