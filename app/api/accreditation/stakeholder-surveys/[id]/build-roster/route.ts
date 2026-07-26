// app/api/accreditation/stakeholder-surveys/[id]/build-roster/route.ts
// POST → build the recipient roster for one employer/alumni feedback cycle from
// the contact sources that ALREADY exist. No parallel contact list is created.
//
//   audience 'alumni'   → learners_profiles WHERE lifecycle_status='graduated',
//                         scoped to the cycle's institution
//   audience 'industry' → cdc_recruiters (active, not blacklisted, has an email)
//                         + cdc_employer_requirements (approved-ish, has an
//                         email). NOTE cdc_recruiters has NO institution_id —
//                         only is_internal + internal_institution_id — so
//                         employer contacts are group-wide by nature and cannot
//                         be institution-filtered. Recruiters flagged internal
//                         to a DIFFERENT institution are excluded.
//
// WHY A SERVER ROUTE AND NOT THE BROWSER CLIENT: an IQAC coordinator who
// legitimately owns this cycle may hold no learner-data permission. Under RLS
// the browser client would return zero rows and the roster would silently look
// "built but empty". So authorization is checked here against the permission +
// institution scope, and only then is the contact read done with the service
// role, narrowed to this one cycle's institution.
//
// Idempotent: re-running adds only newly-found contacts (UNIQUE(survey_id,
// invited_email) upsert with ignoreDuplicates) and never disturbs anyone who
// has already responded.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { createApiInstitutionFilter } from '@/lib/auth/api-institution-filter';

const INVITE_TTL_DAYS = 120;
const MAX_RECIPIENTS = 5000;

interface Candidate {
  email: string;
  name: string | null;
  source_table: string;
  source_id: string | null;
}

function newToken(): string {
  // 32 url-safe chars — unguessable, and the only credential the link carries.
  return randomBytes(24).toString('base64url');
}

function pushCandidate(map: Map<string, Candidate>, c: Candidate) {
  const key = c.email.trim().toLowerCase();
  if (!key || !key.includes('@')) return;
  if (map.has(key)) return;
  map.set(key, { ...c, email: key });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { data: canManage } = await supabase.rpc('user_has_permission', {
      permission_name: 'accreditation.naac.surveys.stakeholder.manage',
    });
    if (canManage !== true) {
      return NextResponse.json(
        { error: 'You do not have access to build a feedback roster — ask your IQAC coordinator for accreditation.naac.surveys.stakeholder.manage.' },
        { status: 403 }
      );
    }

    const filter = await createApiInstitutionFilter(req);
    if (!filter.isAllowed) {
      return NextResponse.json({ error: filter.reason ?? 'Not authorized' },
        { status: filter.reason === 'User not authenticated' ? 401 : 403 });
    }

    const svc = createServiceRoleClient();

    const { data: cycle, error: cycleErr } = await (svc as any)
      .from('accreditation_stakeholder_surveys')
      .select('id, institution_id, audience, status')
      .eq('id', id)
      .maybeSingle();
    if (cycleErr || !cycle) {
      return NextResponse.json({ error: 'Feedback cycle not found' }, { status: 404 });
    }

    const instIds: string[] = filter.institutionIds ?? [];
    if (instIds.length > 0 && !instIds.includes(cycle.institution_id)) {
      return NextResponse.json({ error: 'Outside your institution scope' }, { status: 403 });
    }
    if (cycle.status === 'closed' || cycle.status === 'archived') {
      return NextResponse.json(
        { error: 'This cycle is already closed — reopen it before adding recipients.' },
        { status: 400 }
      );
    }

    const candidates = new Map<string, Candidate>();

    if (cycle.audience === 'alumni') {
      const { data: alumni, error } = await (svc as any)
        .from('learners_profiles')
        .select('id, first_name, last_name, student_email, college_email')
        .eq('lifecycle_status', 'graduated')
        .eq('institution_id', cycle.institution_id)
        .limit(MAX_RECIPIENTS);
      if (error) {
        console.error('[stakeholder-surveys/build-roster] alumni read failed:', error.message);
        return NextResponse.json({ error: 'Could not read the alumni list.' }, { status: 500 });
      }
      for (const a of (alumni ?? []) as any[]) {
        const email = a.student_email || a.college_email;
        if (!email) continue;
        pushCandidate(candidates, {
          email,
          name: [a.first_name, a.last_name].filter(Boolean).join(' ') || null,
          source_table: 'learners_profiles',
          source_id: a.id,
        });
      }
    } else {
      const { data: recruiters, error: recErr } = await (svc as any)
        .from('cdc_recruiters')
        .select('id, name, primary_contact_name, primary_contact_email, is_active, is_blacklisted, is_internal, internal_institution_id')
        .eq('is_active', true)
        .eq('is_blacklisted', false)
        .not('primary_contact_email', 'is', null)
        .limit(MAX_RECIPIENTS);
      if (recErr) {
        console.error('[stakeholder-surveys/build-roster] recruiters read failed:', recErr.message);
        return NextResponse.json({ error: 'Could not read the employer list.' }, { status: 500 });
      }
      for (const r of (recruiters ?? []) as any[]) {
        // An internal recruiter belonging to another institution is not this
        // institution's external stakeholder.
        if (r.is_internal && r.internal_institution_id && r.internal_institution_id !== cycle.institution_id) continue;
        pushCandidate(candidates, {
          email: r.primary_contact_email,
          name: r.primary_contact_name || r.name || null,
          source_table: 'cdc_recruiters',
          source_id: r.id,
        });
      }

      const { data: reqs, error: reqErr } = await (svc as any)
        .from('cdc_employer_requirements')
        .select('id, company_name, primary_contact_name, primary_contact_email, status')
        .not('primary_contact_email', 'is', null)
        .neq('status', 'rejected')
        .limit(MAX_RECIPIENTS);
      if (reqErr) {
        console.error('[stakeholder-surveys/build-roster] employer requirements read failed:', reqErr.message);
        return NextResponse.json({ error: 'Could not read the employer submissions.' }, { status: 500 });
      }
      for (const r of (reqs ?? []) as any[]) {
        pushCandidate(candidates, {
          email: r.primary_contact_email,
          name: r.primary_contact_name || r.company_name || null,
          source_table: 'cdc_employer_requirements',
          source_id: r.id,
        });
      }
    }

    if (candidates.size === 0) {
      return NextResponse.json({
        added: 0,
        found: 0,
        message: cycle.audience === 'alumni'
          ? 'No graduated learners with an email address were found for this institution.'
          : 'No employer contacts with an email address were found. Add recruiter contact emails under CDC first.',
      });
    }

    const expires = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const rows = Array.from(candidates.values()).map((c) => ({
      survey_id: cycle.id,
      token: newToken(),
      invited_email: c.email,
      invited_name: c.name,
      source_table: c.source_table,
      source_id: c.source_id,
      expires_at: expires,
      created_by: user.id,
    }));

    // ignoreDuplicates: re-running the build must never reset an existing
    // invite's token or wipe its responded_at.
    const { data: inserted, error: insErr } = await (svc as any)
      .from('accreditation_stakeholder_invites')
      .upsert(rows, { onConflict: 'survey_id,invited_email', ignoreDuplicates: true })
      .select('id');
    if (insErr) {
      console.error('[stakeholder-surveys/build-roster] invite insert failed:', insErr.message);
      return NextResponse.json({ error: 'Could not save the recipient list.' }, { status: 500 });
    }

    return NextResponse.json({
      added: inserted?.length ?? 0,
      found: candidates.size,
    });
  } catch (e) {
    console.error('[stakeholder-surveys/build-roster] unexpected error:', e);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
