// app/api/ai-tasks/enqueue/route.ts
// The "AI Max button" enqueue endpoint. Authenticated users only. Resolves the
// task-type's scope from the caller's profile, then inserts a lightweight queued
// row (NO Anthropic call here) via fn_ai_task_enqueue — which derives
// requested_by from auth.uid() so a caller cannot enqueue as someone else. The
// in-flight guard makes a re-click a no-op that returns the existing task.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getTaskType } from '@/lib/ai-tasks/registry';
import { nextRunEta } from '@/lib/ai-tasks/eta';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const taskType = typeof body.taskType === 'string' ? body.taskType : '';
    const entityId = typeof body.entityId === 'string' ? body.entityId : '';

    const tt = getTaskType(taskType);
    if (!tt) {
      return NextResponse.json({ ok: false, error: 'unknown task type' }, { status: 404 });
    }

    // Authn — session client.
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'not authenticated' }, { status: 401 });
    }

    // Authz + scope resolution (runs as the user).
    const resolved = await tt.resolveEnqueueContext(supabase, user.id, entityId);
    if ('error' in resolved) {
      return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status });
    }

    // Enqueue via the SESSION client → auth.uid() inside the DEFINER RPC = caller.
    const { data, error } = await supabase.rpc('fn_ai_task_enqueue', {
      p_feature_key: tt.featureKey,
      p_entity_id: entityId,
      p_institution_id: resolved.institutionId,
      p_context: resolved.context,
      p_dedupe_key: resolved.dedupeKey,
    });
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const row = Array.isArray(data) ? data[0] : data;
    const eta = nextRunEta();
    return NextResponse.json({
      ok: true,
      task_id: row?.task_id ?? null,
      already: row?.already ?? false,
      eta: eta.label,
      eta_iso: eta.etaIso,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unexpected error.';
    console.error('[ai-tasks/enqueue] error:', e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
