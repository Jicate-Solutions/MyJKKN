export const dynamic = 'force-dynamic';

// /api/admin/ai-job-types
// GET  — list every AI job type (incl. disabled) via fn_ai_job_type_admin_list.
// POST — create/update one job type from a JSON def via fn_ai_job_type_upsert.
//
// ⚠️ POST does NOT necessarily change the live prompt (2026-08-04). A prompt
// EDIT on an existing job type is a champion–challenger, not an edit: the RPC
// leaves ai_job_types.prompt_template alone and files the new text in
// ai_prompt_versions as a challenger. Every other field still saves live. The
// RPC's jsonb reply carries prompt_action / prompt_version / prompt_message,
// passed straight through as `data` so the caller can TELL the admin their
// prompt is a proposal awaiting approval instead of showing a bare success
// toast for a save that did not go live.
//
// RBAC: super_admin only — checked server-side (mirrors /api/admin/ai-models).
// The RPCs are SECURITY DEFINER with their own is_super_admin() gate as
// defense-in-depth.

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

export async function GET(_request: NextRequest) {
  await connection();
  try {
    const auth = await requireSuperAdmin();
    if (!auth.ok) {
      const message = auth.status === 401 ? 'Unauthorized' : 'Forbidden: super_admin role required';
      return NextResponse.json({ error: message }, { status: auth.status });
    }

    const { data, error } = await auth.supabase.rpc('fn_ai_job_type_admin_list');
    if (error) {
      console.error('[ai-job-types] list error:', error);
      return NextResponse.json({ error: 'Failed to load job types' }, { status: 500 });
    }

    return NextResponse.json({ jobTypes: Array.isArray(data) ? data : [] });
  } catch (error) {
    console.error('[ai-job-types] GET error:', error);
    return NextResponse.json({ error: 'Failed to load job types' }, { status: 500 });
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

    let def: unknown;
    try {
      def = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    if (!def || typeof def !== 'object' || Array.isArray(def)) {
      return NextResponse.json({ error: 'Body must be a job-type definition object' }, { status: 400 });
    }

    const { data, error } = await auth.supabase.rpc('fn_ai_job_type_upsert', { p_def: def });
    if (error) {
      // RPC RAISEs on validation failure (bad job_type key, missing title, …).
      console.error('[ai-job-types] upsert error:', error.message);
      return NextResponse.json({ error: error.message || 'Failed to save job type' }, { status: 400 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('[ai-job-types] POST error:', error);
    return NextResponse.json({ error: 'Failed to save job type' }, { status: 500 });
  }
}
