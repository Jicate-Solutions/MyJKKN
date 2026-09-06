import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { LearnerRiskService } from '@/services/learner-risk-service';
import type { InterventionType } from '@/services/learner-risk-service';

const VALID_INTERVENTION_TYPES: InterventionType[] = [
  'call',
  'meeting',
  'referral_counselor',
  'referral_hod',
  'parent_contact',
  'other',
];

/**
 * GET /api/learners/[id]/interventions
 * Returns list of interventions for the learner, newest first.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_super_admin')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      );
    }

    const allowedRoles = [
      'principal',
      'hod',
      'faculty',
      'admin',
      'counselor',
      'accounts',
    ];
    if (!profile.is_super_admin && !allowedRoles.includes(profile.role)) {
      return NextResponse.json(
        { error: 'Forbidden - insufficient permissions' },
        { status: 403 }
      );
    }

    const { id: learner_id } = await params;
    const interventions = await LearnerRiskService.getInterventions(
      supabase,
      learner_id
    );

    return NextResponse.json({ data: interventions });
  } catch (error) {
    console.error('[API] Error in GET interventions:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/learners/[id]/interventions
 * Create a new intervention. Sets intervener_id from authenticated user.
 *
 * Body: { intervention_type, notes?, follow_up_date?, risk_score_at_time? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_super_admin, institution_id')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      );
    }

    const allowedRoles = [
      'principal',
      'hod',
      'faculty',
      'admin',
      'counselor',
      'accounts',
    ];
    if (!profile.is_super_admin && !allowedRoles.includes(profile.role)) {
      return NextResponse.json(
        { error: 'Forbidden - insufficient permissions' },
        { status: 403 }
      );
    }

    if (!profile.institution_id) {
      return NextResponse.json(
        { error: 'User has no institution assigned' },
        { status: 400 }
      );
    }

    const { id: learner_id } = await params;
    const body = await request.json();

    // Validate intervention_type
    if (
      !body.intervention_type ||
      !VALID_INTERVENTION_TYPES.includes(body.intervention_type)
    ) {
      return NextResponse.json(
        {
          error: `Invalid intervention_type. Must be one of: ${VALID_INTERVENTION_TYPES.join(', ')}`,
        },
        { status: 400 }
      );
    }

    const intervention = await LearnerRiskService.createIntervention(supabase, {
      learner_id,
      institution_id: profile.institution_id,
      intervener_id: user.id,
      intervention_type: body.intervention_type,
      notes: body.notes,
      risk_score_at_time: body.risk_score_at_time,
      follow_up_date: body.follow_up_date,
    });

    return NextResponse.json({ data: intervention }, { status: 201 });
  } catch (error) {
    console.error('[API] Error in POST interventions:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
