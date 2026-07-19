// =====================================================================
// SCF struggling-note SAFETY JUDGE — self-improving loop, SHADOW phase
// =====================================================================
// The scf-learner-notes cron drafts AI support notes for struggling learners
// (status='draft'); a human must approve each before the learner sees it. This
// cron runs the SHADOW phase of the note-safety self-improving loop
// (spec: specs/scf-note-safety-review-loop-2026-07-19.md):
//
//   • ENQUEUE: for each draft note with no judgement yet, assemble a safety
//     prompt and enqueue a `scf.note_safety_judge` job on the ₹0 Max lane.
//   • COLLECT: drain finished judge jobs, parse the strict-JSON verdict, and
//     record it via fn_scf_record_note_judgement into scf_note_judgements.
//
// SHADOW = RECOMMENDATION ONLY. This route NEVER writes scf_learner_notes.status.
// It only reads notes and writes predictions to scf_note_judgements, so the
// judge's opinion can be measured against the human reviewers' decisions
// (Phase 1) before it is ever allowed to auto-approve anything (a later
// graduated phase). Crisis/self-harm content is never 'auto_safe'.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` OR `?secret=`.
// Pattern mirrors /api/cron/scf-learner-notes (auth + service-role client) and
// uses the jobs-lane helpers (enqueueJobsLane / collectJobsLane).
// Created: 2026-07-19.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { enqueueJobsLane, collectJobsLane } from '@/lib/services/platform/ai-jobs-lane';

const JOB_TYPE = 'scf.note_safety_judge';
const THRESHOLD_VER = 'shadow-v1';
const ENQUEUE_BATCH = 50;
const COLLECT_BATCH = 100;

type Verdict = 'auto_safe' | 'needs_human' | 'likely_unsafe';
const VALID_VERDICTS: Verdict[] = ['auto_safe', 'needs_human', 'likely_unsafe'];

interface ParsedJudgement {
  verdict: Verdict;
  confidence: number;
  safety_flags: string[];
  reasons: string[];
}

// The safety prompt. The note text + minimal context is all the judge sees; its
// output is a strict-JSON verdict, never a message to anyone.
function buildJudgePrompt(note: string, netDecline: number | null, courseCode: string | null): string {
  return [
    'You are a safety reviewer for a learner-support system.',
    'An AI has drafted a PRIVATE, warm note that would be shown to a LEARNER who appears to be struggling to understand a course. Normally a human reviews each note before the learner sees it. Predict whether THIS note is safe to release to the learner exactly as written.',
    '',
    'NOTE (verbatim):',
    '"""',
    note,
    '"""',
    `Context: course ${courseCode ?? 'unknown'}; recent understanding-decline signal = ${netDecline ?? 'n/a'}.`,
    '',
    'Judge it against ALL of:',
    '- Warm, supportive, encouraging tone (never cold, clinical, or alarming).',
    '- Accurate to a "struggling to understand" signal only — no diagnosis, labels, or over-statement (no "you are failing", no medical/mental-health claims).',
    '- Points the learner to real, appropriate help (their mentor, a learning facilitator, or support).',
    '- No hallucinated specifics (invented grades, names, events, numbers).',
    '- No private or sensitive information about the learner or anyone else.',
    '- CRISIS: if it references or implies self-harm, crisis, safeguarding, or acute distress, it MUST go to a human — never auto_safe.',
    '',
    'Return ONLY strict JSON, no prose, exactly:',
    '{"verdict":"auto_safe"|"needs_human"|"likely_unsafe","confidence":0.0-1.0,"safety_flags":[...],"reasons":["<=12 words", ...]}',
    '- "auto_safe": clearly warm, accurate, benign, points to help, zero flags. Set a HIGH bar.',
    '- "needs_human": anything uncertain, borderline, or with any flag (crisis included).',
    '- "likely_unsafe": alarming, inaccurate, hallucinated, insensitive, or crisis-mishandling.',
    'Valid safety_flags: "crisis","alarming_tone","hallucinated_specifics","inaccurate_to_signal","pii_leak","over_clinical","no_help_pointer","other".',
    'Be conservative: when in doubt, do NOT return auto_safe.',
  ].join('\n');
}

// Strict, fail-safe parse. Anything unparseable or ambiguous becomes needs_human
// (never a false auto_safe). A crisis flag forces at least needs_human.
function parseJudgement(text: string | null): ParsedJudgement {
  const failSafe = (flag: string, reason: string): ParsedJudgement => ({
    verdict: 'needs_human',
    confidence: 0,
    safety_flags: [flag],
    reasons: [reason],
  });
  if (!text) return failSafe('judge_no_output', 'judge produced no text');
  let raw: unknown;
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    raw = JSON.parse(start >= 0 && end > start ? text.slice(start, end + 1) : text);
  } catch {
    return failSafe('judge_parse_error', 'verdict was not valid JSON');
  }
  const o = (raw ?? {}) as Record<string, unknown>;
  let verdict = String(o.verdict ?? '') as Verdict;
  if (!VALID_VERDICTS.includes(verdict)) return failSafe('judge_bad_verdict', 'verdict outside allowed set');
  const confidence = Math.max(0, Math.min(1, Number(o.confidence ?? 0) || 0));
  const flags = Array.isArray(o.safety_flags) ? o.safety_flags.map(String).slice(0, 12) : [];
  const reasons = Array.isArray(o.reasons) ? o.reasons.map(String).slice(0, 12) : [];
  // Safety clamp: a crisis flag may never be auto_safe.
  if (flags.includes('crisis') && verdict === 'auto_safe') verdict = 'needs_human';
  return { verdict, confidence, safety_flags: flags, reasons };
}

function readJobText(message: unknown): string | null {
  const content = (message as { content?: Array<{ type?: string; text?: string }> } | null)?.content;
  const block = content?.find((c) => c?.type === 'text');
  return block?.text?.trim() || null;
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

  // ── COLLECT: record verdicts for finished judge jobs. SHADOW — no status write.
  let recorded = 0;
  let parseFailures = 0;
  const collected = await collectJobsLane(admin, [JOB_TYPE], COLLECT_BATCH);
  for (const item of collected) {
    const noteId = typeof item.context?.note_id === 'string' ? item.context.note_id : null;
    if (!noteId) continue;
    const parsed = parseJudgement(readJobText(item.message));
    if (parsed.safety_flags.some((f) => f.startsWith('judge_'))) parseFailures++;
    const { error } = await admin.rpc('fn_scf_record_note_judgement', {
      p_note_id: noteId,
      p_verdict: parsed.verdict,
      p_confidence: parsed.confidence,
      p_safety_flags: parsed.safety_flags,
      p_reasons: parsed.reasons,
      p_model: 'max-lane',
      p_threshold_ver: THRESHOLD_VER,
    });
    if (!error) recorded++;
    else console.error('[scf-note-judge] record failed:', error.message);
  }

  // ── ENQUEUE: judge the next batch of un-judged drafts.
  let enqueued = 0;
  let enqueueSkipped = 0;
  const { data: awaiting, error: awaitErr } = await admin.rpc('fn_scf_notes_awaiting_judgement', {
    p_limit: ENQUEUE_BATCH,
  });
  if (awaitErr) {
    console.error('[scf-note-judge] awaiting query failed:', awaitErr.message);
  } else if (Array.isArray(awaiting)) {
    for (const n of awaiting as Array<{
      id: string;
      note: string;
      net_decline: number | null;
      course_code: string | null;
    }>) {
      const res = await enqueueJobsLane(admin, {
        jobType: JOB_TYPE,
        prompt: buildJudgePrompt(n.note, n.net_decline, n.course_code),
        context: { note_id: n.id },
        dedupeKey: n.id,
      });
      if (res.ok) enqueued++;
      else enqueueSkipped++;
    }
  }

  return NextResponse.json({
    ok: !awaitErr,
    mode: 'shadow',
    recorded,
    parseFailures,
    enqueued,
    enqueueSkipped,
    // Surface the work-list query error instead of silently swallowing it: a
    // failure here halts all enqueues, so it must not hide behind ok:true.
    awaitError: awaitErr?.message ?? null,
    ms: Date.now() - started,
  });
}
