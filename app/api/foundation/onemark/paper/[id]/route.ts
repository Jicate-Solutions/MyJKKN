export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  UUID_RE,
  buildDetail,
  engineContext,
  gate,
  loadCategoryWeights,
  loadChapters,
  loadExam,
  loadItemsById,
  loadPool,
  normalizeConfig,
  paramsFor,
  readPolicies,
  recentlyUsedIds,
  type AssessmentRow,
  type FullItem,
} from '../_shared';
import {
  LEVEL_KEYS,
  JABT_LEVEL_LABELS,
  findSwap,
  generatePaper,
  levelOf,
  type EngineContext,
  type ExamRef,
  type PaperAction,
  type PaperConfig,
  type PaperParams,
  type QuestionOverride,
  type WizardStep,
} from '@/lib/services/onemark/paper-service';

// OneMark — one paper (PRD §3.2 state machine).
//
// GET   /api/foundation/onemark/paper/<id>  -> { paper }
// PATCH /api/foundation/onemark/paper/<id>  -> { action, ... } -> { paper, swap_exhausted? }
//
// Every step transition persists into fp_assessments.config (`save`); the
// preview actions (generate / swap / lock / drop / override) rewrite
// config.resolved_item_ids, config.locked_ids and config.question_overrides;
// `finalize` writes fp_assessment_items with positions; `publish` sets the
// digital window and cohort. Edits after a publish are refused (409) — a paper
// learners can already open is no longer a draft.

const SELECTION_MODES = new Set(['single', 'multi', 'unit', 'volume', 'full_syllabus']);
const DISTRIBUTION_MODES = new Set(['proportional', 'equal_per_chapter', 'manual']);
const PREVIEW_LANGUAGES = new Set(['ta', 'en', 'both']);
const MAX_QUESTIONS = 200;

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Validates a partial params patch; returns the merged params or an error string. */
function mergeParams(
  current: PaperParams,
  patch: Partial<PaperParams> | undefined,
  maxSeries: number,
): { params: PaperParams } | { error: string } {
  if (!patch || typeof patch !== 'object') return { params: current };
  const next: PaperParams = { ...current };
  const strList = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : null);

  if ('selection_mode' in patch) {
    if (!SELECTION_MODES.has(String(patch.selection_mode))) return { error: 'selection_mode is invalid' };
    next.selection_mode = patch.selection_mode as PaperParams['selection_mode'];
  }
  if ('chapter_ids' in patch) {
    const v = strList(patch.chapter_ids);
    if (!v || v.some((id) => !UUID_RE.test(id))) return { error: 'chapter_ids must be uuids' };
    next.chapter_ids = v;
  }
  if ('tag_keys' in patch) {
    const v = strList(patch.tag_keys);
    if (!v) return { error: 'tag_keys must be a list' };
    next.tag_keys = v;
  }
  if ('source_keys' in patch) {
    const v = strList(patch.source_keys);
    if (!v) return { error: 'source_keys must be a list' };
    next.source_keys = v;
  }
  for (const k of ['year_from', 'year_to'] as const) {
    if (k in patch) {
      const v = patch[k];
      if (v !== null && (typeof v !== 'number' || !Number.isInteger(v) || v < 1990 || v > 2100)) {
        return { error: `${k} must be a year or null` };
      }
      next[k] = v as number | null;
    }
  }
  if (next.year_from !== null && next.year_to !== null && next.year_from > next.year_to) {
    return { error: 'year_from cannot exceed year_to' };
  }
  if ('exclude_recent_tests' in patch) {
    const v = patch.exclude_recent_tests;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 10) {
      return { error: 'exclude_recent_tests must be 0..10' };
    }
    next.exclude_recent_tests = v;
  }
  if ('question_count' in patch) {
    const v = patch.question_count;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > MAX_QUESTIONS) {
      return { error: `question_count must be 1..${MAX_QUESTIONS}` };
    }
    next.question_count = v;
  }
  if ('distribution_mode' in patch) {
    if (!DISTRIBUTION_MODES.has(String(patch.distribution_mode))) return { error: 'distribution_mode is invalid' };
    next.distribution_mode = patch.distribution_mode as PaperParams['distribution_mode'];
  }
  if ('chapter_counts' in patch) {
    const v = patch.chapter_counts;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return { error: 'chapter_counts must be an object' };
    const out: Record<string, number> = {};
    for (const [k, n] of Object.entries(v)) {
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) return { error: 'chapter_counts values must be whole numbers' };
      out[k] = n;
    }
    next.chapter_counts = out;
  }
  if ('level_mix' in patch) {
    const v = patch.level_mix;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return { error: 'level_mix must be an object' };
    const out: PaperParams['level_mix'] = {};
    for (const [k, n] of Object.entries(v)) {
      if (!(LEVEL_KEYS as string[]).includes(k)) {
        // Decision 6 — anything that is not a JABT level is refused outright.
        return { error: `level_mix key "${k}" is not a JABT level (K1–K6)` };
      }
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) return { error: 'level_mix values must be whole numbers' };
      out[k as keyof typeof out] = n;
    }
    next.level_mix = out;
  }
  if ('enforce_board_blueprint' in patch) {
    if (typeof patch.enforce_board_blueprint !== 'boolean') return { error: 'enforce_board_blueprint must be boolean' };
    next.enforce_board_blueprint = patch.enforce_board_blueprint;
  }
  if ('series_count' in patch) {
    const v = patch.series_count;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > maxSeries) {
      return { error: `series_count must be 1..${maxSeries}` };
    }
    next.series_count = v;
  }
  if ('preview_language' in patch) {
    if (!PREVIEW_LANGUAGES.has(String(patch.preview_language))) return { error: 'preview_language is invalid' };
    next.preview_language = patch.preview_language as PaperParams['preview_language'];
  }
  if ('pdf_include_key' in patch) {
    if (typeof patch.pdf_include_key !== 'boolean') return { error: 'pdf_include_key must be boolean' };
    next.pdf_include_key = patch.pdf_include_key;
  }
  return { params: next };
}

function cleanOverride(fields: unknown): QuestionOverride | { error: string } {
  if (!fields || typeof fields !== 'object') return { error: 'fields must be an object' };
  const f = fields as Record<string, unknown>;
  const out: QuestionOverride = {};
  for (const k of ['stem', 'stem_ta', 'explanation', 'explanation_ta'] as const) {
    if (k in f && f[k] !== undefined) {
      if (typeof f[k] !== 'string') return { error: `${k} must be text` };
      const s = (f[k] as string).trim();
      if (s.length > 4000) return { error: `${k} is too long` };
      if (s.length > 0) out[k] = s;
    }
  }
  for (const k of ['options', 'options_ta'] as const) {
    if (k in f && f[k] !== undefined) {
      const v = f[k];
      if (!Array.isArray(v) || v.length > 6) return { error: `${k} must be a short list` };
      const rows = [];
      for (const o of v) {
        if (!o || typeof o !== 'object' || typeof (o as any).key !== 'string' || typeof (o as any).text !== 'string') {
          return { error: `${k} rows need key and text` };
        }
        rows.push({ key: (o as any).key.slice(0, 2), text: (o as any).text.slice(0, 1000) });
      }
      out[k] = rows;
    }
  }
  return out;
}

interface Loaded {
  row: AssessmentRow;
  exam: ExamRef;
  config: PaperConfig;
  policies: { question_count: number; max_series: number };
}

async function loadPaper(supabase: any, id: string): Promise<Loaded | null> {
  const { data: row, error } = await supabase
    .from('fp_assessments')
    .select('id, title, exam_definition_id, cohort_id, kind, config, created_by, updated_at')
    .eq('id', id)
    .eq('kind', 'mock')
    .contains('config', { onemark: true })
    .maybeSingle();
  if (error) throw error;
  if (!row) return null;
  const exam = await loadExam(supabase, row.exam_definition_id);
  if (!exam) return null;
  const policies = await readPolicies(supabase);
  const config = normalizeConfig(row.config, paramsFor(exam.config_key, policies.question_count));
  return { row: row as AssessmentRow, exam, config, policies };
}

async function respond(
  supabase: any,
  loaded: Loaded,
  userId: string,
  canSeeAnswers: boolean,
  extra?: { swap_exhausted?: { item_id: string; reason: string } },
) {
  const { row, exam, config } = loaded;
  const [pool, chapters, weights, recent] = await Promise.all([
    loadPool(supabase, exam.id),
    loadChapters(supabase, exam.id),
    loadCategoryWeights(supabase, exam.id),
    recentlyUsedIds(supabase, {
      userId,
      examId: exam.id,
      n: config.params.exclude_recent_tests,
      excludePaperId: row.id,
    }),
  ]);
  const ctx = engineContext({ examKey: exam.config_key, params: config.params, recentlyUsedIds: recent, chapters, categoryWeights: weights });
  const poolIds = new Set(pool.map((p) => p.id));
  const missing = config.resolved_item_ids.filter((id) => !poolIds.has(id));
  const extraItems = await loadItemsById(supabase, missing);
  const paper = buildDetail({ row, exam, config, pool, extraItems, chapters, ctx, canSeeAnswers });
  return NextResponse.json({ paper, ...(extra ?? {}) });
}

async function persist(supabase: any, loaded: Loaded, patch: { config: PaperConfig; title?: string; cohort_id?: string | null }) {
  const update: Record<string, unknown> = { config: patch.config };
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.cohort_id !== undefined) update.cohort_id = patch.cohort_id;
  const { data, error } = await supabase
    .from('fp_assessments')
    .update(update)
    .eq('id', loaded.row.id)
    .select('id, title, exam_definition_id, cohort_id, kind, config, created_by, updated_at')
    .single();
  if (error) throw error;
  loaded.row = data as AssessmentRow;
  loaded.config = patch.config;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    if (!UUID_RE.test(id)) return bad('id must be a uuid');
    const supabase = await createClient();
    const g = await gate(supabase);
    if (!g) return bad('Unauthorized', 401);
    if (!g.canManage) return bad('You do not have access to build OneMark papers.', 403);
    const loaded = await loadPaper(supabase, id);
    if (!loaded) return bad('Paper not found.', 404);
    return respond(supabase, loaded, g.userId, g.canSeeAnswers);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Could not load the paper' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    if (!UUID_RE.test(id)) return bad('id must be a uuid');
    const supabase = await createClient();
    const g = await gate(supabase);
    if (!g) return bad('Unauthorized', 401);
    if (!g.canManage) return bad('You do not have access to build OneMark papers.', 403);

    const body = (await request.json().catch(() => null)) as PaperAction | null;
    if (!body || typeof body !== 'object' || typeof (body as any).action !== 'string') {
      return bad('action is required');
    }

    const loaded = await loadPaper(supabase, id);
    if (!loaded) return bad('Paper not found.', 404);
    const { exam, policies } = loaded;
    let config: PaperConfig = { ...loaded.config };

    const published = !!config.outputs?.published_at;
    const mutating = body.action !== 'mark_exported';
    if (published && mutating) {
      return bad('This paper has been published to learners and can no longer be changed.', 409);
    }

    // Everything past `save` needs the pool and the engine context.
    const withEngine = async () => {
      const [pool, chapters, weights, recent] = await Promise.all([
        loadPool(supabase, exam.id),
        loadChapters(supabase, exam.id),
        loadCategoryWeights(supabase, exam.id),
        recentlyUsedIds(supabase, {
          userId: g.userId,
          examId: exam.id,
          n: config.params.exclude_recent_tests,
          excludePaperId: loaded.row.id,
        }),
      ]);
      const ctx: EngineContext = engineContext({ examKey: exam.config_key, params: config.params, recentlyUsedIds: recent, chapters, categoryWeights: weights });
      return { pool, ctx, chapters };
    };

    const regenerate = async () => {
      const { pool, ctx } = await withEngine();
      const result = generatePaper({
        pool,
        ctx,
        lockedIds: config.locked_ids,
        previousIds: config.resolved_item_ids,
      });
      config = {
        ...config,
        resolved_item_ids: result.slots.filter((s): s is string => s !== null),
        last_generation: result.report,
        state: Object.keys(config.question_overrides).length > 0 ? 'EDITED' : 'PREVIEW',
        step: 4,
      };
      // Overrides for items no longer on the paper are dropped with the item.
      const onPaper = new Set(config.resolved_item_ids);
      config.question_overrides = Object.fromEntries(
        Object.entries(config.question_overrides).filter(([k]) => onPaper.has(k)),
      );
      config.locked_ids = config.locked_ids.filter((l) => onPaper.has(l));
    };

    switch (body.action) {
      case 'save': {
        const merged = mergeParams(config.params, body.params, policies.max_series);
        if ('error' in merged) return bad(merged.error);
        let title: string | undefined;
        if (body.title !== undefined) {
          if (typeof body.title !== 'string' || body.title.trim().length === 0 || body.title.length > 200) {
            return bad('title must be 1–200 characters');
          }
          title = body.title.trim();
        }
        let step: WizardStep = config.step;
        if (body.step !== undefined) {
          if (![1, 2, 3, 4, 5].includes(body.step as number)) return bad('step must be 1..5');
          step = body.step;
        }
        const paramsChanged = JSON.stringify(merged.params) !== JSON.stringify(config.params);
        // Changing the filters after finalising re-opens the paper: the
        // fp_assessment_items rows are rewritten on the next finalize.
        const state: PaperConfig['state'] =
          paramsChanged && config.state === 'FINALIZED'
            ? Object.keys(config.question_overrides).length > 0
              ? 'EDITED'
              : 'PREVIEW'
            : config.state;
        config = { ...config, params: merged.params, step, state };
        await persist(supabase, loaded, { config, title });
        return respond(supabase, loaded, g.userId, g.canSeeAnswers);
      }

      case 'generate': {
        await regenerate();
        await persist(supabase, loaded, { config });
        return respond(supabase, loaded, g.userId, g.canSeeAnswers);
      }

      case 'use_available': {
        // Decision 11 — the Senior Learner chose "fewer". The count becomes
        // exactly what the filters can supply; nothing is padded.
        const available = config.last_generation?.available ?? 0;
        if (available < 1) return bad('Nothing is available under these filters — widen them instead.');
        config = { ...config, params: { ...config.params, question_count: Math.min(available, MAX_QUESTIONS) } };
        await regenerate();
        await persist(supabase, loaded, { config });
        return respond(supabase, loaded, g.userId, g.canSeeAnswers);
      }

      case 'swap': {
        if (!UUID_RE.test(String((body as any).item_id))) return bad('item_id must be a uuid');
        const outgoingId = (body as any).item_id as string;
        const slot = config.resolved_item_ids.indexOf(outgoingId);
        if (slot < 0) return bad('That question is not on this paper.');
        if (config.locked_ids.includes(outgoingId)) return bad('Unlock the question before swapping it.');
        const { pool, ctx } = await withEngine();
        let outgoing: FullItem | undefined = pool.find((p) => p.id === outgoingId);
        if (!outgoing) outgoing = (await loadItemsById(supabase, [outgoingId]))[0];
        if (!outgoing) return bad('That question no longer exists.', 404);
        const replacement = findSwap({ pool, ctx, outgoing, currentIds: config.resolved_item_ids });
        if (!replacement) {
          const reason = `No unused question left with the same chapter, tag and level (${JABT_LEVEL_LABELS[levelOf(outgoing)]}).`;
          return respond(supabase, loaded, g.userId, g.canSeeAnswers, {
            swap_exhausted: { item_id: outgoingId, reason },
          });
        }
        const ids = [...config.resolved_item_ids];
        ids[slot] = replacement.id;
        const overrides = { ...config.question_overrides };
        delete overrides[outgoingId];
        config = { ...config, resolved_item_ids: ids, question_overrides: overrides };
        await persist(supabase, loaded, { config });
        return respond(supabase, loaded, g.userId, g.canSeeAnswers);
      }

      case 'lock': {
        if (!UUID_RE.test(String((body as any).item_id))) return bad('item_id must be a uuid');
        if (typeof (body as any).locked !== 'boolean') return bad('locked must be boolean');
        const itemId = (body as any).item_id as string;
        if (!config.resolved_item_ids.includes(itemId)) return bad('That question is not on this paper.');
        const locked = new Set(config.locked_ids);
        if ((body as any).locked) locked.add(itemId);
        else locked.delete(itemId);
        config = { ...config, locked_ids: [...locked] };
        await persist(supabase, loaded, { config });
        return respond(supabase, loaded, g.userId, g.canSeeAnswers);
      }

      case 'drop': {
        if (!UUID_RE.test(String((body as any).item_id))) return bad('item_id must be a uuid');
        const itemId = (body as any).item_id as string;
        if (!config.resolved_item_ids.includes(itemId)) return bad('That question is not on this paper.');
        if (config.locked_ids.includes(itemId)) return bad('Unlock the question before dropping it.');
        const overrides = { ...config.question_overrides };
        delete overrides[itemId];
        config = {
          ...config,
          resolved_item_ids: config.resolved_item_ids.filter((x) => x !== itemId),
          question_overrides: overrides,
        };
        await persist(supabase, loaded, { config });
        return respond(supabase, loaded, g.userId, g.canSeeAnswers);
      }

      case 'override': {
        if (!UUID_RE.test(String((body as any).item_id))) return bad('item_id must be a uuid');
        const itemId = (body as any).item_id as string;
        if (!config.resolved_item_ids.includes(itemId)) return bad('That question is not on this paper.');
        const overrides = { ...config.question_overrides };
        if ((body as any).fields === null) {
          delete overrides[itemId];
        } else {
          const cleaned = cleanOverride((body as any).fields);
          if ('error' in cleaned) return bad(cleaned.error);
          if (Object.keys(cleaned).length === 0) delete overrides[itemId];
          else overrides[itemId] = cleaned;
        }
        // Decision 14 — copy-on-write. fp_items is never written from here.
        const state: PaperConfig['state'] =
          config.state === 'FINALIZED' ? 'FINALIZED' : Object.keys(overrides).length > 0 ? 'EDITED' : 'PREVIEW';
        config = { ...config, question_overrides: overrides, state };
        await persist(supabase, loaded, { config });
        return respond(supabase, loaded, g.userId, g.canSeeAnswers);
      }

      case 'finalize': {
        const ids = config.resolved_item_ids;
        if (ids.length === 0) return bad('The paper has no questions yet — generate a preview first.');
        // fp_assessment_items is the durable order; rewritten whole so a
        // re-finalize after edits cannot leave a stale row behind.
        const { error: delErr } = await supabase.from('fp_assessment_items').delete().eq('assessment_id', loaded.row.id);
        if (delErr) throw delErr;
        const { error: insErr } = await supabase
          .from('fp_assessment_items')
          .insert(ids.map((item_id, idx) => ({ assessment_id: loaded.row.id, item_id, position: idx + 1 })));
        if (insErr) throw insErr;
        config = { ...config, state: 'FINALIZED', step: 5 };
        await persist(supabase, loaded, { config });
        return respond(supabase, loaded, g.userId, g.canSeeAnswers);
      }

      case 'reopen': {
        if (config.state !== 'FINALIZED') return bad('Only a finalised paper can be re-opened.');
        config = {
          ...config,
          state: Object.keys(config.question_overrides).length > 0 ? 'EDITED' : 'PREVIEW',
          step: 4,
        };
        await persist(supabase, loaded, { config });
        return respond(supabase, loaded, g.userId, g.canSeeAnswers);
      }

      case 'mark_exported': {
        if (config.state !== 'FINALIZED') return bad('Finalise the paper before exporting it.');
        config = { ...config, outputs: { ...(config.outputs ?? {}), pdf_exported_at: new Date().toISOString() } };
        await persist(supabase, loaded, { config });
        return respond(supabase, loaded, g.userId, g.canSeeAnswers);
      }

      case 'publish': {
        if (config.state !== 'FINALIZED') return bad('Finalise the paper before publishing it.');
        const b = body as Extract<PaperAction, { action: 'publish' }>;
        if (!UUID_RE.test(String(b.cohort_id))) return bad('cohort_id must be a uuid');
        const open = new Date(String(b.open_at));
        const close = new Date(String(b.close_at));
        if (Number.isNaN(open.getTime()) || Number.isNaN(close.getTime())) return bad('open_at and close_at must be dates');
        if (close.getTime() <= open.getTime()) return bad('close_at must be after open_at');
        if (typeof b.duration_min !== 'number' || !Number.isInteger(b.duration_min) || b.duration_min < 5 || b.duration_min > 180) {
          return bad('duration_min must be 5..180');
        }
        if (typeof b.shuffle_options !== 'boolean') return bad('shuffle_options must be boolean');
        // The cohort must be one of this exam's — RLS decides whether the
        // caller may see it at all; this only stops a cross-exam mismatch.
        const { data: cohort, error: cohErr } = await supabase
          .from('fp_cohorts')
          .select('id, exam_definition_id, is_active')
          .eq('id', b.cohort_id)
          .maybeSingle();
        if (cohErr) throw cohErr;
        if (!cohort || cohort.exam_definition_id !== exam.id || cohort.is_active === false) {
          return bad('That cohort is not an active cohort on this exam.');
        }
        config = {
          ...config,
          open_at: open.toISOString(),
          close_at: close.toISOString(),
          duration_min: b.duration_min,
          shuffle_options: b.shuffle_options,
          outputs: { ...(config.outputs ?? {}), published_at: new Date().toISOString() },
        };
        await persist(supabase, loaded, { config, cohort_id: b.cohort_id });
        return respond(supabase, loaded, g.userId, g.canSeeAnswers);
      }

      default:
        return bad(`Unknown action "${(body as any).action}"`);
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Could not update the paper' }, { status: 500 });
  }
}
