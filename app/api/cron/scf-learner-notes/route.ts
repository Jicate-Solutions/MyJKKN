// =====================================================================
// Session Feedback (SCF) — Self-improving loop: AI support notes for struggling learners
// =====================================================================
// The learner lane of the loop. When a learner has rated their OWN understanding
// of a course lower across 3 classes in a row (the strict downward-trend definition
// — non-increasing, net drop, most-recent <= 3), this daily cron asks Claude to
// draft ONE short, warm, PRIVATE support note pointing them to help, and persists
// it into scf_learner_notes. The learner sees it on their Class Feedback page ONLY
// when one exists — there is NO template fallback (Director decision 2026-06-30).
//
// FREQUENCY (decision): a fresh note every week the learner is still sliding. The
//   regen guard skips a (learner, course) that already has a note generated within
//   the last 7 days, so a persistently-struggling learner gets a new note ~weekly,
//   not a one-shot-until-recovery.
// PRIVACY: the note text is private to the learner. This cron writes via the
//   service-role client (RLS-bypassing); the candidate list comes from the
//   service_role-only fn_scf_downward_trend_all. Leadership only ever sees that a
//   note WAS sent (fn_scf_struggling_notes_sent), never the wording.
//
// Pattern mirrors /api/cron/scf-generate-suggestions (auth, client, batch deadline,
// per-call timeout, structured response). AI logic is bespoke (a single warm note,
// not the JSON suggestion shape). NEVER falls back to a template: a Claude failure
// means NO note is written this run (the learner sees nothing until a real one exists).
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` OR `?secret=` query param.
// Env: CLAUDE_API_KEY or ANTHROPIC_API_KEY. No key -> nothing is generated.
// Schedule: daily at 06:09 UTC (≈11:39 IST), just after scf-generate-suggestions
//   (05:47). Created: 2026-06-30.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';

// ── constants ────────────────────────────────────────────────────────────────

const MODEL = 'claude-sonnet-4-6';
const BATCH_CAP = 50; // max notes to generate per run; excess deferred to next run
const REGEN_DAYS = 7; // skip a learner+course noted within this many days (weekly regen)
const RECENT_WITHIN_DAYS = 30; // only note learners whose latest sliding class is this recent
const BATCH_DEADLINE_MS = 240_000; // stop taking new targets near maxDuration

const UNDERSTOOD_WORD: Record<number, string> = {
  1: 'Lost', 2: 'Shaky', 3: 'OK', 4: 'Good', 5: 'Clear',
};

// A short, warm, private note addressed to the STRUGGLING STUDENT THEMSELVES.
// Anonymity-safe: it speaks only to/about this one student, never references peers,
// never blames or names the teacher, never sounds alarmed.
const SYSTEM_PROMPT = `You are a caring student-support assistant at an Indian higher-education institution. A student has rated their OWN understanding of one course lower across their last three classes — they may be quietly struggling.
Write a SHORT note (2-3 sentences, ~40-60 words) addressed directly to the student as "you". Be warm and human. Normalise that finding a subject hard for a stretch is common and completely okay. Gently encourage them to reach out EARLY to their course faculty or mentor for help, and reassure them that support is there for them.
NEVER shame the student or sound alarmed. NEVER blame, criticise, or mention the teacher. NEVER mention or compare them to other students. Do not promise specific grades or outcomes. Use plain, natural, India-context English — no emojis, no markdown, no quotation marks.
Return ONLY the note text, nothing else.`;

// ── types ────────────────────────────────────────────────────────────────────

type CandidateRow = {
  learner_id: string;
  institution_id: string | null;
  course_code: string;
  course_name: string | null;
  ratings: number[] | null;
  rated_on: string[] | null;
  net_decline: number | null;
};

// ── helpers ────────────────────────────────────────────────────────────────────

// Monday (UTC) of the week containing d — the weekly-regen bucket stored in week_of.
function mondayOf(d: Date): string {
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day; // days back to Monday
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff));
  return m.toISOString().slice(0, 10);
}

// Generate the note via Claude. Returns null on ANY failure (missing key, timeout,
// empty text) — the cron then writes NOTHING for this learner (no template fallback).
async function generateNote(
  anthropic: Anthropic | null,
  courseLabel: string,
  ratings: number[],
): Promise<{ note: string | null; modelUsed: string }> {
  if (!anthropic) return { note: null, modelUsed: 'none' };

  const trend = ratings
    .map((r) => `${r}/5 (${UNDERSTOOD_WORD[r] ?? '?'})`)
    .join(' → ');
  const userPrompt = `Course: ${courseLabel}
The student's own "how well did you understand?" ratings over their last 3 classes, oldest to newest (1=Lost … 5=Crystal clear): ${trend}.
Write the supportive note now.`;

  try {
    const resp = await anthropic.messages.create(
      {
        model: MODEL,
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      },
      { timeout: 25_000 },
    );
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()
      // strip any stray surrounding quotes the model might add
      .replace(/^["'`]+|["'`]+$/g, '')
      .trim();
    if (!text) return { note: null, modelUsed: 'empty' };
    return { note: text, modelUsed: resp.model };
  } catch (err) {
    console.error('[cron/scf-learner-notes] AI generation failed:', err);
    return { note: null, modelUsed: 'error' };
  }
}

// ── GET handler ──────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // 1) Authorize — same pattern as all CRON_SECRET sibling routes.
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

  const recentParam = request.nextUrl.searchParams.get('recent_days');
  const recentWithin =
    recentParam && /^\d+$/.test(recentParam) ? parseInt(recentParam, 10) : RECENT_WITHIN_DAYS;

  // 2) List every learner currently on a downward trend (service_role-only RPC).
  const { data: candidates, error: listErr } = await admin.rpc('fn_scf_downward_trend_all', {
    p_recent_within_days: recentWithin,
  });
  if (listErr) {
    console.error('[cron/scf-learner-notes] candidate listing failed:', listErr);
    return NextResponse.json(
      { ok: false, error: listErr.message, elapsed_ms: Date.now() - started },
      { status: 500 },
    );
  }

  const allCandidates = (candidates ?? []) as CandidateRow[];

  // 3) Regen guard: skip (learner, course) pairs noted within the last REGEN_DAYS,
  //    so a still-struggling learner is re-noted ~weekly (decision), not on every run.
  const sinceIso = new Date(Date.now() - REGEN_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentNotes, error: recentErr } = await admin
    .from('scf_learner_notes')
    .select('learner_id, course_code')
    .gte('generated_at', sinceIso);
  if (recentErr) {
    // Fail CLOSED: a query error here could cause re-noting (and re-spend) of every
    // candidate. Skip the run rather than risk duplicate notes; next run recovers.
    console.error('[cron/scf-learner-notes] regen-guard query failed — aborting run:', recentErr);
    return NextResponse.json(
      { ok: false, error: recentErr.message, elapsed_ms: Date.now() - started },
      { status: 500 },
    );
  }
  const noted = new Set((recentNotes ?? []).map((r) => `${r.learner_id}|${r.course_code}`));

  const targets = allCandidates.filter((c) => !noted.has(`${c.learner_id}|${c.course_code}`));

  // 4) Cap the batch; log truncation so ops can see pressure.
  let cappedCount = 0;
  let batch = targets;
  if (targets.length > BATCH_CAP) {
    cappedCount = targets.length - BATCH_CAP;
    batch = targets.slice(0, BATCH_CAP);
    console.warn(
      `[cron/scf-learner-notes] batch cap hit: ${targets.length} eligible, processing ${BATCH_CAP}, deferring ${cappedCount}`,
    );
  }

  // 5) Init Anthropic (maxRetries:1 — one retry then give up, so a flaky call can't
  //    eat the batch wall-clock). Absent key -> generate nothing (no fallback).
  const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  const anthropic = apiKey ? new Anthropic({ apiKey, maxRetries: 1 }) : null;
  if (!anthropic) {
    console.warn('[cron/scf-learner-notes] no API key — no notes will be generated this run');
  }

  const weekOf = mondayOf(new Date());
  let generated = 0;
  let skipped = 0;

  for (const c of batch) {
    if (Date.now() - started > BATCH_DEADLINE_MS) {
      console.warn(
        `[cron/scf-learner-notes] batch deadline reached (${generated} generated) — remainder deferred`,
      );
      break;
    }

    const ratings = Array.isArray(c.ratings) ? c.ratings.map(Number) : [];
    if (ratings.length < 3) {
      skipped++;
      continue;
    }
    const courseLabel = c.course_name || c.course_code;

    const { note, modelUsed } = await generateNote(anthropic, courseLabel, ratings);
    if (!note) {
      // NO template fallback (decision #3) — write nothing; learner sees nothing.
      skipped++;
      continue;
    }

    // Insert the note. Unique (learner_id, course_code, week_of) backstops same-week
    // races; ignoreDuplicates so a re-run within the week is a safe no-op.
    const { error: insErr } = await admin.from('scf_learner_notes').upsert(
      {
        learner_id: c.learner_id,
        institution_id: c.institution_id,
        course_code: c.course_code,
        course_name: c.course_name,
        note,
        model: modelUsed,
        net_decline: c.net_decline,
        week_of: weekOf,
      },
      { onConflict: 'learner_id,course_code,week_of', ignoreDuplicates: true },
    );
    if (insErr) {
      console.error(`[cron/scf-learner-notes] insert failed for ${c.learner_id}/${c.course_code}:`, insErr);
      skipped++;
      continue;
    }
    generated++;
  }

  return NextResponse.json({
    ok: true,
    week_of: weekOf,
    candidates: allCandidates.length,
    eligible: targets.length, // after the weekly regen guard
    capped: cappedCount,
    generated,
    skipped,
    ai_available: Boolean(anthropic),
    elapsed_ms: Date.now() - started,
  });
}
