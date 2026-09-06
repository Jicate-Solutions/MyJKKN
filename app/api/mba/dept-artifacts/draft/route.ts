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
import {
  isArtifactType,
  POLICY_APPROVE_PERMISSION,
} from '@/lib/services/mba-dept-artifacts/types';

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

    // Authorize: only a board manager may draft (2026-07-28 interview decision —
    // associates can view/review, but drafting is manager-driven). Officers who
    // own the policy artifact (CEO / CAO / EAO) can draft one too, even if they
    // are not board managers — otherwise the people who must sign it off could
    // not produce a starting point.
    const { data: canManage } = await supabase.rpc('user_has_permission', {
      permission_name: 'improvement.board.manage',
    });
    let allowed = canManage === true;
    if (!allowed && artifactType === 'policy') {
      const { data: canPolicy } = await supabase.rpc('user_has_permission', {
        permission_name: POLICY_APPROVE_PERMISSION,
      });
      allowed = canPolicy === true;
    }
    if (!allowed) {
      return NextResponse.json(
        { ok: false, error: 'Only a board manager can draft department playbooks.' },
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

    // Locked: an approved artifact must be reopened before a fresh AI draft.
    const { data: existing } = await admin
      .from('mba_dept_artifacts')
      .select('status, source')
      .eq('area_id', areaId)
      .eq('artifact_type', artifactType)
      .maybeSingle();
    // Uploaded wins: refuse before spending a lane slot. The writer RPC enforces
    // the same rule, so a race that slips past this check still cannot overwrite.
    if (existing?.source === 'upload') {
      return NextResponse.json(
        {
          ok: false,
          error:
            'A document has been uploaded for this department — the uploaded file is the policy. Replace the file instead of drafting.',
        },
        { status: 409 },
      );
    }
    if (existing?.status === 'approved') {
      return NextResponse.json(
        { ok: false, error: 'This playbook is approved and locked. Reopen it before re-drafting.' },
        { status: 409 },
      );
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
