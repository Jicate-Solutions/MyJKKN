export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
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
  BLUEPRINT_SLOTS,
  LEVEL_KEYS,
  JABT_LEVEL_LABELS,
  boardOf,
  boardShapeConflicts,
  findSwap,
  isPaperLive,
  generatePaper,
  levelOf,
  type EngineContext,
  type ExamRef,
  type PaperAction,
  type PaperConfig,
  type PaperParams,
  type PaperPolicies,
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
// learners can already open is no longer a draft — until `unpublish`, which is
// allowed only while no learner has started an attempt.
//
// OWNERSHIP: a paper is its author's. The picker lists only the caller's own
// papers, and this route refuses anyone else's with an explicit 403 — holding
// foundation.assessments.manage lets a Senior Learner build papers, not open
// or publish a colleague's.

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
  policies: PaperPolicies;
}

const NOT_OWNER = 'This paper belongs to another Senior Learner. Only its author can open or change it.';

async function loadPaper(supabase: any, id: string): Promise<Loaded | null | 'not_owner'> {
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
  const config = normalizeConfig(row.config, paramsFor(exam.config_key, policies));
  return { row: row as AssessmentRow, exam, config, policies };
}

/** Ownership, checked after the load so a wrong id is still a 404 and a
 *  colleague's id is an explicit 403 — never a silent bounce (CLAUDE.md #27). */
async function loadOwnPaper(supabase: any, id: string, userId: string): Promise<Loaded | null | 'not_owner'> {
  const loaded = await loadPaper(supabase, id);
  if (!loaded || loaded === 'not_owner') return loaded;
  if (loaded.row.created_by !== userId) return 'not_owner';
  return loaded;
}

/** The durable order Lane P prints and Lane V serves — read back so publish
 *  can refuse a paper whose preview has drifted from its finalised rows. */
async function loadFinalizedIds(supabase: any, assessmentId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('fp_assessment_items')
    .select('item_id, position')
    .eq('assessment_id', assessmentId)
    .order('position');
  if (error) throw error;
  return ((data ?? []) as { item_id: string }[]).map((r) => r.item_id);
}

/** Has any learner started this paper? Read with the service role on purpose:
 *  fp_attempts RLS is per-learner visibility, so a Senior Learner's session
 *  client could see 0 rows while attempts exist. Only a COUNT leaves here. */
async function attemptCount(assessmentId: string): Promise<number> {
  const admin = createServiceRoleClient();
  const { count, error } = await admin
    .from('fp_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('assessment_id', assessmentId);
  if (error) throw error;
  return count ?? 0;
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
    const loaded = await loadOwnPaper(supabase, id, g.userId);
    if (!loaded) return bad('Paper not found.', 404);
    if (loaded === 'not_owner') return bad(NOT_OWNER, 403);
    return respond(supabase, loaded, g.userId, g.canSeeAnswers);
  } catch (err) {
    // Database / RPC strings stay on the server; the browser gets a fixed line.
    console.error('[onemark/paper] GET [id] failed', err);
    return NextResponse.json({ error: 'Could not load the paper. Please try again.' }, { status: 500 });
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

    const loaded = await loadOwnPaper(supabase, id, g.userId);
    if (!loaded) return bad('Paper not found.', 404);
    if (loaded === 'not_owner') return bad(NOT_OWNER, 403);
    const { exam, policies } = loaded;
    let config: PaperConfig = { ...loaded.config };

    // isPaperLive is the ONE authority on "learners may open this" — Lane V
    // must read it (or config.outputs.published_at) and nothing else.
    const published = isPaperLive(config);
    const mutating = body.action !== 'mark_exported' && body.action !== 'unpublish';
    if (published && mutating) {
      return bad('This paper is published to learners. Unpublish it first to change anything.', 409);
    }

    /** A change to the question list un-finalises the paper: fp_assessment_items
     *  is rewritten on the next finalize, and publish refuses until then. */
    const unfinalised = (c: PaperConfig): PaperConfig['state'] =>
      c.state === 'FINALIZED'
        ? Object.keys(c.question_overrides).length > 0
          ? 'EDITED'
          : 'PREVIEW'
        : c.state;

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
        previousIds: boardOf(config),
      });
      // Decision 15: a reserved slot the pool could not fill is KEPT as a gap
      // (empty_slots), never collapsed — Q3 stays empty rather than becoming
      // an antonym. Trailing pool shortfalls are simply not written.
      config = {
        ...config,
        resolved_item_ids: result.slots.filter((s): s is string => s !== null),
        empty_slots: result.empty_reserved_slots,
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
        const state: PaperConfig['state'] = paramsChanged ? unfinalised(config) : config.state;
        // With the board shape off there are no reserved slots, so no gaps.
        const empty_slots = merged.params.enforce_board_blueprint ? config.empty_slots : [];
        config = { ...config, params: merged.params, step, state, empty_slots };
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
        // The list changed: a FINALIZED paper drops back so its rows are
        // rewritten before it can be printed or published.
        config = { ...config, resolved_item_ids: ids, question_overrides: overrides, state: unfinalised(config) };
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
        // Decision 15: dropping Q2 (a reserved synonym slot) leaves Q2 EMPTY —
        // the antonym at Q4 must not slide up into it.
        const boardSlot = boardOf(config).indexOf(itemId);
        const reservedSlots = new Set(
          exam.config_key === 'tn_hsc_english' && config.params.enforce_board_blueprint
            ? BLUEPRINT_SLOTS.flatMap((gp) => gp.positions)
            : [],
        );
        const empty_slots =
          boardSlot >= 0 && reservedSlots.has(boardSlot)
            ? [...new Set([...config.empty_slots, boardSlot])].sort((a, b) => a - b)
            : config.empty_slots;
        config = {
          ...config,
          resolved_item_ids: config.resolved_item_ids.filter((x) => x !== itemId),
          empty_slots,
          question_overrides: overrides,
          state: unfinalised(config),
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
        // Decision 15: the board shape is never quietly abandoned. A reserved
        // slot that stayed empty blocks finalising until the filters are
        // widened or the shape is switched off.
        if (config.params.enforce_board_blueprint && config.empty_slots.length > 0) {
          const qs = config.empty_slots.map((s) => `Q${s + 1}`).join(', ');
          return bad(
            `The board shape still has ${config.empty_slots.length} empty reserved slot${config.empty_slots.length === 1 ? '' : 's'} (${qs}). Widen the chapters or switch board shape off before finalising.`,
            409,
          );
        }
        // Decision 15 again, read back from the persisted list: a reserved
        // position holding an item without that slot's tag (a config an older
        // build wrote, or a lock that pre-dates the guard) is refused too.
        if (exam.config_key === 'tn_hsc_english' && config.params.enforce_board_blueprint) {
          const board = boardOf(config);
          const reservedIds = BLUEPRINT_SLOTS.flatMap((gp) => gp.positions).map((p) => board[p]).filter((x): x is string => !!x);
          const items = await loadItemsById(supabase, reservedIds);
          const tagsOf = new Map(items.map((it) => [it.id, it.tags]));
          const conflicts = boardShapeConflicts(config, exam.config_key, (id) => tagsOf.get(id));
          if (conflicts.length > 0) {
            const qs = conflicts.map((c) => `Q${c.position} (needs ${c.tag_key})`).join(', ');
            return bad(`The board shape is broken at ${qs}. Regenerate the unlocked questions or switch board shape off before finalising.`, 409);
          }
        }
        // fp_assessment_items is the durable order; rewritten whole so a
        // re-finalize after edits cannot leave a stale row behind. There is
        // no transaction here, so the previous rows are read first and put
        // back if the insert fails — the paper is never left with no rows.
        const previous = await supabase
          .from('fp_assessment_items')
          .select('item_id, position')
          .eq('assessment_id', loaded.row.id);
        if (previous.error) throw previous.error;
        const { error: delErr } = await supabase.from('fp_assessment_items').delete().eq('assessment_id', loaded.row.id);
        if (delErr) throw delErr;
        const { error: insErr } = await supabase
          .from('fp_assessment_items')
          .insert(ids.map((item_id, idx) => ({ assessment_id: loaded.row.id, item_id, position: idx + 1 })));
        if (insErr) {
          const prevRows = (previous.data ?? []) as { item_id: string; position: number }[];
          if (prevRows.length > 0) {
            await supabase
              .from('fp_assessment_items')
              .insert(prevRows.map((r) => ({ assessment_id: loaded.row.id, item_id: r.item_id, position: r.position })));
          }
          throw insErr;
        }
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
        // The rows Lane P prints and Lane V serves must be the list the
        // preview shows. Any drift (an API caller who swapped without
        // re-finalising) is refused rather than published.
        const durable = await loadFinalizedIds(supabase, loaded.row.id);
        if (JSON.stringify(durable) !== JSON.stringify(config.resolved_item_ids)) {
          return bad('The finalised question list is out of date — re-open and finalise the paper again before publishing.', 409);
        }
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

      case 'unpublish': {
        if (!published) return bad('This paper is not published.');
        const attempts = await attemptCount(loaded.row.id);
        if (attempts > 0) {
          return bad(
            `${attempts} learner attempt${attempts === 1 ? ' has' : 's have'} already been recorded on this paper, so it can no longer be withdrawn. Build a new paper instead.`,
            409,
          );
        }
        // Window, duration, shuffle and cohort stay as entered so a wrong
        // date can be corrected and the paper published again. That is safe
        // ONLY because `config.outputs.published_at` (isPaperLive) is the
        // single authority on "live": a paper carrying cohort_id + open_at +
        // close_at + duration_min but no published_at is NOT live, and Lane V
        // must never serve it. Contract stated in the PR body's Lane V section.
        const outputs = { ...(config.outputs ?? {}) };
        delete outputs.published_at;
        config = { ...config, outputs };
        await persist(supabase, loaded, { config });
        return respond(supabase, loaded, g.userId, g.canSeeAnswers);
      }

      default:
        return bad(`Unknown action "${(body as any).action}"`);
    }
  } catch (err) {
    console.error('[onemark/paper] PATCH [id] failed', err);
    return NextResponse.json({ error: 'Could not update the paper. Please try again.' }, { status: 500 });
  }
}
