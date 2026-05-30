import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { MentorService } from '@/lib/services/cdc/mentor-service';
import type { MentorPairingFilters } from '@/types/cdc/mentors';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sp = request.nextUrl.searchParams;
    const filters: MentorPairingFilters = {
      page: sp.get('page') ? Number(sp.get('page')) : 1,
      limit: sp.get('limit') ? Number(sp.get('limit')) : 20,
      mentor_learner_id: sp.get('mentor_learner_id') ?? undefined,
      mentee_learner_id: sp.get('mentee_learner_id') ?? undefined,
      status: (sp.get('status') as MentorPairingFilters['status']) ?? undefined,
    };

    const result = await MentorService.list(supabase, filters);
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    if (!body.mentor_learner_id || !body.mentee_learner_id) {
      return NextResponse.json({ error: 'mentor_learner_id and mentee_learner_id are required' }, { status: 400 });
    }

    const result = await MentorService.create(supabase, body);
    return NextResponse.json(result, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
