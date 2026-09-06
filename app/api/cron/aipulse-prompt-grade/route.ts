// =====================================================================
// AI Pulse — Prompt Build grader (₹0 Max lane).
// =====================================================================
// The "learn prompt engineering" loop: a learner assembles a prompt from
// parts (role + context + task + output format) via fn_ai_pulse_submit_prompt_build;
// this cron grades it on the Max lane and writes the grade back.
//
// FLOW (one route, re-entrant, idempotent — mirrors aipulse-domain-starter):
//   COLLECT first: drain done ai_pulse.prompt_grade jobs, parse the JSON grade,
//     record via fn_ai_pulse_record_prompt_grade (service_role).
//   SUBMIT next: enqueue one grade job per build still grade_status='pending'.
//
// DARK until the kill switch prompt_build_enabled flips true (ai_pulse_policies).
// Tiny + idempotent: dedupeKey aipulse_grade|<build_id> stops double-enqueue while
// a grade is in flight; a recorded build leaves 'pending', so re-runs are no-ops.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` OR `?secret=`.
// Created: 2026-07-23.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { enqueueJobsLane, collectJobsLane } from '@/lib/services/platform/ai-jobs-lane';

const JOB_TYPE = 'ai_pulse.prompt_grade';
const ENABLED_KEY = 'prompt_build_enabled';
const CAP = 60; // max builds to submit/collect per run

type Admin = ReturnType<typeof createServiceRoleClient>;
type GradeContext = { build_id: string };
type PendingBuild = { id: string; assembled_prompt: string | null };

// ── config read (fail-safe: any error -> null -> treated as off) ────────────
async function readPolicy(admin: Admin, key: string): Promise<unknown> {
  try {
    const { data, error } = await admin
      .from('ai_pulse_policies')
      .select('value_jsonb')
      .eq('config_key', key)
      .eq('is_active', true)
      .maybeSingle();
    if (error) return null;
    return (data as { value_jsonb?: unknown } | null)?.value_jsonb ?? null;
  } catch {
    return null;
  }
}

// ── grading prompt (the checklist the learner is taught) ────────────────────
const GRADE_SYSTEM_PROMPT = `You grade a learner's AI "prompt" that they built from four parts:
- ROLE: who the AI should act as ("Act as a clinical pharmacist...").
- CONTEXT: the learner's own background, goal, or a concrete example.
- TASK: what they want the AI to do.
- OUTPUT FORMAT: the shape of the answer they want (a table, 5 bullets, a caption...).

Check the learner's prompt for each of the four parts. Return ONLY valid JSON, no markdown, no commentary, exactly:
{"has_role":true|false,"has_context":true|false,"has_task":true|false,"has_format":true|false,"score":0-100,"tips":["...","..."]}
- score: ~25 per part present, nudged up/down for how specific and usable it is.
- tips: 1-3 short, encouraging, specific suggestions for what to add or sharpen next time.
- Do NOT mention marks, ranks, grades, or the institution. Speak to the learner in the second person.`;

function buildGradePrompt(assembled: string): string {
  return `${GRADE_SYSTEM_PROMPT}\n\nLEARNER'S PROMPT:\n"""\n${assembled}\n"""`;
}

// Parse the model's JSON grade. Returns null on any failure (-> recorded as 'error').
type Grade = {
  has_role: boolean; has_context: boolean; has_task: boolean; has_format: boolean;
  score: number; tips: string[];
};
function parseGrade(text: string | null): Grade | null {
  if (!text) return null;
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    const o = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const bool = (v: unknown) => v === true;
    const score = Math.max(0, Math.min(100, Number(o.score ?? 0)));
    const tips = Array.isArray(o.tips) ? o.tips.filter((t) => typeof t === 'string').slice(0, 3) as string[] : [];
    return {
      has_role: bool(o.has_role), has_context: bool(o.has_context),
      has_task: bool(o.has_task), has_format: bool(o.has_format),
      score: Number.isFinite(score) ? score : 0, tips,
    };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  const admin = createServiceRoleClient();

  const enabled = readPolicy(admin, ENABLED_KEY);
  if (((await enabled) as unknown) !== true) {
    return NextResponse.json({ ok: true, enabled: false, note: 'prompt_build_enabled is off (DARK)' });
  }

  let recorded = 0;
  let enqueued = 0;
  let skipped = 0;

  // ── COLLECT: drain done grade jobs, record their grades. ───────────────────
  try {
    const items = await collectJobsLane(admin, [JOB_TYPE], CAP);
    for (const item of items) {
      const ctx = item.context as unknown as GradeContext;
      if (!ctx?.build_id) { skipped++; continue; }
      const raw = item.message?.content?.find((b) => b.type === 'text');
      const text = raw && 'text' in raw ? (raw.text as string) : null;
      const grade = parseGrade(text);
      const { error } = await admin.rpc('fn_ai_pulse_record_prompt_grade', {
        p_payload: {
          build_id: ctx.build_id,
          grade: grade ?? {},
          grade_status: grade ? 'graded' : 'error',
        },
      });
      if (error) {
        console.error('[cron/aipulse-prompt-grade] record failed:', error.message);
        skipped++;
      } else {
        recorded++;
      }
    }
  } catch (e) {
    console.error('[cron/aipulse-prompt-grade] collect failed:', e);
  }

  // ── SUBMIT: enqueue one grade job per pending build. ───────────────────────
  try {
    const { data: pending, error: pErr } = await admin
      .from('ai_pulse_prompt_builds')
      .select('id, assembled_prompt')
      .eq('grade_status', 'pending')
      .order('created_at', { ascending: true })
      .limit(CAP);
    if (pErr) {
      console.error('[cron/aipulse-prompt-grade] pending read failed:', pErr.message);
    } else {
      for (const row of (pending as PendingBuild[] | null) ?? []) {
        if (!row.assembled_prompt) { skipped++; continue; }
        const res = await enqueueJobsLane(admin, {
          jobType: JOB_TYPE,
          prompt: buildGradePrompt(row.assembled_prompt),
          context: { build_id: row.id } as unknown as Record<string, unknown>,
          dedupeKey: `aipulse_grade|${row.id}`,
        });
        if (res.ok) {
          enqueued++;
        } else {
          skipped++;
          const reason = (res as { reason?: string }).reason ?? 'error';
          if (reason !== 'in_flight') {
            console.warn(`[cron/aipulse-prompt-grade] enqueue failed (${reason})`);
          }
        }
      }
    }
  } catch (e) {
    console.error('[cron/aipulse-prompt-grade] submit failed:', e);
  }

  return NextResponse.json({
    ok: true,
    enabled: true,
    recorded,
    enqueued,
    skipped,
    elapsed_ms: Date.now() - started,
  });
}
