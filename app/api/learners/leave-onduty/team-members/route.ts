/**
 * GET /api/learners/leave-onduty/team-members
 *
 * Server-side search for the Team OnDuty roster picker
 * (components/academic/leave-onduty/team-member-picker.tsx).
 *
 * The browser client previously queried `learners_profiles` directly for this
 * search. learners_profiles_select_policy only admits a row to a student
 * when it is their OWN row (student_email/college_email = auth.uid()'s
 * email) — staff-only view permissions cover every other case. So every
 * search a student ran against other students' rows came back empty under
 * RLS, and Team OnDuty could never be submitted (no team-mate can ever be
 * added). This proxies the search through the service role so a learner can
 * find institution-mates without widening learners_profiles RLS to expose
 * the whole roster to every authenticated student directly.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createServiceRoleClient();
    const { data: profile } = await adminClient
      .from('profiles')
      .select('learner_id, role')
      .eq('id', user.id)
      .single();

    if (!profile?.learner_id || profile.role !== 'student') {
      return NextResponse.json(
        { error: 'Student profile not found' },
        { status: 404 }
      );
    }

    const { data: learner } = await adminClient
      .from('learners_profiles')
      .select('institution_id')
      .eq('id', profile.learner_id)
      .single();

    if (!learner?.institution_id) {
      return NextResponse.json(
        { error: 'Student profile incomplete' },
        { status: 422 }
      );
    }

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('query') || '').trim();
    const limit = Math.min(Number(searchParams.get('limit')) || 20, 50);

    let query = adminClient
      .from('learners_profiles')
      .select('id, first_name, last_name, roll_number, register_number, student_email, section_id, department_id')
      .eq('institution_id', learner.institution_id)
      .neq('id', profile.learner_id)
      .limit(limit);

    if (q.length > 0) {
      const pattern = `%${q}%`;
      query = query.or(
        [
          `first_name.ilike.${pattern}`,
          `last_name.ilike.${pattern}`,
          `roll_number.ilike.${pattern}`,
          `register_number.ilike.${pattern}`,
          `student_email.ilike.${pattern}`,
        ].join(',')
      );
    }

    const { data, error } = await query;

    if (error) {
      console.error('[api/learners/leave-onduty/team-members] search failed', error);
      return NextResponse.json({ error: 'Team member search failed' }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (err) {
    console.error('[api/learners/leave-onduty/team-members] unexpected error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
