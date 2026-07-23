import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { IdpService } from '@/lib/services/cdc/idp-service';
import type { IdpFilters } from '@/types/cdc/idp';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sp = request.nextUrl.searchParams;
    const filters: IdpFilters = {
      page: sp.get('page') ? Number(sp.get('page')) : 1,
      limit: sp.get('limit') ? Number(sp.get('limit')) : 20,
      institution_id: sp.get('institution_id') ?? undefined,
      academic_year_label: sp.get('academic_year_label') ?? undefined,
      learner_id: sp.get('learner_id') ?? undefined,
      source: sp.get('source') ?? undefined,
    };

    const result = await IdpService.list(supabase, filters);
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
    if (!body.learner_id) {
      return NextResponse.json({ error: 'learner_id is required' }, { status: 400 });
    }

    const result = await IdpService.create(supabase, { ...body, created_by: user.id });
    return NextResponse.json(result, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
