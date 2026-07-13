export const dynamic = 'force-dynamic';

// /api/admin/ai-job-types/[job_type]
// PATCH  — enable/disable one job type. Body: { enabled: boolean }.
//          -> fn_ai_job_type_set_enabled.
// DELETE — remove one job type (blocked if it has existing jobs).
//          -> fn_ai_job_type_delete.
//
// RBAC: super_admin only (mirrors /api/admin/ai-models/[feature_key]). The RPCs
// are SECURITY DEFINER with their own is_super_admin() gate.

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function requireSuperAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
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

type RouteContext = { params: Promise<{ job_type: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  await connection();
  try {
    const { job_type } = await context.params;

    const auth = await requireSuperAdmin();
    if (!auth.ok) {
      const message = auth.status === 401 ? 'Unauthorized' : 'Forbidden: super_admin role required';
      return NextResponse.json({ error: message }, { status: auth.status });
    }

    let body: { enabled?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled (boolean) is required' }, { status: 400 });
    }

    const { data, error } = await auth.supabase.rpc('fn_ai_job_type_set_enabled', {
      p_job_type: job_type,
      p_enabled: body.enabled,
    });
    if (error) {
      console.error('[ai-job-types/[job_type]] set_enabled error:', error.message);
      return NextResponse.json({ error: 'Failed to update job type' }, { status: 500 });
    }
    if (data && typeof data === 'object' && (data as { ok?: boolean }).ok === false) {
      return NextResponse.json({ error: (data as { error?: string }).error ?? 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('[ai-job-types/[job_type]] PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update job type' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  await connection();
  try {
    const { job_type } = await context.params;

    const auth = await requireSuperAdmin();
    if (!auth.ok) {
      const message = auth.status === 401 ? 'Unauthorized' : 'Forbidden: super_admin role required';
      return NextResponse.json({ error: message }, { status: auth.status });
    }

    const { data, error } = await auth.supabase.rpc('fn_ai_job_type_delete', {
      p_job_type: job_type,
    });
    if (error) {
      console.error('[ai-job-types/[job_type]] delete error:', error.message);
      return NextResponse.json({ error: 'Failed to delete job type' }, { status: 500 });
    }
    if (data && typeof data === 'object' && (data as { ok?: boolean }).ok === false) {
      // e.g. type still referenced by jobs, or unknown job_type.
      return NextResponse.json({ error: (data as { error?: string }).error ?? 'Cannot delete' }, { status: 409 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('[ai-job-types/[job_type]] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete job type' }, { status: 500 });
  }
}
