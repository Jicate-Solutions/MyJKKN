// =====================================================================
// AI Pulse — Domain Starter self-improving prompt loop: generation cron.
// =====================================================================
// Each cycle, for every subject/programme with >= min_learners attending, the
// ₹0 Max lane (job type 'ai_pulse.domain_starter', interactive=false, drained by
// the Windows seat) authors ONE copy-paste starter PACK — three job-modes
// (build-and-publish / skill-drill / career-portfolio) in English + Tamil —
// seeded with how LAST cycle's prompt for that subject landed (its copies + the
// department's engagement lift). That prior signal is the self-improvement hinge:
// a prompt that went unused auto-rewrites sharper next cycle.
//
// ONE SPINE: the "did it help" signal is read from the LIVE ai_pulse_cycle_outcomes
// per-department loop (via the measure fn), never a parallel playbook.
//
// GRAIN is resolved per learner inside fn_ai_pulse_domain_starter_candidates:
// course where the timetable knows it, else programme (100% covered). topic_type
// is a column, so the split moves on its own as timetable coverage grows.
//
// FLOW (one route, re-entrant, idempotent — mirrors scf-generate-suggestions):
//   COLLECT first: drain done ai_jobs, parse the pack, record via
//     fn_ai_pulse_record_domain_starter (upsert; delivered_at → record once).
//   SUBMIT next: fn_ai_pulse_domain_starter_candidates → enqueue one job per
//     topic (dedupe key = cycle|topic → a topic already queued is skipped).
//
// DARK until the kill switch domain_starter_enabled flips true (ai_pulse_policies).
// TAMIL: generated here but lands ta_review_status='pending' (substrate default)
// and is stripped from the learner read until a native reviewer approves it —
// English auto-publishes, Tamil never blasts unreviewed (non-Latin safety).
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` OR `?secret=`.
// Created: 2026-07-20.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { enqueueJobsLane, collectJobsLane } from '@/lib/services/platform/ai-jobs-lane';
import { createHash } from 'node:crypto';

const JOB_TYPE = 'ai_pulse.domain_starter';
const ENABLED_KEY = 'domain_starter_enabled';
const MIN_LEARNERS_KEY = 'domain_starter_min_learners';
const CAP = 60; // max topics to submit/collect per run

type Admin = ReturnType<typeof createServiceRoleClient>;

// Context stashed in payload._ctx so the collect run can record without re-query.
type StarterContext = {
  cycle_id: string;
  topic_type: string;
  topic_id: string;
  topic_label: string;
  institution_id: string | null;
  learner_count: number;
  // Silent control cohort this cycle: generated WITHOUT the improvement hint.
  is_control?: boolean;
};

// A candidate topic row from fn_ai_pulse_domain_starter_candidates.
type CandidateRow = {
  topic_type: string;
  topic_id: string;
  topic_label: string;
  institution_id: string | null;
  learner_count: number;
  prior_context: Record<string, unknown> | null;
};

// ── config reads (fail-safe) ───────────────────────────────────────────────

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

// ── prompt authoring (the learner-facing content) ──────────────────────────

const SYSTEM_PROMPT = `You write ready-to-paste AI "starter prompts" for students in ONE specific academic programme or subject at JKKN, an Indian higher-education institution. Every week, students use AI tools to LEARN, BUILD something, and PUBLISH it (Instagram / GitHub / LinkedIn).

Produce a PACK of THREE short prompts a student in the given subject can copy-paste into any AI chatbot, in TWO languages (English "en" + Tamil "ta"):
- "build"  — produces a concrete artefact the student can make THIS WEEK in their subject, and ends by asking the AI for a ready-to-post caption or a 30-second reel / LinkedIn script (feeds the publish habit).
- "skill"  — drills one core skill of the subject (e.g. quiz me, debug with me, walk me through, explain it simply).
- "career" — builds a portfolio / employability asset tailored to the subject (a project write-up, a resume bullet, a case study, a mini-portfolio piece).

Rules for EACH prompt:
- 1-3 sentences, specific to the subject, India-context aware, immediately usable (no blanks to fill unless it is obviously the student's own topic).
- Written in the second person as the student's own instruction to the AI ("Act as...", "Help me...").
- Do NOT mention scores, ranks, marks, or the institution's internal programmes.
- Tamil ("ta") must be natural, correct written Tamil — NOT English written in Tamil letters and NOT transliteration. Keep genuinely technical terms in English where a Tamil student naturally would.

Return ONLY valid JSON, no markdown, no code fences, no commentary, exactly:
{"en":{"build":"...","skill":"...","career":"..."},"ta":{"build":"...","skill":"...","career":"..."}}`;

function copiesWord(n: unknown): string {
  const c = Number(n);
  if (!Number.isFinite(c) || c <= 0) return 'almost no';
  if (c < 5) return 'a few';
  if (c < 20) return 'some';
  return 'many';
}

function liftWord(n: unknown): string {
  if (n === null || n === undefined) return 'was not measured';
  const l = Number(n);
  if (!Number.isFinite(l)) return 'was not measured';
  return l > 0.02 ? 'rose' : l < -0.02 ? 'dropped' : 'was about the same';
}

/** Assemble the full prompt string the ₹0 drain feeds the model (system + user).
 *  The prior-cycle block is the self-improvement hinge. */
// Deterministic silent control cohort: ~10% of topics each cycle, rotating (the
// cycle_id salt changes the set every cycle, so no topic is held back for long).
// Control topics are generated WITHOUT the improvement hint, so tuned-vs-control
// per-prompt copy-rate isolates the tuning effect from regression to the mean.
// Read the result with fn_ai_pulse_control_vs_tuned(cycle).
function isControlTopic(topicId: string, cycleId: string): boolean {
  return createHash('md5').update(`${topicId}|${cycleId}`).digest()[0] % 10 === 0;
}

function buildPrompt(topicLabel: string, prior: Record<string, unknown> | null): string {
  let improveBlock = '';
  const priorPrompt = prior && typeof prior.prior_prompt === 'string' ? prior.prior_prompt : '';
  if (priorPrompt) {
    // Auto-revert hint (decision #19): when fn_ai_pulse_domain_starter_candidates
    // flags reverted=true, prior_prompt is the BEST earlier version (by copy-rate),
    // not the latest — the most recent rewrite LOST usage. Tell the model to go
    // back toward that better version instead of continuing from the worse one.
    // reverted is only ever set when the domain_starter_autorevert_enabled switch
    // is on; otherwise this branch is never taken and the wording is unchanged.
    if (prior?.reverted === true) {
      improveBlock =
        `\n\nYour MOST RECENT version of this subject's prompts was copied by FEWER learners than an earlier version. ` +
        `Here is that earlier, better-performing "build" prompt: "${priorPrompt}". ` +
        `It was copied by ${copiesWord(prior?.prior_copies)} learners, and their engagement ${liftWord(prior?.prior_lift)}. ` +
        `Go BACK toward this earlier version and improve from HERE — do NOT continue from your last attempt. ` +
        `Make it sharper, simpler, and more hands-on so more learners actually use it, and do NOT repeat the same build idea.`;
    } else {
      improveBlock =
        `\n\nLAST CYCLE you wrote this "build" prompt for this subject: "${priorPrompt}". ` +
        `It was copied by ${copiesWord(prior?.prior_copies)} learners, and their engagement ${liftWord(prior?.prior_lift)}. ` +
        `Make this cycle's prompts sharper, simpler, and more hands-on so more learners actually use them — and do NOT repeat the same build idea.`;
    }
  }
  const user = `Subject / programme: ${topicLabel}.${improveBlock}\n\nReturn the JSON pack now.`;
  return `${SYSTEM_PROMPT}\n\n${user}`;
}

// ── result parsing ──────────────────────────────────────────────────────────

type PromptPack = { en: { build: string; skill?: string; career?: string }; ta?: Record<string, string> };

/** Parse the model's JSON pack. Returns null on any failure so a bad generation
 *  is skipped (the topic re-qualifies next run), never recorded as garbage. */
function parsePack(text: string | null): PromptPack | null {
  if (!text) return null;
  try {
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    let obj: unknown;
    try {
      obj = JSON.parse(cleaned);
    } catch {
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (!m) return null;
      obj = JSON.parse(m[0]);
    }
    const o = obj as Record<string, unknown>;
    const en = o.en as Record<string, unknown> | undefined;
    if (!en || typeof en.build !== 'string' || !en.build.trim()) return null; // en.build is required
    return o as unknown as PromptPack;
  } catch {
    return null;
  }
}

// ── GET handler ──────────────────────────────────────────────────────────────

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

  // Kill switch. DARK until an admin flips domain_starter_enabled = true.
  const enabled = (await readPolicy(admin, ENABLED_KEY)) === true;
  if (!enabled) {
    return NextResponse.json({ ok: true, enabled: false, note: 'domain starter loop is off (dark)' });
  }
  const minLearners = Number(await readPolicy(admin, MIN_LEARNERS_KEY)) || 3;

  // Resolve the cycle: ?cycle=<uuid> override, else the latest ai_pulse cycle.
  let cycleId = request.nextUrl.searchParams.get('cycle');
  if (!cycleId) {
    const { data: cyc } = await admin
      .from('startup_events')
      .select('id, demo_date')
      .eq('config->>kind', 'ai_pulse')
      .neq('status', 'cancelled')
      .order('demo_date', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    cycleId = (cyc as { id?: string } | null)?.id ?? null;
  }
  if (!cycleId) {
    return NextResponse.json({ ok: true, enabled: true, note: 'no ai_pulse cycle found', generated: 0 });
  }

  let recorded = 0;
  let enqueued = 0;
  let skipped = 0;

  // ── COLLECT: drain done jobs, record their packs. ──────────────────────────
  try {
    const items = await collectJobsLane(admin, [JOB_TYPE], CAP);
    for (const item of items) {
      const ctx = item.context as unknown as StarterContext;
      const raw = item.message?.content?.find((b) => b.type === 'text');
      const text = raw && 'text' in raw ? (raw.text as string) : null;
      const pack = parsePack(text);
      if (!pack || !ctx?.cycle_id) {
        skipped++;
        continue;
      }
      const { error } = await admin.rpc('fn_ai_pulse_record_domain_starter', {
        p_payload: {
          cycle_id: ctx.cycle_id,
          topic_type: ctx.topic_type,
          topic_id: ctx.topic_id,
          topic_label: ctx.topic_label,
          institution_id: ctx.institution_id,
          learner_count: ctx.learner_count,
          generated_prompt: text,
          prompt_pack: pack,
          model: 'max-lane',
          is_control: ctx.is_control ?? false,
        },
      });
      if (error) {
        console.error('[cron/aipulse-domain-starter] record failed:', error.message);
        skipped++;
      } else {
        recorded++;
      }
    }
  } catch (e) {
    console.error('[cron/aipulse-domain-starter] collect failed:', e);
  }

  // ── SUBMIT: enqueue one generation job per candidate topic. ─────────────────
  try {
    const { data: candidates, error: candErr } = await admin.rpc('fn_ai_pulse_domain_starter_candidates', {
      p_cycle_id: cycleId,
      p_min_learners: minLearners,
    });
    if (candErr) {
      console.error('[cron/aipulse-domain-starter] candidates failed:', candErr.message);
    } else {
      for (const row of (candidates as CandidateRow[] | null)?.slice(0, CAP) ?? []) {
        const control = isControlTopic(row.topic_id, cycleId);
        const ctx: StarterContext = {
          cycle_id: cycleId,
          topic_type: row.topic_type,
          topic_id: row.topic_id,
          topic_label: row.topic_label,
          institution_id: row.institution_id,
          learner_count: Number(row.learner_count ?? 0),
          is_control: control,
        };
        const res = await enqueueJobsLane(admin, {
          jobType: JOB_TYPE,
          // Control cohort withholds the improvement hint (prior=null) => a clean
          // baseline the tuned cohort is measured against.
          prompt: buildPrompt(row.topic_label, control ? null : (row.prior_context ?? null)),
          context: ctx as unknown as Record<string, unknown>,
          dedupeKey: `aipulse_ds|${cycleId}|${row.topic_type}|${row.topic_id}`,
        });
        if (res.ok) {
          enqueued++;
        } else {
          skipped++;
          const reason = (res as { reason?: string }).reason ?? 'error';
          if (reason !== 'in_flight') {
            console.warn(`[cron/aipulse-domain-starter] enqueue failed (${reason})`);
          }
        }
      }
    }
  } catch (e) {
    console.error('[cron/aipulse-domain-starter] submit failed:', e);
  }

  return NextResponse.json({
    ok: true,
    enabled: true,
    cycle_id: cycleId,
    min_learners: minLearners,
    recorded,
    enqueued,
    skipped,
    elapsed_ms: Date.now() - started,
  });
}
