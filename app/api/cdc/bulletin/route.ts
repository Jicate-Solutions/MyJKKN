// app/api/cdc/bulletin/route.ts
// GET  /api/cdc/bulletin — list opportunities
// POST /api/cdc/bulletin — create opportunity

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { CreateOpportunityDto, OpportunityFilters } from '@/types/cdc/bulletin';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sp = request.nextUrl.searchParams;
    const filters: OpportunityFilters = {
      search: sp.get('search') ?? undefined,
      category: sp.get('category') ?? undefined,
      status: (sp.get('status') as OpportunityFilters['status']) ?? undefined,
      deadline_from: sp.get('deadline_from') ?? undefined,
      deadline_to: sp.get('deadline_to') ?? undefined,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase as any)
      .from('cdc_external_opportunities')
      .select(`*, poster:profiles!cdc_external_opportunities_posted_by_fkey(id, full_name, email)`)
      .order('posted_at', { ascending: false });

    if (filters.search) {
      query = query.or(`title.ilike.%${filters.search}%,source_organisation.ilike.%${filters.search}%`);
    }
    if (filters.category) query = query.eq('category', filters.category);
    if (filters.status === 'active') {
      query = query.eq('is_active', true).is('archived_at', null);
    } else if (filters.status === 'expired') {
      query = query.lt('deadline_date', new Date().toISOString().split('T')[0]).is('archived_at', null);
    } else if (filters.status === 'archived') {
      query = query.not('archived_at', 'is', null);
    }
    if (filters.deadline_from) query = query.gte('deadline_date', filters.deadline_from);
    if (filters.deadline_to) query = query.lte('deadline_date', filters.deadline_to);

    const { data, error } = await query;
    if (error) {
      console.error('[cdc/bulletin] GET list error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    console.error('[cdc/bulletin] GET unexpected:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: CreateOpportunityDto = await request.json();
    if (!body.title?.trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('cdc_external_opportunities')
      .insert({ ...body, posted_by: user.id })
      .select('*')
      .single();

    if (error) {
      console.error('[cdc/bulletin] POST create error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error('[cdc/bulletin] POST unexpected:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
