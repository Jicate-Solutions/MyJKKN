// app/api/ai-tasks/status/route.ts
// The button polls this to reflect the result back. RLS on ai_task_queue
// (own-rows: requested_by = auth.uid()) means a caller only ever sees their own
// tasks — no server-side ownership check needed beyond authentication.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'not authenticated' }, { status: 401 });
    }

    // Mode B: latest task for a (feature, entity) — lets the button resume state
    // when the faculty returns to the page. RLS restricts to the caller's own rows.
    const feature = params.get('feature');
    const entity = params.get('entity');
    if (feature && entity) {
      const { data, error } = await supabase
        .from('ai_task_queue')
        .select('id, status, result, error, updated_at')
        .eq('feature_key', feature)
        .eq('entity_id', entity)
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, tasks: data ?? [] });
    }

    // Mode A: poll specific task ids.
    const ids = (params.get('ids') || '')
      .split(',').map((s) => s.trim()).filter(Boolean).slice(0, 50);
    if (ids.length === 0) {
      return NextResponse.json({ ok: true, tasks: [] });
    }
    const { data, error } = await supabase
      .from('ai_task_queue')
      .select('id, status, result, error, updated_at')
      .in('id', ids); // RLS restricts to the caller's own rows
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, tasks: data ?? [] });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unexpected error.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
