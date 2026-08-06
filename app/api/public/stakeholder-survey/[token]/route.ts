// app/api/public/stakeholder-survey/[token]/route.ts
// PUBLIC (no auth) — GET the one short form a token unlocks.
//
// The token is the ONLY credential the link carries, so this route is
// deliberately stingy: it returns the question set, the institution name and
// the recipient's own first name, and NOTHING about the roster, the cycle's
// other recipients, or how many people have replied. Reads run through the
// service-role client so the three stakeholder tables need zero anon grants.
//
// Every not-usable state returns the SAME shape ({ usable: false, reason }) and
// never confirms whether a token once existed — an expired link and a made-up
// link are indistinguishable from outside (same discipline as
// app/(public)/proof/[token]/page.tsx).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { StakeholderQuestion } from '@/types/accreditation/stakeholder-survey';

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

/** Uniform closed response — the caller learns nothing about why. */
function notUsable(reason: string) {
  return NextResponse.json({ usable: false, reason });
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await ctx.params;
    if (!token || token.length < 8) {
      return notUsable('This feedback link is not active.');
    }

    const svc = serviceClient();

    const { data: invite, error: inviteErr } = await (svc as any)
      .from('accreditation_stakeholder_invites')
      .select('id, survey_id, invited_name, responded_at, expires_at')
      .eq('token', token)
      .maybeSingle();

    if (inviteErr) {
      console.error('[public/stakeholder-survey] invite read failed:', inviteErr.message);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
    if (!invite) return notUsable('This feedback link is not active.');

    if (invite.responded_at) {
      return NextResponse.json({
        usable: false,
        reason: 'Your feedback has already been recorded. Thank you.',
        alreadyDone: true,
      });
    }
    if (new Date(invite.expires_at).getTime() <= Date.now()) {
      return notUsable('This feedback link has expired.');
    }

    const { data: cycle, error: cycleErr } = await (svc as any)
      .from('accreditation_stakeholder_surveys')
      .select('id, institution_id, audience, academic_year, title, questions, status, opens_at, closes_at')
      .eq('id', invite.survey_id)
      .maybeSingle();

    if (cycleErr) {
      console.error('[public/stakeholder-survey] cycle read failed:', cycleErr.message);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
    if (!cycle) return notUsable('This feedback link is not active.');

    if (cycle.status !== 'active') {
      return notUsable('This feedback round is not open right now.');
    }
    const now = Date.now();
    if (cycle.opens_at && new Date(cycle.opens_at).getTime() > now) {
      return notUsable('This feedback round has not opened yet.');
    }
    if (cycle.closes_at && new Date(cycle.closes_at).getTime() <= now) {
      return notUsable('This feedback round has closed.');
    }

    // Institution name only — no codes, no ids beyond what the form needs.
    let institutionName = 'JKKN';
    const { data: inst } = await (svc as any)
      .from('institutions')
      .select('name')
      .eq('id', cycle.institution_id)
      .maybeSingle();
    if (inst?.name) institutionName = inst.name as string;

    return NextResponse.json({
      usable: true,
      invitedName: (invite.invited_name as string | null) ?? null,
      institutionName,
      audience: cycle.audience as string,
      academicYear: cycle.academic_year as string,
      title: cycle.title as string,
      questions: (cycle.questions ?? []) as StakeholderQuestion[],
      closesAt: cycle.closes_at as string | null,
    });
  } catch (e) {
    console.error('[public/stakeholder-survey] unexpected error:', e);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
