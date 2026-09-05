export const dynamic = 'force-dynamic';

import { NextResponse, connection, type NextRequest } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import type { PaperConfig, PaperState } from '@/lib/services/onemark/paper-service';

// OneMark paper wizard — one paper.
//
// GET    /api/foundation/onemark/paper/[id]  -> { paper }
// PATCH  /api/foundation/onemark/paper/[id]  -> persist wizard state; with
//        { finalize: true } also writes fp_assessment_items (position 1..n)
//        and moves the state machine to FINALIZED.
// DELETE /api/foundation/onemark/paper/[id]  -> discard a draft (never a
//        finalized paper — those may already have attempts against them).
//
// Gate + client rule as in ../route.ts. All writes go through the SESSION
// client so fp_assessments_write / fp_assessment_items_write RLS hold.

const STATES: PaperState[] = ['DRAFT', 'PREVIEW', 'EDITED', 'FINALIZED'];

const PAPER_SELECT =
  'id, exam_definition_id, cohort_id, title, kind, config, created_at, updated_at, exam:exam_definitions(id, config_key, display_name)';

async function gate(supabase: any) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, allowed: false };
  const [{ data: isSuper }, { data: canManage }] = await Promise.all([
    supabase.rpc('is_super_admin'),
    supabase.rpc('user_has_permission', { permission_name: 'foundation.assessments.manage' }),
  ]);
  return { user, allowed: isSuper === true || canManage === true };
}

function forbidden() {
  return NextResponse.json(
    { error: 'You do not have access to the paper wizard.', requiredPermission: 'foundation.assessments.manage' },
    { status: 403 },
  );
}

async function loadPaper(supabase: any, id: string) {
  const { data, error } = await supabase
    .from('fp_assessments')
    .select(PAPER_SELECT)
    .eq('id', id)
    .eq('kind', 'mock')
    .eq('config->>onemark', 'true')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function itemCount(admin: any, id: string): Promise<number> {
  const { count } = await admin
    .from('fp_assessment_items')
    .select('id', { count: 'exact', head: true })
    .eq('assessment_id', id);
  return count ?? 0;
}

function shape(row: any, count: number) {
  return {
    id: row.id,
    exam_definition_id: row.exam_definition_id,
    cohort_id: row.cohort_id,
    title: row.title,
    kind: row.kind,
    config: row.config,
    created_at: row.created_at,
    updated_at: row.updated_at,
    item_count: count,
    exam: row.exam ?? undefined,
  };
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  await connection();
  try {
    const { id } = await ctx.params;
    const supabase: any = await createClient();
    const { user, allowed } = await gate(supabase);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!allowed) return forbidden();

    const row = await loadPaper(supabase, id);
    if (!row) return NextResponse.json({ error: 'Paper not found.' }, { status: 404 });
    const admin: any = createServiceRoleClient();
    return NextResponse.json({ paper: shape(row, await itemCount(admin, id)) });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Could not load the paper' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  await connection();
  try {
    const { id } = await ctx.params;
    const supabase: any = await createClient();
    const { user, allowed } = await gate(supabase);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!allowed) return forbidden();

    const existing = await loadPaper(supabase, id);
    if (!existing) return NextResponse.json({ error: 'Paper not found.' }, { status: 404 });

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'A JSON body is required' }, { status: 400 });
    }

    const current = existing.config as PaperConfig;
    const incoming = (body.config ?? null) as PaperConfig | null;
    const finalize = body.finalize === true;

    if (incoming && (incoming.onemark !== true || !STATES.includes(incoming.state))) {
      return NextResponse.json({ error: 'Not a wizard config' }, { status: 400 });
    }

    // A finalized paper is frozen: its question list may already be answered.
    if (current.state === 'FINALIZED' && incoming && incoming.state !== 'FINALIZED') {
      return NextResponse.json({ error: 'This paper is finalized. Start a new paper to change its questions.' }, { status: 409 });
    }

    let nextConfig: PaperConfig = incoming ? { ...current, ...incoming, onemark: true } : { ...current };
    if (current.state === 'FINALIZED') {
      // Only the output block and the step may move after finalization.
      nextConfig = {
        ...current,
        step: incoming?.step ?? current.step,
        output: incoming?.output ?? current.output,
      };
    }

    const patch: Record<string, unknown> = { updated_by: user.id };
    if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim();
    if (body.cohort_id === null || typeof body.cohort_id === 'string') patch.cohort_id = body.cohort_id;

    if (finalize) {
      if (current.state === 'FINALIZED') {
        return NextResponse.json({ error: 'Already finalized.' }, { status: 409 });
      }
      const ids = Array.isArray(nextConfig.selected_ids) ? nextConfig.selected_ids.filter((x) => typeof x === 'string') : [];
      if (ids.length === 0) {
        return NextResponse.json({ error: 'Generate or pick questions before finalizing.' }, { status: 400 });
      }
      // The ids must be approved items of this subject — the browser proposes,
      // the server checks.
      const admin: any = createServiceRoleClient();
      const { data: valid, error: vErr } = await admin
        .from('fp_items')
        .select('id')
        .in('id', ids)
        .eq('exam_definition_id', existing.exam_definition_id)
        .eq('is_active', true);
      if (vErr) return NextResponse.json({ error: vErr.message }, { status: 400 });
      const validSet = new Set((valid ?? []).map((v: any) => v.id));
      const missing = ids.filter((x) => !validSet.has(x));
      if (missing.length > 0) {
        return NextResponse.json(
          { error: `${missing.length} question${missing.length === 1 ? ' is' : 's are'} no longer approved for this subject. Regenerate the preview.` },
          { status: 409 },
        );
      }
      const unique = Array.from(new Set(ids));
      const { error: delErr } = await supabase.from('fp_assessment_items').delete().eq('assessment_id', id);
      if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 });
      const { error: insErr } = await supabase
        .from('fp_assessment_items')
        .insert(unique.map((item_id, idx) => ({ assessment_id: id, item_id, position: idx + 1 })));
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });
      nextConfig = {
        ...nextConfig,
        selected_ids: unique,
        state: 'FINALIZED',
        step: 5,
        finalized_at: new Date().toISOString(),
      };
    }

    patch.config = nextConfig;

    const { data, error } = await supabase
      .from('fp_assessments')
      .update(patch)
      .eq('id', id)
      .select(PAPER_SELECT)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const admin: any = createServiceRoleClient();
    return NextResponse.json({ paper: shape(data, await itemCount(admin, id)) });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Could not save the paper' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  await connection();
  try {
    const { id } = await ctx.params;
    const supabase: any = await createClient();
    const { user, allowed } = await gate(supabase);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!allowed) return forbidden();

    const existing = await loadPaper(supabase, id);
    if (!existing) return NextResponse.json({ error: 'Paper not found.' }, { status: 404 });
    if ((existing.config as PaperConfig).state === 'FINALIZED') {
      return NextResponse.json({ error: 'A finalized paper cannot be discarded.' }, { status: 409 });
    }
    const { error } = await supabase.from('fp_assessments').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Could not discard the paper' }, { status: 500 });
  }
}
