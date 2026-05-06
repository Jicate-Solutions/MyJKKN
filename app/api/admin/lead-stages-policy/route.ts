export const dynamic = 'force-dynamic';

// /api/admin/lead-stages-policy
// Phase 1C: CRUD API for lead_active_stage_policy table.
// RBAC: super_admin only — checked server-side. RLS in migration is defense-in-depth.
//
// GET  — list all rows ordered by funnel_stage
// POST — create a new stage-policy row

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type LeadActiveStagePolicy = {
  id: string;
  scope_type: 'global' | 'institution';
  institution_id: string | null;
  funnel_stage: string;
  is_terminal: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

async function requireSuperAdmin() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 };
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'super_admin') return { ok: false as const, status: 403 };
  return { ok: true as const, supabase, userId: user.id };
}

export async function GET(_request: NextRequest) {
  await connection();
  try {
    const auth = await requireSuperAdmin();
    if (!auth.ok) {
      const message = auth.status === 401 ? 'Unauthorized' : 'Forbidden: super_admin role required';
      return NextResponse.json({ error: message }, { status: auth.status });
    }

    const { data, error } = await auth.supabase
      .from('lead_active_stage_policy')
      .select('*')
      .order('funnel_stage', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ data: data as LeadActiveStagePolicy[] });
  } catch (error) {
    console.error('[lead-stages-policy] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch stage policies' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  await connection();
  try {
    const auth = await requireSuperAdmin();
    if (!auth.ok) {
      const message = auth.status === 401 ? 'Unauthorized' : 'Forbidden: super_admin role required';
      return NextResponse.json({ error: message }, { status: auth.status });
    }

    const body = await request.json();
    const { scope_type, institution_id, funnel_stage, is_terminal, description } = body;

    // --- Validation ---
    if (!scope_type || !funnel_stage) {
      return NextResponse.json(
        { error: 'Missing required fields: scope_type and funnel_stage are required' },
        { status: 400 }
      );
    }

    if (!['global', 'institution'].includes(scope_type)) {
      return NextResponse.json(
        { error: "scope_type must be 'global' or 'institution'" },
        { status: 400 }
      );
    }

    if (scope_type === 'institution' && !institution_id) {
      return NextResponse.json(
        { error: "institution_id is required when scope_type is 'institution'" },
        { status: 400 }
      );
    }

    if (is_terminal !== undefined && typeof is_terminal !== 'boolean') {
      return NextResponse.json(
        { error: 'is_terminal must be a boolean' },
        { status: 400 }
      );
    }

    // Check for duplicate (scope_type, institution_id, funnel_stage)
    const effectiveInstitutionId = scope_type === 'global' ? null : (institution_id ?? null);
    let dupeQuery = auth.supabase
      .from('lead_active_stage_policy')
      .select('id')
      .eq('scope_type', scope_type)
      .eq('funnel_stage', funnel_stage);

    if (effectiveInstitutionId === null) {
      dupeQuery = dupeQuery.is('institution_id', null);
    } else {
      dupeQuery = dupeQuery.eq('institution_id', effectiveInstitutionId);
    }

    const { data: existing } = await dupeQuery.maybeSingle();

    if (existing) {
      const scopeLabel =
        scope_type === 'global'
          ? 'global scope'
          : `institution ${effectiveInstitutionId}`;
      return NextResponse.json(
        {
          error: `A policy for stage "${funnel_stage}" already exists in ${scopeLabel}. Delete the existing row first if you want to replace it.`
        },
        { status: 400 }
      );
    }

    // --- Insert ---
    const { data: inserted, error } = await auth.supabase
      .from('lead_active_stage_policy')
      .insert({
        scope_type,
        institution_id: effectiveInstitutionId,
        funnel_stage,
        is_terminal: is_terminal ?? false,
        description: description ?? null,
        created_by: auth.userId,
        updated_by: auth.userId
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data: inserted as LeadActiveStagePolicy }, { status: 201 });
  } catch (error) {
    console.error('[lead-stages-policy] POST error:', error);
    return NextResponse.json({ error: 'Failed to create stage policy' }, { status: 500 });
  }
}
