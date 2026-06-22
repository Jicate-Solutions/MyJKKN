// app/api/cdc/industry-mentors/[id]/mentees/route.ts — BUG-004198.
// The FIXED industry-mentor → learner assignment list.
//   GET    → assigned mentees (with names + per-pairing session rollup)
//   POST   → assign a learner   { learner_id }
//   DELETE ?pairing_id= → unassign
// Service-role reads (CDC staff lack learners.*); gated on cdc.industry_mentors.*
// + the mentor's institution scope.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { createApiInstitutionFilter } from '@/lib/auth/api-institution-filter';

async function loadMentorScoped(svc: any, mentorId: string) {
  const { data } = await svc
    .from('industry_mentors')
    .select('id, institution_id, mentor_name')
    .eq('id', mentorId)
    .maybeSingle();
  return data as { id: string; institution_id: string | null; mentor_name: string } | null;
}

function scopeOk(filter: { institutionIds: string[] }, institutionId: string | null): boolean {
  const ids = filter.institutionIds ?? [];
  return ids.length === 0 || !institutionId || ids.includes(institutionId);
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const { data: canView } = await supabase.rpc('user_has_permission', { permission_name: 'cdc.industry_mentors.view' });
    if (canView !== true) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const filter = await createApiInstitutionFilter(req);
    if (!filter.isAllowed) return NextResponse.json({ error: filter.reason ?? 'Not authorized' }, { status: 403 });

    const svc = createServiceRoleClient();
    const mentor = await loadMentorScoped(svc, id);
    if (!mentor) return NextResponse.json({ error: 'Industry mentor not found' }, { status: 404 });
    if (!scopeOk(filter, mentor.institution_id)) return NextResponse.json({ error: 'Outside your scope' }, { status: 403 });

    const { data: pairings, error } = await svc
      .from('cdc_industry_mentor_pairings')
      .select(`
        id, industry_mentor_id, mentee_learner_id, institution_id, status, assigned_at, concluded_at, notes,
        mentee:learners_profiles(first_name, last_name, register_number)
      `)
      .eq('industry_mentor_id', id)
      .order('assigned_at', { ascending: false });
    if (error) {
      console.error('[cdc/industry-mentors/mentees] list failed:', error);
      return NextResponse.json({ error: 'Could not load mentees.' }, { status: 500 });
    }

    // Rollups can't be PostgREST-embedded (views have no FK relationship), so fetch
    // and merge separately.
    const ids = (pairings ?? []).map((p: any) => p.id);
    let rollupById: Record<string, any> = {};
    if (ids.length) {
      const { data: rollups } = await svc
        .from('v_cdc_industry_pairing_rollup')
        .select('pairing_id, session_count, total_minutes, last_session_at, next_session_at')
        .in('pairing_id', ids);
      rollupById = Object.fromEntries((rollups ?? []).map((r: any) => [r.pairing_id, r]));
    }
    const withRollup = (pairings ?? []).map((p: any) => ({ ...p, rollup: rollupById[p.id] ?? null }));
    return NextResponse.json({ pairings: withRollup });
  } catch (e) {
    console.error('[cdc/industry-mentors/mentees] GET error:', e);
    return NextResponse.json({ error: 'Unexpected error.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const learnerId = (body?.learner_id ?? '').toString();
    if (!learnerId) return NextResponse.json({ error: 'learner_id is required' }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const { data: canEdit } = await supabase.rpc('user_has_permission', { permission_name: 'cdc.industry_mentors.edit' });
    if (canEdit !== true) return NextResponse.json({ error: 'Forbidden — cdc.industry_mentors.edit required' }, { status: 403 });
    const filter = await createApiInstitutionFilter(req);
    if (!filter.isAllowed) return NextResponse.json({ error: filter.reason ?? 'Not authorized' }, { status: 403 });

    const svc = createServiceRoleClient();
    const mentor = await loadMentorScoped(svc, id);
    if (!mentor) return NextResponse.json({ error: 'Industry mentor not found' }, { status: 404 });
    if (!scopeOk(filter, mentor.institution_id)) return NextResponse.json({ error: 'Outside your scope' }, { status: 403 });

    const { data: inserted, error } = await svc
      .from('cdc_industry_mentor_pairings')
      .upsert({
        industry_mentor_id: id,
        mentee_learner_id: learnerId,
        institution_id: mentor.institution_id,
        status: 'active',
        created_by: user.id,
      }, { onConflict: 'industry_mentor_id,mentee_learner_id' })
      .select('id')
      .single();
    if (error) {
      console.error('[cdc/industry-mentors/mentees] assign failed:', error);
      return NextResponse.json({ error: 'Could not assign learner.' }, { status: 400 });
    }
    return NextResponse.json({ pairing_id: inserted.id });
  } catch (e) {
    console.error('[cdc/industry-mentors/mentees] POST error:', e);
    return NextResponse.json({ error: 'Unexpected error.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const pairingId = req.nextUrl.searchParams.get('pairing_id');
    if (!pairingId) return NextResponse.json({ error: 'pairing_id is required' }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const { data: canEdit } = await supabase.rpc('user_has_permission', { permission_name: 'cdc.industry_mentors.edit' });
    if (canEdit !== true) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const filter = await createApiInstitutionFilter(req);
    if (!filter.isAllowed) return NextResponse.json({ error: filter.reason ?? 'Not authorized' }, { status: 403 });

    const svc = createServiceRoleClient();
    const mentor = await loadMentorScoped(svc, id);
    if (!mentor) return NextResponse.json({ error: 'Industry mentor not found' }, { status: 404 });
    if (!scopeOk(filter, mentor.institution_id)) return NextResponse.json({ error: 'Outside your scope' }, { status: 403 });

    const { error } = await svc
      .from('cdc_industry_mentor_pairings')
      .delete()
      .eq('id', pairingId)
      .eq('industry_mentor_id', id);
    if (error) {
      console.error('[cdc/industry-mentors/mentees] unassign failed:', error);
      return NextResponse.json({ error: 'Could not unassign learner.' }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[cdc/industry-mentors/mentees] DELETE error:', e);
    return NextResponse.json({ error: 'Unexpected error.' }, { status: 500 });
  }
}
