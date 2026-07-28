// app/api/mba/dept-artifacts/draft/route.ts
// POST — on-demand "Draft with AI" for one department playbook artifact.
// Enqueues one ₹0 Max-lane job; the Windows/Mac seat drains it and the collect
// route persists the parsed draft. No cron in v1.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { enqueueJobsLane } from '@/lib/services/platform/ai-jobs-lane';
import {
  assembleArtifactPrompt,
  type AreaContext,
} from '@/lib/services/mba-dept-artifacts/draft-prompt';
import { isArtifactType } from '@/lib/services/mba-dept-artifacts/types';

const JOB_TYPE = 'mba.draft_dept_artifact';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      area_id?: string;
      artifact_type?: string;
    };
    const areaId = body.area_id;
    const artifactType = body.artifact_type;
    if (!areaId || !isArtifactType(artifactType)) {
      return NextResponse.json(
        { ok: false, error: 'area_id and a valid artifact_type are required' },
        { status: 400 },
      );
    }

    // Authorize: a board manager, OR an associate posted to this area who can view it.
    const { data: canManage } = await supabase.rpc('user_has_permission', {
      permission_name: 'improvement.board.manage',
    });
    let allowed = canManage === true;
    if (!allowed) {
      const { data: canView } = await supabase.rpc('user_has_permission', {
        permission_name: 'improvement.ideas.view',
      });
      if (canView === true) {
        const { data: posting } = await supabase
          .from('mba_associate_postings')
          .select('id')
          .eq('area_id', areaId)
          .eq('associate_user_id', user.id)
          .maybeSingle();
        allowed = Boolean(posting);
      }
    }
    if (!allowed) {
      return NextResponse.json(
        { ok: false, error: 'You do not have access to draft playbooks for this area.' },
        { status: 403 },
      );
    }

    // Load the area + its real improvement-board signals (grounding source).
    const admin = createServiceRoleClient();
    const { data: area } = await admin
      .from('improvement_areas')
      .select('key, label, description')
      .eq('id', areaId)
      .maybeSingle();
    if (!area) {
      return NextResponse.json({ ok: false, error: 'No such area' }, { status: 404 });
    }
    const { data: ideas } = await admin
      .from('improvement_ideas')
      .select('title, problem')
      .eq('area_id', areaId)
      .order('created_at', { ascending: false })
      .limit(12);

    const ctx: AreaContext = {
      key: area.key,
      label: area.label,
      description: area.description,
      ideaSignals: (ideas ?? []).map((i) => ({ title: i.title, problem: i.problem })),
    };

    const { system, prompt } = assembleArtifactPrompt(ctx, artifactType);
    const fullPrompt = `${system}\n\n${prompt}`;

    const res = await enqueueJobsLane(admin, {
      jobType: JOB_TYPE,
      prompt: fullPrompt,
      context: { area_id: areaId, artifact_type: artifactType, model: 'sonnet' },
      dedupeKey: `mba-artifact:${areaId}:${artifactType}`,
    });

    if (res.ok) {
      return NextResponse.json({ ok: true, jobId: res.jobId });
    }
    // res is the failure branch here; name it explicitly (project tsconfig does
    // not narrow the union's else-branch, so read the reason off a typed alias).
    const fail = res as { ok: false; reason: string; error?: string };
    if (fail.reason === 'in_flight') {
      // A draft for this (area, type) is already being generated — treat as success.
      return NextResponse.json({ ok: true, inFlight: true });
    }
    return NextResponse.json(
      { ok: false, error: `Could not enqueue draft (${fail.reason})` },
      { status: 502 },
    );
  } catch (error) {
    console.error('[POST /api/mba/dept-artifacts/draft] Error:', error);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
