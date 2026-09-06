// app/api/cdc/requirements/route.ts
// CDC staff — list employer requirements (incl. the public-portal moderation
// queue) and create one directly. Reads use the session client (RLS = is_cdc_staff
// enforces CDC-staff-only); an explicit gate returns a clear 403 rather than a
// silent empty list.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { CreateEmployerRequirementInput } from '@/types/cdc/employer-requirements';

async function gateCdcStaff(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, ok: false as const };
  const { data: isStaff } = await supabase.rpc('is_cdc_staff');
  return { user, ok: isStaff === true };
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { user, ok } = await gateCdcStaff(supabase);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!ok) return NextResponse.json({ error: 'Forbidden — CDC staff only' }, { status: 403 });

  const status = request.nextUrl.searchParams.get('status');
  let query = supabase
    .from('cdc_employer_requirements')
    .select('*, roles:cdc_employer_requirement_roles(*)')
    .order('created_at', { ascending: false });
  if (status && status !== 'all') query = query.eq('status', status);

  const { data, error } = await query;
  if (error) {
    console.error('[cdc/requirements] list error:', error.message);
    return NextResponse.json({ error: 'Failed to load requirements' }, { status: 500 });
  }
  return NextResponse.json({ data: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { user, ok } = await gateCdcStaff(supabase);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!ok) return NextResponse.json({ error: 'Forbidden — CDC staff only' }, { status: 403 });

  let body: CreateEmployerRequirementInput;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }

  if (!body.company_name?.trim()) return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
  if (!Array.isArray(body.roles) || body.roles.length === 0)
    return NextResponse.json({ error: 'At least one role is required' }, { status: 400 });
  if (body.roles.some((r) => !r.role_title?.trim()))
    return NextResponse.json({ error: 'Every role needs a title' }, { status: 400 });

  // Staff-entered requirements are trusted → land approved (no moderation needed).
  const { data: req, error: reqErr } = await supabase
    .from('cdc_employer_requirements')
    .insert({
      company_name: body.company_name.trim(),
      company_website: body.company_website ?? null,
      hq_city: body.hq_city ?? null,
      hq_state: body.hq_state ?? null,
      primary_contact_name: body.primary_contact_name ?? null,
      primary_contact_email: body.primary_contact_email ?? null,
      primary_contact_phone: body.primary_contact_phone ?? null,
      secondary_contact_name: body.secondary_contact_name ?? null,
      secondary_contact_phone: body.secondary_contact_phone ?? null,
      institution_id: body.institution_id ?? null,
      source: 'cdc_staff',
      status: 'approved',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      created_by: user.id,
    })
    .select('id')
    .single();

  if (reqErr || !req) {
    console.error('[cdc/requirements] create header error:', reqErr?.message);
    return NextResponse.json({ error: reqErr?.message ?? 'Failed to create' }, { status: 500 });
  }

  const { error: rolesErr } = await supabase.from('cdc_employer_requirement_roles').insert(
    body.roles.map((r, i) => ({
      requirement_id: req.id,
      role_title: r.role_title.trim(),
      description: r.description ?? null,
      skills: Array.isArray(r.skills) ? r.skills : [],
      experience_level: r.experience_level ?? 'any',
      experience_min_years: r.experience_min_years ?? null,
      education_text: r.education_text ?? null,
      package_lpa: r.package_lpa ?? null,
      benefits: r.benefits ?? null,
      work_mode: r.work_mode ?? null,
      location: r.location ?? null,
      openings_count: r.openings_count ?? 1,
      display_order: i,
    }))
  );
  if (rolesErr) {
    await supabase.from('cdc_employer_requirements').delete().eq('id', req.id);
    console.error('[cdc/requirements] create roles error:', rolesErr.message);
    return NextResponse.json({ error: rolesErr.message }, { status: 500 });
  }

  return NextResponse.json({ id: req.id }, { status: 201 });
}
