// =====================================================================
// Session Feedback (SCF) — Self-improving loop: AI support notes for struggling learners
// =====================================================================
// The learner lane of the loop. When a learner has rated their OWN understanding
// of a course lower across 3 classes in a row (the strict downward-trend definition
// — non-increasing, net drop, most-recent <= 3), this daily cron asks Claude to
// draft ONE short, warm, PRIVATE support note pointing them to help, and persists
// it into scf_learner_notes as a DRAFT (status='draft'). Notes await super-admin
// approval (fn_scf_learner_notes_review, /admin/learner-notes) before learners see
// them — the learner's Class Feedback page only ever surfaces status='approved'
// notes, and ONLY when one exists — there is NO template fallback (Director
// decision 2026-06-30; approval queue added 2026-07-03).
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
import {
  resolveChatModel,
  recordChatCall,
} from '@/lib/services/platform/ai-clients/chat';

// ── constants ────────────────────────────────────────────────────────────────

// Model comes from ai_model_config (admin-governed) — resolved once per run via
// resolveChatModel(FEATURE_KEY), which never throws (hardcoded fallback on any
// config failure).
const FEATURE_KEY = 'scf.learner_notes';
// Per-run cap is a platform policy ('scf_notes.batch_cap', editable on
// /admin/ai-routines — Director 2026-07-11: cap is config, default unlimited).
// The Max-lane twin honors the policy fully; THIS serverless route additionally
// clamps to BATCH_CAP_CEILING — 90s of bounded-concurrency waves fits ~50 notes,
// anything larger is the free Max lane's job overnight.
const BATCH_CAP_CEILING = 50; // serverless ceiling; excess deferred to next run / Max lane
const REGEN_DAYS = 7; // skip a learner+course noted within this many days (weekly regen)
const RECENT_WITHIN_DAYS = 30; // only note learners whose latest sliding class is this recent
// Return CLEANLY before the dispatcher's 120s AbortSignal (ai-routine-dispatcher
// fires each routine with signal: AbortSignal.timeout(120_000)). Sequential Claude
// calls (~3-8s each) blew past 120s → the dispatcher aborted the connection and
// logged the run as "operation aborted due to timeout" even though notes were still
// being written server-side. We now (a) run notes in bounded-concurrency waves and
// (b) self-terminate at 90s so the route always returns a clean 200 the dispatcher
// can record, instead of being killed mid-flight.
const BATCH_DEADLINE_MS = 90_000; // < the dispatcher's 120s abort, so we finish first
const NOTE_CONCURRENCY = 10; // parallel Claude calls per wave (well within rate limits)

const UNDERSTOOD_WORD: Record<number, string> = {
  1: 'Lost', 2: 'Shaky', 3: 'OK', 4: 'Good', 5: 'Clear',
};

// A short, warm, private note addressed to the STRUGGLING STUDENT THEMSELVES.
// Anonymity-safe: it speaks only to/about this one student, never references peers,
// never blames or names the teacher, never sounds alarmed.
const SYSTEM_PROMPT = `You are a caring student-support assistant at an Indian higher-education institution. A student has rated their OWN understanding of one course lower across their last three classes — they may be quietly struggling.
Write a SHORT note (3-4 sentences, ~50-90 words) addressed directly to the student as "you". Be warm and human. Normalise that finding a subject hard for a stretch is common and completely okay.
Make it CONCRETE using ONLY the data provided: refer to what the student's own class checklist says was not happening for them (the items are given) and roughly when (their recent classes). Suggest ONE clear next step — a short chat with the named course facilitator (or their mentor, if no facilitator name is given) — and hand them the opening line: what to ask about, drawn from their own marked items.
NEVER shame the student or sound alarmed. NEVER blame or criticise the facilitator — if a name is given, use it ONLY as the person to approach for help. NEVER mention or compare them to other students. Do not invent anything not in the data. Do not promise specific grades or outcomes. Use plain, natural, India-context English — no emojis, no markdown, no quotation marks.
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
  // Actionable-note inputs (2026-07-09): the learner's OWN recurring unmet
  // checklist labels across the 3 sliding classes + the facilitator to approach.
  unmet_items: string[] | null;
  faculty_name: string | null;
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
  modelId: string,
  courseLabel: string,
  ratings: number[],
  ratedOn: string[],
  unmetItems: string[],
  facultyName: string | null,
): Promise<{ note: string | null; modelUsed: string }> {
  if (!anthropic) return { note: null, modelUsed: 'none' };

  const trend = ratings
    .map((r) => `${r}/5 (${UNDERSTOOD_WORD[r] ?? '?'})`)
    .join(' → ');
  // Human dates ("1 Jul") so the note can say when — parity with the facilitator
  // notes' contributing_dates citation (2026-07-09).
  const dates = ratedOn
    .map((d) => {
      const p = new Date(`${d}T00:00:00`);
      return Number.isNaN(p.getTime())
        ? d
        : p.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    })
    .join(', ');
  const userPrompt = `Course: ${courseLabel}
The student's own "how well did you understand?" ratings over their last 3 classes, oldest to newest (1=Lost … 5=Crystal clear): ${trend}.
Those classes were on: ${dates || 'dates unavailable'}.
Checklist items the student could NOT tick in at least 2 of those classes (each item describes something that should happen in class — for this student it did NOT): ${unmetItems.length > 0 ? unmetItems.join('; ') : '(none marked — rely on the ratings only)'}.
Course facilitator to approach: ${facultyName ?? '(name unavailable — suggest a quick word with the course facilitator right after class, or the student support desk)'}.
Write the supportive note now.`;

  try {
    const t0 = Date.now();
    let resp: Anthropic.Message;
    try {
      resp = await anthropic.messages.create(
        {
          model: modelId,
          max_tokens: 300,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
        },
        { timeout: 25_000 },
      );
    } catch (apiErr) {
      await recordChatCall(FEATURE_KEY, 'anthropic', modelId, t0, null, apiErr);
      throw apiErr; // outer catch keeps the { note: null, modelUsed: 'error' } sentinel
    }
    await recordChatCall(FEATURE_KEY, 'anthropic', modelId, t0, resp);
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

  // Per-run cap policy (0/negative or read failure -> ceiling default).
  let batchCap = BATCH_CAP_CEILING;
  try {
    const { data: capData } = await admin.rpc('fn_get_policy_int', {
      p_key: 'scf_notes.batch_cap',
      p_default: BATCH_CAP_CEILING,
      p_scope_id: null,
    });
    if (typeof capData === 'number' && capData > 0) batchCap = Math.min(capData, BATCH_CAP_CEILING);
  } catch {
    // policy read failure -> keep the ceiling default; never abort the run for a knob
  }

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
  if (targets.length > batchCap) {
    cappedCount = targets.length - batchCap;
    batch = targets.slice(0, batchCap);
    console.warn(
      `[cron/scf-learner-notes] batch cap hit: ${targets.length} eligible, processing ${batchCap}, deferring ${cappedCount}`,
    );
  }

  // 5) Init Anthropic (maxRetries:1 — one retry then give up, so a flaky call can't
  //    eat the batch wall-clock). Absent key -> generate nothing (no fallback).
  const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  const anthropic = apiKey ? new Anthropic({ apiKey, maxRetries: 1 }) : null;
  if (!anthropic) {
    console.warn('[cron/scf-learner-notes] no API key — no notes will be generated this run');
  }
  // Resolve the model from ai_model_config ONCE per run (never throws — hardcoded
  // fallback on any config failure).
  const { model_id: modelId } = await resolveChatModel(FEATURE_KEY);

  const weekOf = mondayOf(new Date());
  let generated = 0;
  let skipped = 0;

  // Process in bounded-concurrency waves so the whole batch finishes well within
  // the dispatcher's 120s window (sequential was ~150s → aborted). generateNote is
  // best-effort (returns null on any failure) and every upsert targets an
  // independent (learner, course, week) row, so concurrency adds no cross-item
  // hazard. Counter increments are safe: the runtime is single-threaded, so ++
  // inside these awaited callbacks never races.
  for (let i = 0; i < batch.length; i += NOTE_CONCURRENCY) {
    if (Date.now() - started > BATCH_DEADLINE_MS) {
      console.warn(
        `[cron/scf-learner-notes] batch deadline reached (${generated} generated) — remainder deferred to next run`,
      );
      break;
    }

    const wave = batch.slice(i, i + NOTE_CONCURRENCY);
    const outcomes = await Promise.all(
      wave.map(async (c): Promise<'generated' | 'skipped'> => {
        const ratings = Array.isArray(c.ratings) ? c.ratings.map(Number) : [];
        if (ratings.length < 3) return 'skipped';
        const courseLabel = c.course_name || c.course_code;

        const { note, modelUsed } = await generateNote(
          anthropic,
          modelId,
          courseLabel,
          ratings,
          Array.isArray(c.rated_on) ? c.rated_on.map(String) : [],
          Array.isArray(c.unmet_items) ? c.unmet_items.map(String) : [],
          c.faculty_name ?? null,
        );
        if (!note) {
          // NO template fallback (decision #3) — write nothing; learner sees nothing.
          return 'skipped';
        }

        // Insert the note. Unique (learner_id, course_code, week_of) backstops
        // same-week races; ignoreDuplicates so a re-run within the week is a safe
        // no-op. status:'draft' — notes await super-admin approval
        // (fn_scf_learner_notes_review) before learners see them (approval queue).
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
            status: 'draft',
          },
          { onConflict: 'learner_id,course_code,week_of', ignoreDuplicates: true },
        );
        if (insErr) {
          console.error(`[cron/scf-learner-notes] insert failed for ${c.learner_id}/${c.course_code}:`, insErr);
          return 'skipped';
        }
        return 'generated';
      }),
    );

    for (const o of outcomes) {
      if (o === 'generated') generated++;
      else skipped++;
    }
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
