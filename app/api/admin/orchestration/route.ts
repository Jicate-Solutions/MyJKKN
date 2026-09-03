// app/api/admin/orchestration/route.ts
//
// GET /api/admin/orchestration
// Returns the full read payload for the Orchestration Console (Phase 1):
// every module, every tracked PR, the recent action log, and the tower
// session heartbeat rows.
//
// RBAC: super_admin only — checked server-side (mirrors /api/admin/ai-models
// exactly). RLS on the four orchestration_* tables is defense-in-depth: even
// this route's own query is scoped by the caller's session, so a bug here
// still can't leak rows to a non-super-admin.
//
// See artifacts/orchestration-console-spec.html for the full spec. Phase 1 —
// read layer + Run AI only. No merge/deploy routes exist yet (Phase 2).

import { NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { OrchestrationPayload } from '@/types/orchestration';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const RECENT_ACTIONS_LIMIT = 25;

export async function GET() {
  await connection();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  const isSuper = profile?.role === 'super_admin' || profile?.is_super_admin === true;
  if (!isSuper) {
    return NextResponse.json({ ok: false, error: 'Forbidden: super_admin only' }, { status: 403 });
  }

  const [modulesRes, prsRes, actionsRes, sessionRes] = await Promise.all([
    supabase.from('orchestration_modules').select('*').order('title', { ascending: true }),
    supabase.from('orchestration_prs').select('*').order('number', { ascending: false }),
    supabase
      .from('orchestration_actions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(RECENT_ACTIONS_LIMIT),
    supabase.from('orchestration_session_state').select('*').order('last_seen_at', { ascending: false }),
  ]);

  const firstError =
    modulesRes.error?.message || prsRes.error?.message || actionsRes.error?.message || sessionRes.error?.message;
  if (firstError) {
    return NextResponse.json({ ok: false, error: firstError }, { status: 500 });
  }

  const payload: OrchestrationPayload = {
    modules: modulesRes.data ?? [],
    prs: prsRes.data ?? [],
    actions: actionsRes.data ?? [],
    session: sessionRes.data ?? [],
  };

  return NextResponse.json({ ok: true, data: payload });
}
