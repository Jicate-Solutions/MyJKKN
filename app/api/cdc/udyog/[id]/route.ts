// app/api/cdc/udyog/[id]/route.ts — advance a UDYOG requirement (BUG-004075).
// PATCH { action: 'direct' | 'apply' | 'waive', udyog_reference?, waived_reason? }
//
// Status flow (Director-locked): required -> directed (clicked the outbound link)
// -> applied (reference number on file). 'apply' REQUIRES a non-empty reference
// number — enforced here AND by the DB CHECK cdc_udyog_applied_needs_ref.
// Service-role write, gated on cdc.udyog.manage + the requirement's institution scope.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { createApiInstitutionFilter } from '@/lib/auth/api-institution-filter';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const action = body?.action as string | undefined;
    if (!['direct', 'apply', 'waive'].includes(action ?? '')) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { data: canManage } = await supabase.rpc('user_has_permission', { permission_name: 'cdc.udyog.manage' });
    if (canManage !== true) return NextResponse.json({ error: 'Forbidden — cdc.udyog.manage required' }, { status: 403 });

    const filter = await createApiInstitutionFilter(req);
    if (!filter.isAllowed) {
      return NextResponse.json({ error: filter.reason ?? 'Not authorized' },
        { status: filter.reason === 'User not authenticated' ? 401 : 403 });
    }

    const svc = createServiceRoleClient();
    const { data: existing, error: loadErr } = await svc
      .from('cdc_udyog_requirements')
      .select('id, institution_id, status')
      .eq('id', id)
      .maybeSingle();
    if (loadErr || !existing) return NextResponse.json({ error: 'Requirement not found' }, { status: 404 });

    // Institution scope: super_admin/admission see all (institutionIds = []);
    // everyone else must own the requirement's institution.
    const instIds = filter.institutionIds ?? [];
    if (instIds.length > 0 && existing.institution_id && !instIds.includes(existing.institution_id)) {
      return NextResponse.json({ error: 'Outside your institution scope' }, { status: 403 });
    }

    const patch: Record<string, unknown> = {};
    if (action === 'direct') {
      patch.status = 'directed';
      patch.directed_at = new Date().toISOString();
    } else if (action === 'apply') {
      const ref = (body?.udyog_reference ?? '').toString().trim();
      if (!ref) {
        return NextResponse.json({ error: 'A UDYOG reference number is required to mark applied.' }, { status: 400 });
      }
      patch.status = 'applied';
      patch.udyog_reference = ref;
      patch.applied_at = new Date().toISOString();
    } else if (action === 'waive') {
      patch.status = 'waived';
      patch.waived_reason = (body?.waived_reason ?? '').toString().trim() || null;
    }

    const { data: updated, error: updErr } = await svc
      .from('cdc_udyog_requirements')
      .update(patch)
      .eq('id', id)
      .select('id, status, udyog_reference, directed_at, applied_at, waived_reason')
      .single();

    if (updErr) {
      // The DB CHECK (applied needs ref) surfaces here as a 23514 — translate it.
      const msg = updErr.code === '23514'
        ? 'A UDYOG reference number is required to mark applied.'
        : 'Could not update the requirement.';
      console.error('[cdc/udyog] update failed:', updErr);
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    return NextResponse.json({ requirement: updated });
  } catch (e) {
    console.error('[cdc/udyog] PATCH unexpected error:', e);
    return NextResponse.json({ error: 'Unexpected error.' }, { status: 500 });
  }
}
