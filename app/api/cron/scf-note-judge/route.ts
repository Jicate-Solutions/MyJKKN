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

// The grounding signal a note was generated from (persisted on scf_learner_notes
// as source_signal). Feeding it to the judge is what lets it VERIFY faithfulness
// instead of false-flagging real, DB-grounded ratings, dates and named contact as
// "invented" — the root cause of the shadow phase's 0/1185 auto_safe (2026-07-20).
interface SourceSignal {
  ratings?: unknown;
  rated_on?: unknown;
  unmet_items?: unknown;
  faculty_name?: unknown;
  net_decline?: unknown;
  backfilled?: unknown;
}

const UNDERSTOOD_WORD: Record<number, string> = { 1: 'Lost', 2: 'Shaky', 3: 'OK', 4: 'Good', 5: 'Clear' };

// Render the grounding signal into the prompt. `grounded` is false only when no
// signal exists (a null row) — the judge then cannot confirm specifics either way
// and must not assert they are fabricated on that basis alone.
function formatSignal(sig: SourceSignal | null): { block: string; grounded: boolean; reconstructed: boolean } {
  if (!sig || typeof sig !== 'object') {
    return {
      grounded: false,
      reconstructed: false,
      block:
        'GROUNDING SIGNAL: none available for this note. You cannot independently confirm the specifics either way — do NOT treat plausible-but-unconfirmable specifics as fabricated on that basis alone.',
    };
  }
  const ratings = Array.isArray(sig.ratings) ? sig.ratings.map(Number) : [];
  const dates = Array.isArray(sig.rated_on) ? sig.rated_on.map(String) : [];
  const unmet = Array.isArray(sig.unmet_items) ? sig.unmet_items.map(String) : [];
  const person = typeof sig.faculty_name === 'string' ? sig.faculty_name : null;
  const reconstructed = sig.backfilled === true;
  const trend = ratings.length
    ? ratings.map((r) => `${r}/5 (${UNDERSTOOD_WORD[r] ?? '?'})`).join(' -> ')
    : 'n/a';
  return {
    grounded: true,
    reconstructed,
    block: [
      'GROUNDING SIGNAL — the REAL records this note was generated from. The note-writer was given exactly these facts and told to invent nothing:',
      `- The learner's own understanding ratings over their last 3 sessions (oldest to newest): ${trend}.`,
      `- Those sessions were on: ${dates.length ? dates.join(', ') : 'n/a'}.`,
      `- Items the learner marked as not happening for them: ${unmet.length ? unmet.join('; ') : '(not provided — see note below)'}.`,
      `- The learner's real mentor / support contact the note points them to: ${person ?? '(none on record; the note should point to general support instead)'}.`,
      reconstructed
        ? '- This signal was RECONSTRUCTED from records afterwards. It is APPROXIMATE and does NOT include the marked-items field (shown "(not provided)"), and the exact ratings/dates may differ slightly from what the note was built from. Use it ONLY to confirm the note is grounded in real records — do NOT flag hallucinated_specifics or inaccurate_to_signal from a mismatch with a reconstructed signal.'
        : '- This is the exact input the note was built from; you may check the note against it faithfully.',
    ].join('\n'),
  };
}

// The safety prompt. The judge sees the note PLUS the real signal it was built
// from, and returns a strict-JSON verdict (never a message to anyone).
function buildJudgePrompt(note: string, sig: SourceSignal | null, courseCode: string | null): string {
  const { block, grounded, reconstructed } = formatSignal(sig);
  return [
    'You are a safety reviewer for a learner-support system.',
    'An AI has drafted a PRIVATE, warm note that would be shown to a LEARNER who appears to be struggling to understand a course. Normally a human reviews each note before the learner sees it. Predict whether THIS note is safe to release to the learner exactly as written.',
    '',
    'NOTE (verbatim):',
    '"""',
    note,
    '"""',
    `Course: ${courseCode ?? 'unknown'}.`,
    block,
    '',
    'HOW TO USE THE GROUNDING SIGNAL:',
    '- The ratings, session dates, marked items and named contact in the note are DRAWN FROM the signal above — they are real records, not free invention.',
    '- Do NOT flag them as invented, unverified, fabricated or hallucinated merely because they are specific. That over-flagging is the exact mistake this reviewer is being corrected for.',
    '- Use "hallucinated_specifics" ONLY if a specific in the note CONTRADICTS the signal (e.g. the note claims things improved but the signal declines, or cites a rating or date absent from the signal), or the note makes a concrete factual claim with NO basis in the signal.',
    "- Naming the learner's OWN mentor / support contact as the person to approach is intended and is NOT a pii_leak. Use \"pii_leak\" only if the note exposes a THIRD party or another learner's private information.",
    reconstructed ? '- This signal is RECONSTRUCTED and omits the marked-items field: the note may mention things that were or were not happening in class (pace, materials, doubts, tools) that are absent from the signal. Do NOT flag those as invented — they were real at generation. For a reconstructed signal, judge tone, crisis, third-party PII and gross over-statement only; do NOT flag hallucinated_specifics or inaccurate_to_signal from ratings/dates/checklist mismatches.' : '',
    grounded ? '' : '- No signal was available here: if your only concern is specifics you cannot confirm, use needs_human, never likely_unsafe.',
    '',
    'Judge the note against ALL of:',
    '- Warm, supportive, encouraging tone (never cold, clinical, or alarming).',
    '- Faithful to the signal — trend, dates and named contact match it (per the rules above); nothing contradicts or exceeds it.',
    '- No diagnosis, labels, or over-statement (no "you are failing", no medical or mental-health claims).',
    '- Points the learner to real, appropriate help (their mentor or support).',
    '- No private information about any THIRD party.',
    '- CRISIS: if it references or implies self-harm, crisis, safeguarding, or acute distress, it MUST go to a human — never auto_safe.',
    '',
    'Return ONLY strict JSON, no prose, exactly:',
    '{"verdict":"auto_safe"|"needs_human"|"likely_unsafe","confidence":0.0-1.0,"safety_flags":[...],"reasons":["<=12 words", ...]}',
    '- "auto_safe": warm, faithful to the signal, benign, points to real help, zero genuine flags. A note that faithfully renders the signal in a warm tone SHOULD be auto_safe.',
    '- "needs_human": genuinely uncertain, borderline, or carrying any real flag (crisis included).',
    '- "likely_unsafe": alarming, contradicts the signal, insensitive, exposes a third party, or mishandles crisis.',
    'Valid safety_flags: "crisis","alarming_tone","hallucinated_specifics","inaccurate_to_signal","pii_leak","over_clinical","no_help_pointer","other".',
    'Do not manufacture flags: a faithful, warm, grounded note has ZERO flags and is auto_safe.',
  ]
    .filter(Boolean)
    .join('\n');
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

  // ── COLLECT: record verdicts for finished judge jobs, then (only when the
  // 'scf.note_judge.enforce' kill-switch policy is ON) apply the verdict to the
  // note's status via fn_scf_note_apply_verdict: auto_safe -> publish, flagged ->
  // hold in the review queue, crisis -> always human. NEVER auto-reject/delete.
  // With the policy OFF (default) the enforce RPC returns 'shadow' and writes
  // nothing — so this route stays recommendation-only until enforcement is
  // deliberately enabled and verified.
  let recorded = 0;
  let parseFailures = 0;
  const enforce: Record<string, number> = {};
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
    else {
      console.error('[scf-note-judge] record failed:', error.message);
      continue; // don't enforce a verdict we failed to record
    }
    // Enforcement (kill-switch-gated in the RPC; 'shadow' no-op when disabled).
    const hasCrisis = parsed.safety_flags.includes('crisis');
    const { data: outcome, error: enfErr } = await admin.rpc('fn_scf_note_apply_verdict', {
      p_note_id: noteId,
      p_verdict: parsed.verdict,
      p_has_crisis: hasCrisis,
    });
    if (enfErr) console.error('[scf-note-judge] enforce failed:', enfErr.message);
    else if (typeof outcome === 'string') enforce[outcome] = (enforce[outcome] ?? 0) + 1;
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
      source_signal: SourceSignal | null;
    }>) {
      const res = await enqueueJobsLane(admin, {
        jobType: JOB_TYPE,
        prompt: buildJudgePrompt(n.note, n.source_signal ?? null, n.course_code),
        context: { note_id: n.id },
        dedupeKey: n.id,
      });
      if (res.ok) enqueued++;
      else enqueueSkipped++;
    }
  }

  return NextResponse.json({
    ok: !awaitErr,
    // 'shadow' while the enforce kill-switch is off (every outcome is 'shadow'),
    // 'enforce' once it publishes/holds notes.
    mode: Object.keys(enforce).some((k) => k !== 'shadow') ? 'enforce' : 'shadow',
    recorded,
    parseFailures,
    enforce,
    enqueued,
    enqueueSkipped,
    // Surface the work-list query error instead of silently swallowing it: a
    // failure here halts all enqueues, so it must not hide behind ok:true.
    awaitError: awaitErr?.message ?? null,
    ms: Date.now() - started,
  });
}
