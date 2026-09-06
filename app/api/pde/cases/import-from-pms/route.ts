// app/api/pde/cases/import-from-pms/route.ts
// 2026-07-20 no-op touch: trigger a rebuild so the PMS_EXPORT_* env vars activate (env-only changes are skipped by the ignored-build-step).
// ============================================================================
// Server-to-server "casesheet → PDE teaching case" import.
//
//   GET  ?q=<condition>  → proxy the PMS de-identified condition search
//   POST { casesheet_id } → pull a de-identified casesheet from the PMS app,
//                           draft OSCE questions/weights/ground-truth on the ₹0
//                           Max lane (pde.case_author), and RETURN the assembled
//                           CreateClinicalCaseInput for the faculty form builder.
//
// This route NEVER writes a case — the faculty reviews the AI draft in the
// builder and clicks "Save as draft" (POST /api/pde/cases). AI clinical content
// is never auto-created. The PMS half already de-identifies; here the case facts
// are fenced as untrusted data in the prompt and the job is tool_set='none'.
// ============================================================================

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // long-poll the Max drain (claims ~every minute)

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { enqueueJobsLane, awaitJobsLaneResults } from '@/lib/services/platform/ai-jobs-lane';
import { buildAuthorPrompt, parseDraft, type PmsExport } from '@/lib/services/pde/case-author-draft';
import { requireCaseAuthor } from '@/lib/services/pde/require-case-author';
import { logger } from '@/lib/utils/enhanced-logger';
import type { CreateClinicalCaseInput, ImportedPmsImage } from '@/types/pde';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── option ids: forward-protection at the ingest boundary ──────────────────
// The AI draft returns MCQ options as { text, is_correct, feedback } with NO
// `id`. An id-less option is fatal in TWO independent places downstream, so a
// case must never be able to enter the system in that state:
//
//   • MCQWarmupQuestion tracks the chosen option as `selectedId === o.id` with
//     selectedId starting at null. Once an id-less option is clicked, selectedId
//     becomes undefined and `undefined === undefined` is true for EVERY option —
//     all of them render selected and `disabled={!selectedId}` leaves "Submit
//     answer" permanently dead. The learner can never answer.
//   • fn_pde_mark_objective falls back to the id of the `is_correct` option when
//     correct_answer is null, so a missing id also stops the server identifying
//     the right answer and every submission grades wrong.
//
// The learner-side contract (MCQWarmupOption in types/pde-clinical-reasoning)
// requires `id: string`; the authoring-side MCQOption has no id field at all.
// Stamping here is what reconciles the two.

/** An option as it arrives from the AI draft — `id` may be absent. */
type DraftOption = { id?: unknown; text?: unknown; is_correct?: unknown; feedback?: unknown };
/** Only the two question fields this step reads or rewrites. */
type DraftQuestion = { question_type?: unknown; options?: unknown };

export interface OptionIdStampResult<Q> {
  questions: Q[];
  /** Contract violations found while stamping — logged AND returned, never silent. */
  warnings: string[];
}

const nonEmptyId = (v: unknown): string | null =>
  typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;

/**
 * Give every option of every question a stable, unique, non-empty id, using the
 * `opt<N>` 1-based array-order convention that the repair of the already-imported
 * rows uses, so the two do not disagree.
 *
 * - An id the source already supplied is preserved and never renumbered.
 * - Option `text` and `is_correct` are never altered.
 * - Generated ids skip any id already taken: a DUPLICATE id breaks the learner
 *   UI's `selectedId === o.id` check exactly like a missing one does.
 * - A question whose `options` key is present but unusable (not an array, or an
 *   empty array) is cleared and reported instead of silently imported, and — if
 *   it was typed `mcq_warmup` — degraded to `free_text_socratic` so the question
 *   and its ground truth stay answerable. That mirrors the fallback parseDraft
 *   already applies to an unusable MCQ.
 */
export function stampQuestionOptionIds<Q extends DraftQuestion>(
  questions: readonly Q[]
): OptionIdStampResult<Q> {
  const warnings: string[] = [];

  const stamped = questions.map((q, qi): Q => {
    const label = `question ${qi + 1}`;
    // A text-only question legitimately carries no options — leave it untouched.
    if (q.options === undefined || q.options === null) return q;

    if (!Array.isArray(q.options) || q.options.length === 0) {
      const isMcq = q.question_type === 'mcq_warmup';
      warnings.push(
        `${label}: "options" was present but ${Array.isArray(q.options) ? 'empty' : 'not an array'} — cleared` +
          (isMcq ? ' and re-typed as free_text_socratic (an MCQ with no options is unanswerable)' : '')
      );
      return {
        ...q,
        options: null,
        ...(isMcq ? { question_type: 'free_text_socratic' } : {}),
      } as Q;
    }

    const source = q.options as DraftOption[];
    const taken = new Set<string>();
    for (const o of source) {
      const supplied = nonEmptyId(o?.id);
      if (!supplied) continue;
      if (taken.has(supplied)) {
        warnings.push(`${label}: the source supplied duplicate option id "${supplied}".`);
      }
      taken.add(supplied);
    }

    let next = 1;
    const options = source.map((o) => {
      const supplied = nonEmptyId(o?.id);
      if (supplied) return { ...o, id: supplied };
      while (taken.has(`opt${next}`)) next += 1;
      const id = `opt${next}`;
      taken.add(id);
      next += 1;
      return { ...o, id };
    });

    return { ...q, options } as Q;
  });

  return { questions: stamped, warnings };
}

function pmsConfig(): { base: string; headers: Record<string, string> } | null {
  const base = (process.env.PMS_EXPORT_URL ?? '').replace(/\/+$/, '');
  const token = process.env.PMS_EXPORT_TOKEN ?? '';
  if (!base || token.length < 16) return null;
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  // Cloudflare Access service token — Zero Trust wall in front of the PMS export
  // path. When set, Cloudflare rejects requests without these headers before they
  // reach the PMS host. Dormant (bearer-only) until BOTH env vars exist.
  const cfId = process.env.PMS_CF_ACCESS_CLIENT_ID ?? '';
  const cfSecret = process.env.PMS_CF_ACCESS_CLIENT_SECRET ?? '';
  if (cfId && cfSecret) {
    headers['CF-Access-Client-Id'] = cfId;
    headers['CF-Access-Client-Secret'] = cfSecret;
  }
  return { base, headers };
}

// ─── GET — proxy the PMS condition search ───────────────────────────────────
export async function GET(request: NextRequest) {
  await connection();
  const supabase = await createClient();
  // Teaching staff only — this proxies de-identified patient records out of PMS.
  const gate = await requireCaseAuthor(supabase);
  if (!gate.ok) return NextResponse.json({ error: gate.error, hits: [] }, { status: gate.status });

  const q = (request.nextUrl.searchParams.get('q') ?? '').trim();
  if (q.length < 2) return NextResponse.json({ hits: [] });

  const cfg = pmsConfig();
  if (!cfg) return NextResponse.json({ error: 'PMS import is not configured.', hits: [] }, { status: 503 });

  try {
    const res = await fetch(`${cfg.base}/api/pde-export/search?q=${encodeURIComponent(q)}`, {
      headers: cfg.headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return NextResponse.json({ error: 'PMS search is unavailable.', hits: [] }, { status: 502 });
    const data = (await res.json()) as { hits?: unknown };
    const hits = Array.isArray(data?.hits) ? data.hits.slice(0, 25) : [];
    return NextResponse.json({ hits });
  } catch {
    return NextResponse.json({ error: 'PMS search failed.', hits: [] }, { status: 502 });
  }
}

// ─── POST — pull one casesheet + AI-draft the case ──────────────────────────
export async function POST(request: NextRequest) {
  await connection();
  const supabase = await createClient();
  // Teaching staff only — this pulls a de-identified patient record out of PMS
  // and copies clinical imagery into the shared store.
  const gate = await requireCaseAuthor(supabase);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let body: { casesheet_id?: unknown; course_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const casesheetId = typeof body.casesheet_id === 'string' ? body.casesheet_id.trim() : '';
  if (!UUID_RE.test(casesheetId)) return NextResponse.json({ error: 'Valid casesheet_id required.' }, { status: 400 });
  const courseId = typeof body.course_id === 'string' && UUID_RE.test(body.course_id) ? body.course_id : undefined;

  const cfg = pmsConfig();
  if (!cfg) return NextResponse.json({ error: 'PMS import is not configured on this server.' }, { status: 503 });

  // 1. Pull the de-identified casesheet from PMS.
  let exported: PmsExport;
  try {
    const res = await fetch(`${cfg.base}/api/pde-export/casesheet/${casesheetId}`, {
      headers: cfg.headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 404) return NextResponse.json({ error: 'That casesheet was not found in PMS.' }, { status: 404 });
    if (!res.ok) return NextResponse.json({ error: 'Could not reach the PMS export service.' }, { status: 502 });
    exported = (await res.json()) as PmsExport;
  } catch {
    return NextResponse.json({ error: 'PMS export timed out. Please try again.' }, { status: 502 });
  }
  if (!exported?.case_scenario?.chief_complaint) {
    return NextResponse.json({ error: 'That casesheet has too little clinical detail to build a case.' }, { status: 422 });
  }

  // 1b. Copy de-identified images (≤6) into the pde-clinical-images bucket as
  //     CANDIDATES. The PMS side already strips all file metadata (sharp
  //     re-encode + fail-closed marker assertion); burned-in pixel identifiers
  //     can survive that, so the builder requires faculty to confirm each image
  //     before it can be attached — nothing is auto-placed on the case here.
  //     A failed image never fails the text import.
  const admin = createServiceRoleClient();
  const images: ImportedPmsImage[] = [];
  const candidates = Array.isArray(exported.images) ? exported.images.slice(0, 6) : [];
  for (const im of candidates) {
    if (!im || typeof im.image_id !== 'string' || !UUID_RE.test(im.image_id)) continue;
    try {
      const r = await fetch(`${cfg.base}/api/pde-export/casesheet/${casesheetId}/images/${im.image_id}`, {
        headers: cfg.headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(20_000),
      });
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      // The bridge re-encodes to JPEG ≤1920px; sniff the magic bytes anyway so a
      // PMS-side error page or wrong payload can never land in the bucket.
      if (buf.length < 1024 || buf.length > 10 * 1024 * 1024) continue;
      if (!(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) continue;
      const path = `${casesheetId}/${im.image_id}.jpg`;
      const up = await admin.storage
        .from('pde-clinical-images')
        .upload(path, buf, { contentType: 'image/jpeg', upsert: true });
      if (up.error) continue;
      const pub = admin.storage.from('pde-clinical-images').getPublicUrl(path);
      images.push({
        url: pub.data.publicUrl,
        kind: typeof im.kind === 'string' ? im.kind : 'clinical_photo',
        taken_at: typeof im.taken_at === 'string' ? im.taken_at : undefined,
        seq: Number.isFinite(im.seq) ? Number(im.seq) : images.length + 1,
      });
    } catch {
      // skip this image — text import continues
    }
  }

  // 2. Draft questions/weights/ground-truth on the ₹0 Max lane.
  const prompt = buildAuthorPrompt(exported);
  const enq = await enqueueJobsLane(admin, {
    jobType: 'pde.case_author',
    prompt,
    context: { casesheet_id: casesheetId },
    dedupeKey: `pde-case-author:${casesheetId}`,
  });
  if (!enq.ok) {
    if ('reason' in enq && enq.reason === 'in_flight') {
      return NextResponse.json({ error: 'This case is already being drafted — try again shortly.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'The AI drafting lane is unavailable right now. Please try again later.' }, { status: 503 });
  }

  const results = await awaitJobsLaneResults(admin, [enq.jobId], { deadlineMs: 270_000, intervalMs: 2_500 });
  const text = results.get(enq.jobId);
  if (!text) return NextResponse.json({ error: 'The AI didn’t finish drafting in time. Please try again.' }, { status: 504 });

  const draft = parseDraft(text);
  if (!draft) return NextResponse.json({ error: 'The AI returned a draft we couldn’t read. Please try again.' }, { status: 502 });

  // 2b. Stamp stable option ids BEFORE the draft can become a case. The model
  //     never supplies them, and an id-less option is unanswerable and
  //     ungradeable — see stampQuestionOptionIds.
  const { questions, warnings } = stampQuestionOptionIds(draft.questions);
  if (warnings.length > 0) {
    logger.warn('pde/case-import', 'Repaired option contract violations in the AI draft', {
      casesheet_id: casesheetId,
      warnings,
    });
  }

  // 3. Assemble — but DO NOT write. Faculty reviews in the builder, then saves.
  const assembled: Partial<CreateClinicalCaseInput> = {
    course_id: courseId,
    title: (exported.suggested_title || 'Imported clinical case').slice(0, 200),
    description:
      `Imported from a de-identified PMS casesheet (${casesheetId}). ` +
      `AI-drafted questions and answer-keys — verify clinical accuracy before publishing.`,
    // PMS supplies these fields at runtime; the form builder validates before save.
    case_scenario: exported.case_scenario as unknown as CreateClinicalCaseInput['case_scenario'],
    metadata: { domain_weights: draft.domain_weights, discipline: 'Dentistry', source: 'pms+ai' },
    questions,
    pass_threshold: 60,
  };
  return NextResponse.json({
    data: assembled,
    images,
    sufficiency: exported.source?.sufficiency ?? 'ok',
    warnings,
  });
}
