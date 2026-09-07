export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { OneMarkExamKeys } from '@/types/onemark';
import { buildDraftPayload } from '@/lib/services/onemark/draft-contract';

// OneMark — ask the AI lane to DRAFT one-mark MCQs (decision 3: AI drafts, one
// subject Senior Learner checks every one).
//
// POST /api/foundation/onemark/draft
//   { exam_definition_id, topic_id | null, tag_keys: string[], count, bloom_level }
//   -> 202 { ok: true, job_id, lane, cost_inr: 0, budget, runs_within_minutes,
//            message }
//
// RULING 12 — a spent monthly AI budget never blocks a request. The job is
// enqueued on the ₹0 Max lane either way and the reply says so in plain words.
//
// What this route does NOT do: call a model, or write fp_items. It INSERTs an
// ai_jobs row (job_type 'onemark.item_draft', lane 'max') through
// fn_ai_enqueue; the Max-lane runner reads the seeded prompt_template and its
// output_target lands the drafts as fp_items rows with is_active=false and
// source_key='internal'. They then queue on /foundation/onemark/review like
// any other draft.
//
// CONTRACT DEPENDENCY: the ai_job_types row 'onemark.item_draft' (and its
// input_schema) is seeded by the Lane S migration. Until that row is live and
// enabled, fn_ai_enqueue refuses the job_type and this route answers 503
// "contract pending" — nothing is queued, nothing is spent.
//
// SESSION client only. The enqueue is auth.uid()-scoped inside the RPC, the
// gate is foundation.items.manage (the same key that approves a draft), and
// the reference reads (job type, exam, tags, topic map) all run under RLS.

const JOB_TYPE = 'onemark.item_draft';
const LANE = 'max';
const MAX_COUNT = 20;
const BLOOM_LEVELS = ['K1', 'K2', 'K3', 'K4', 'K5', 'K6'] as const;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The collect pass runs at :09 and :39 (vercel.json), so the longest a
 *  queued request ever waits for the free lane to file its drafts is half an
 *  hour. Said in the reply, in minutes, so nobody watches a screen. */
const FREE_LANE_MAX_WAIT_MINUTES = 30;

interface SchemaField {
  key: string;
  required: boolean;
}

type BudgetState = 'available' | 'exhausted' | 'unknown';

/** RULING 12 — a spent monthly AI budget must not block a drafting request.
 *
 *  The ₹0 Max lane is what this route queues on, and it spends nothing: the
 *  seat runs the prompt and the collect pass files the drafts. So the budget
 *  never gates the enqueue — but the caller deserves to be TOLD which state
 *  they are in, because "queued" means something different when the paid
 *  inline path is off the table. This read is advisory only and fails open to
 *  'unknown': a ledger hiccup must never turn into a refusal. */
async function readBudgetState(cap: unknown): Promise<{ state: BudgetState; capInr: number | null; mtdInr: number | null }> {
  const capInr = typeof cap === 'number' ? cap : cap === null || cap === undefined ? null : Number(cap);
  if (capInr === null || !Number.isFinite(capInr) || capInr <= 0) {
    return { state: 'available', capInr: null, mtdInr: null };
  }
  try {
    // fn_ai_feature_mtd_spend is service-role-only by grant; the caller has
    // already cleared foundation.items.manage above.
    const admin = createServiceRoleClient() as any;
    const { data, error } = await admin.rpc('fn_ai_feature_mtd_spend', {
      p_feature_key: JOB_TYPE,
    });
    if (error) return { state: 'unknown', capInr, mtdInr: null };
    const mtd = typeof data === 'number' ? data : Number(data);
    if (!Number.isFinite(mtd)) return { state: 'unknown', capInr, mtdInr: null };
    return { state: mtd >= capInr ? 'exhausted' : 'available', capInr, mtdInr: mtd };
  } catch {
    return { state: 'unknown', capInr, mtdInr: null };
  }
}

/** The registry stores input_schema either as the house array shape
 *  [{key,type,label,required}] or as a bare object keyed by field. Accept both. */
function schemaFields(schema: unknown): SchemaField[] {
  if (Array.isArray(schema)) {
    return schema
      .filter((f) => f && typeof f === 'object' && typeof (f as any).key === 'string')
      .map((f) => ({ key: (f as any).key as string, required: (f as any).required !== false }));
  }
  if (schema && typeof schema === 'object') {
    return Object.entries(schema as Record<string, unknown>).map(([key, spec]) => ({
      key,
      required:
        !(spec && typeof spec === 'object' && (spec as any).required === false) &&
        !(spec && typeof spec === 'object' && (spec as any).nullable === true),
    }));
  }
  return [];
}

export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: allowed } = await (supabase as any).rpc('user_has_permission', {
      permission_name: 'foundation.items.manage',
    });
    if (allowed !== true) {
      return NextResponse.json(
        { error: 'Forbidden — foundation.items.manage required' },
        { status: 403 },
      );
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 });
    }
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body must be an object' }, { status: 400 });
    }

    // The job type row is the contract. RLS on ai_job_types shows enabled rows
    // only, so an absent read means "not live yet", whatever the cause.
    const { data: jobType } = await (supabase as any)
      .from('ai_job_types')
      .select('job_type, lane, input_schema, monthly_spend_cap_inr')
      .eq('job_type', JOB_TYPE)
      .maybeSingle();
    if (!jobType) {
      return NextResponse.json(
        {
          error: 'contract pending',
          detail: `The ${JOB_TYPE} job type is not live yet. AI drafting opens once the Lane S migration is applied.`,
        },
        { status: 503 },
      );
    }

    // 1. Required keys per the seeded input_schema.
    const missing = schemaFields(jobType.input_schema)
      .filter((f) => f.required)
      .filter((f) => body[f.key] === undefined || body[f.key] === null || body[f.key] === '')
      .map((f) => f.key);
    // topic_id is nullable by design (chapter-agnostic English tags, PRD §4.4).
    const hardMissing = missing.filter((k) => k !== 'topic_id');
    if (hardMissing.length) {
      return NextResponse.json(
        { error: `Missing: ${hardMissing.join(', ')}` },
        { status: 400 },
      );
    }

    // 2. Shape checks the schema cannot express.
    const examDefinitionId = body.exam_definition_id;
    const topicId = body.topic_id ?? null;
    const tagKeys = body.tag_keys;
    const count = body.count;
    const bloomLevel = body.bloom_level;

    if (typeof examDefinitionId !== 'string' || !UUID_RE.test(examDefinitionId)) {
      return NextResponse.json({ error: 'exam_definition_id must be a uuid' }, { status: 400 });
    }
    if (topicId !== null && (typeof topicId !== 'string' || !UUID_RE.test(topicId))) {
      return NextResponse.json({ error: 'topic_id must be a uuid or null' }, { status: 400 });
    }
    if (
      !Array.isArray(tagKeys) ||
      tagKeys.length === 0 ||
      tagKeys.some((t) => typeof t !== 'string' || !t.trim())
    ) {
      return NextResponse.json(
        { error: 'tag_keys must be a non-empty array of tag keys' },
        { status: 400 },
      );
    }
    if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
      return NextResponse.json(
        { error: `count must be an integer between 1 and ${MAX_COUNT}` },
        { status: 400 },
      );
    }
    if (!BLOOM_LEVELS.includes(bloomLevel)) {
      return NextResponse.json(
        { error: `bloom_level must be one of ${BLOOM_LEVELS.join(', ')}` },
        { status: 400 },
      );
    }

    // 3. The exam must be one of the two OneMark subject rows.
    const { data: exam } = await (supabase as any)
      .from('exam_definitions')
      .select('id, config_key, display_name')
      .eq('id', examDefinitionId)
      .maybeSingle();
    const oneMarkKeys: string[] = Object.values(OneMarkExamKeys);
    if (!exam || !oneMarkKeys.includes(exam.config_key)) {
      return NextResponse.json(
        { error: 'exam_definition_id is not a OneMark subject exam' },
        { status: 400 },
      );
    }

    // 4. Every tag must exist, be active, and belong to this subject (or be
    //    subject-agnostic).
    const uniqueTags: string[] = Array.from(new Set(tagKeys as string[]));
    const { data: tagRows } = await (supabase as any)
      .from('onemark_item_tags')
      .select('key, subject_exam_definition_id, label')
      .in('key', uniqueTags)
      .eq('is_active', true);
    const tagLabelByKey = new Map<string, string>(
      (tagRows ?? []).map((t: any) => [t.key as string, (t.label as string) ?? (t.key as string)]),
    );
    const validTags = new Set(
      (tagRows ?? [])
        .filter(
          (t: any) =>
            t.subject_exam_definition_id === null ||
            t.subject_exam_definition_id === examDefinitionId,
        )
        .map((t: any) => t.key as string),
    );
    const badTags = uniqueTags.filter((t) => !validTags.has(t));
    if (badTags.length) {
      return NextResponse.json(
        { error: `Unknown or off-subject tag(s): ${badTags.join(', ')}` },
        { status: 400 },
      );
    }

    let topicLabel: string | null = null;
    // 5. A topic, when given, must be on this exam's unit list.
    if (topicId) {
      const { data: mapRow } = await (supabase as any)
        .from('exam_topic_map')
        .select('topic_id, topic:cdc_exam_syllabus_topics(display_name)')
        .eq('exam_definition_id', examDefinitionId)
        .eq('topic_id', topicId)
        .maybeSingle();
      if (!mapRow) {
        return NextResponse.json(
          { error: 'topic_id is not a unit of this exam' },
          { status: 400 },
        );
      }
      // The same row that proves membership also carries the unit's name, so
      // the label costs no extra round trip. PostgREST returns an embedded
      // to-one either as an object or as a one-element array.
      const embedded = (mapRow as any).topic;
      const topicRow = Array.isArray(embedded) ? embedded[0] : embedded;
      topicLabel = topicRow?.display_name ?? null;
    }

    // 6. Queue it. fn_ai_enqueue resolves the lane from the job type row;
    //    we assert the lane we were built against so a re-laned row is loud.
    if (jobType.lane && jobType.lane !== LANE) {
      return NextResponse.json(
        { error: `contract mismatch: ${JOB_TYPE} is on lane '${jobType.lane}', expected '${LANE}'` },
        { status: 503 },
      );
    }
    // The Max seat runner validates input_schema keys at the TOP LEVEL and
    // substitutes exactly one slot, {{prompt}}, from payload.prompt. Sending
    // the fields flat left that slot empty (the model replied "I don't see the
    // actual input payload", ai_jobs 1096542b); sending them only under _ctx
    // was refused outright ("missing required input(s)", ai_jobs bbbf0cbc).
    // buildDraftPayload composes the run's data into the prompt text and keeps
    // the fields under _ctx for the collect pass. Migration 20260918150000
    // aligns the job type's template and input_schema with this.
    const payload = buildDraftPayload(
      {
        exam_definition_id: examDefinitionId,
        exam_key: exam.config_key,
        topic_id: topicId,
        tag_keys: uniqueTags,
        count,
        bloom_level: bloomLevel,
      },
      {
        // Names, not ids. A uuid tells the model nothing about which chapter it
        // is drafting for; with ids alone it refuses rather than guess.
        exam_label: exam.display_name ?? exam.config_key,
        topic_label: topicLabel,
        tag_labels: uniqueTags.map((k) => tagLabelByKey.get(k) ?? k),
      },
    );
    const { data: enq, error: enqError } = await (supabase as any).rpc('fn_ai_enqueue', {
      p_job_type: JOB_TYPE,
      p_payload: payload,
    });
    if (enqError || !enq?.ok || typeof enq?.job_id !== 'string') {
      const errText = typeof enq?.error === 'string' ? enq.error : '';
      if (errText === 'unknown or disabled job_type') {
        return NextResponse.json(
          { error: 'contract pending', detail: `${JOB_TYPE} is not enabled.` },
          { status: 503 },
        );
      }
      if (errText === 'too many in-flight jobs of this type') {
        return NextResponse.json(
          { error: 'A drafting request is already running. Wait for it to finish.' },
          { status: 429 },
        );
      }
      if (errText === 'not allowed for this job_type') {
        return NextResponse.json({ error: 'Forbidden for this job type' }, { status: 403 });
      }
      return NextResponse.json(
        { error: enqError?.message ?? errText ?? 'Could not queue the drafting job' },
        { status: 502 },
      );
    }

    // RULING 12 — the same job, the same free lane, whatever the budget says.
    // The reply names the state so a Senior Learner is never left guessing why
    // a request "went quiet": queued means queued, and the collect pass files
    // the drafts within half an hour at no cost either way.
    const budget = await readBudgetState((jobType as any).monthly_spend_cap_inr);
    return NextResponse.json(
      {
        ok: true,
        job_id: enq.job_id,
        lane: LANE,
        cost_inr: 0,
        budget: budget.state,
        runs_within_minutes: FREE_LANE_MAX_WAIT_MINUTES,
        message:
          budget.state === 'exhausted'
            ? `This month's AI budget is spent, so this is queued for the free lane — it runs within ${FREE_LANE_MAX_WAIT_MINUTES} minutes at no cost.`
            : `Queued — it runs within ${FREE_LANE_MAX_WAIT_MINUTES} minutes at no cost.`,
      },
      { status: 202 },
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Could not queue the drafting job' },
      { status: 500 },
    );
  }
}
