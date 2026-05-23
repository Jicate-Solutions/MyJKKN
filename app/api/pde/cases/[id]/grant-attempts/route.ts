// app/api/pde/cases/[id]/grant-attempts/route.ts
// Faculty grants N extra attempts to a specific learner with mandatory reason.
//
// POST /api/pde/cases/[id]/grant-attempts
//   Body: { learner_id, attempts_granted, reason }
//   Writes a pde_attempt_grants row (table proposal in final report — Agent D scope flagged but NOT auto-applied).
//
// Until pde_attempt_grants exists in prod, this endpoint stores grants into
// pde_engagement_events with event_type='attempt_grant' as a defensive fallback.
// This keeps the audit trail intact even before the dedicated table lands.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface GrantBody {
  learner_id: string;
  attempts_granted: number;
  reason: string;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id: caseId } = await context.params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json()) as Partial<GrantBody>;
    if (!body.learner_id) {
      return NextResponse.json({ error: 'learner_id required' }, { status: 400 });
    }
    if (!body.attempts_granted || body.attempts_granted < 1 || body.attempts_granted > 10) {
      return NextResponse.json({ error: 'attempts_granted must be between 1 and 10' }, { status: 400 });
    }
    if (!body.reason || body.reason.trim().length < 5) {
      return NextResponse.json({ error: 'reason required (min 5 characters)' }, { status: 400 });
    }

    // Verify case exists + faculty has scope access
    const { data: caseRow, error: cErr } = await (supabase as any)
      .from('pde_assessments')
      .select('id, course_id, title, vac_courses(institution_id)')
      .eq('id', caseId)
      .eq('assessment_type', 'clinical_case')
      .single();
    if (cErr || !caseRow) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('institution_id, role')
      .eq('id', user.id)
      .single();
    const isSuper = profile?.role === 'super_admin' || profile?.role === 'platform_admin';
    const caseInstitution = (caseRow as any).vac_courses?.institution_id;
    if (!isSuper && profile?.institution_id && caseInstitution && profile.institution_id !== caseInstitution) {
      return NextResponse.json({ error: 'Forbidden — institution scope mismatch' }, { status: 403 });
    }

    // Try dedicated table first; fall back to engagement event log.
    const grantRow = {
      case_id: caseId,
      learner_id: body.learner_id,
      attempts_granted: body.attempts_granted,
      reason: body.reason.trim(),
      granted_by: user.id,
    };

    const { data: grant, error: grantErr } = await (supabase as any)
      .from('pde_attempt_grants')
      .insert(grantRow)
      .select()
      .single();

    if (!grantErr && grant) {
      return NextResponse.json({ data: grant }, { status: 201 });
    }

    // Fallback: pde_attempt_grants doesn't exist yet → log into engagement events.
    if (grantErr && (grantErr.code === '42P01' || /relation .* does not exist/i.test(grantErr.message || ''))) {
      const { data: event, error: evErr } = await (supabase as any)
        .from('pde_engagement_events')
        .insert({
          learner_id: body.learner_id,
          event_type: 'attempt_grant',
          course_id: caseRow.course_id,
          lesson_id: null,
          metadata: {
            case_id: caseId,
            case_title: caseRow.title,
            attempts_granted: body.attempts_granted,
            reason: body.reason.trim(),
            granted_by: user.id,
          },
        })
        .select()
        .single();
      if (evErr) throw evErr;
      return NextResponse.json(
        {
          data: {
            id: event.id,
            attempts_granted: body.attempts_granted,
            fallback_mode: 'engagement_event',
            note: 'pde_attempt_grants table not yet created; logged to pde_engagement_events',
          },
        },
        { status: 201 }
      );
    }

    throw grantErr;
  } catch (e: any) {
    console.error('POST /api/pde/cases/[id]/grant-attempts error:', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}
