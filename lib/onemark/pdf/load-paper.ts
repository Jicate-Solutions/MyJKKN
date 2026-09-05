// File: lib/onemark/pdf/load-paper.ts
//
// OneMark — fp_assessments + fp_assessment_items + fp_items → PaperModel.
//
// TWO CLIENTS, ON PURPOSE (the rule app/api/foundation/practice/route.ts sets):
//   the assessment row is read with the caller's SESSION client, so RLS on
//   fp_assessments decides whether this paper is theirs to see; the items are
//   read with the SERVICE-ROLE client because fp_items carries the answer keys
//   and is gated to foundation.items.*, which a Senior Learner who only builds
//   papers (foundation.assessments.manage) may not hold. The answers are then
//   STRIPPED from the model unless the caller asked for the key — so a
//   question-paper render never holds an answer in memory past this function.
//
// Decision 14: wording edits made while building the paper live in
// fp_assessments.config.question_overrides, keyed by item id, and are applied
// here on top of the master row. The master bank is never touched.

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { OneMarkExamKeys } from '@/types/onemark';
import type { PaperItem, PaperModel, PaperOption, PaperSubject } from './types';

/** Grouped directives the English board paper prints above a run of items
 *  (PRD English §4.2). Derived from the tag; never stored on the item. */
export const ENGLISH_DIRECTIVES: Record<string, string> = {
  synonyms: 'Choose the most appropriate synonyms of the words underlined in the following sentences.',
  antonyms: 'Choose the most appropriate antonyms of the words underlined in the following sentences.',
};

export function directiveForTags(examKey: string | null, tags: string[]): string | null {
  if (examKey !== OneMarkExamKeys.ENGLISH) return null;
  for (const t of tags) {
    if (ENGLISH_DIRECTIVES[t]) return ENGLISH_DIRECTIVES[t];
  }
  return null;
}

export function subjectForExamKey(examKey: string | null): PaperSubject {
  if (examKey === OneMarkExamKeys.PHYSICS) return 'physics';
  if (examKey === OneMarkExamKeys.ENGLISH) return 'english';
  return 'generic';
}

/** fp_items.options is `[{key,text}]` by contract (item-author-dialog.tsx);
 *  a bare string array is tolerated and lettered a–d. */
export function normaliseOptions(raw: unknown): PaperOption[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((o, i) => {
    if (o && typeof o === 'object' && 'text' in (o as Record<string, unknown>)) {
      const r = o as Record<string, unknown>;
      // An empty-string key is no key: it would match an absent answer on the
      // key sheet and present this option's text as the answer.
      const key = typeof r.key === 'string' && r.key.trim() ? r.key : String.fromCharCode(97 + i);
      return { key, text: String(r.text ?? '') };
    }
    return { key: String.fromCharCode(97 + i), text: String(o ?? '') };
  });
}

/**
 * fp_items.options_ta is nullable ("NULL = not yet translated", Wave 1) and is
 * indexed by the ENGLISH option order at print time (layout.ts optionOrder).
 * A half-translated list — fewer or more entries than `options` — cannot be
 * lettered against that order: fewer leaves a hole under (இ)/(ஈ), more drops
 * the extras silently. Either way the item is treated as untranslated: the
 * Tamil stem still prints, the options print once, in English, and the
 * mismatch is logged so the Senior Learner can finish the translation.
 * Reviewer-B finding, 2026-09-04.
 */
export function normaliseTamilOptions(raw: unknown, english: PaperOption[], itemId?: string): PaperOption[] | null {
  if (raw === null || raw === undefined) return null;
  const ta = normaliseOptions(raw);
  if (ta.length === 0) return null;
  if (ta.length !== english.length) {
    console.warn(
      `[onemark/paper] item ${itemId ?? '?'}: options_ta has ${ta.length} entries, options has ${english.length} — printing English options only`,
    );
    return null;
  }
  return ta;
}

/**
 * fp_items.answer → the canonical option key.
 *   scalar "b" · `{correct: "b"}` · `["b"]`   fp_rpcs.sql contract
 *   `{index: 1}` (0-based into `options`)      what EVERY item on production
 *                                              carries today (48/48 across
 *                                              tn_hsc_physics + tn_hsc_english,
 *                                              checked live 2026-09-05): the
 *                                              key printed "—" on all of them
 *                                              until this shape was read.
 *   `{key: "b"}`                               tolerated alias
 */
export function normaliseAnswer(raw: unknown, options: PaperOption[] = []): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string') return raw.toLowerCase();
  if (typeof raw === 'number') return indexToKey(raw, options);
  if (Array.isArray(raw)) return raw.length ? normaliseAnswer(raw[0], options) : null;
  if (typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    if ('correct' in r) return normaliseAnswer(r.correct, options);
    if ('key' in r) return normaliseAnswer(r.key, options);
    if ('index' in r) {
      const n = Number(r.index);
      return Number.isInteger(n) ? indexToKey(n, options) : null;
    }
  }
  return null;
}

function indexToKey(n: number, options: PaperOption[]): string | null {
  if (!Number.isInteger(n) || n < 0) return null;
  const key = options[n]?.key ?? (n < 26 ? String.fromCharCode(97 + n) : null);
  return key ? key.toLowerCase() : null;
}

/**
 * fp_assessments.config.question_overrides[itemId] (decision 14). Every field
 * is independent and PER LANGUAGE: an English-only edit never touches the
 * Tamil block and vice versa. `answer` lets an edit that rewrites or reorders
 * the options carry the key that goes with them.
 */
export interface QuestionOverride {
  stem?: string;
  stem_ta?: string;
  options?: unknown;
  options_ta?: unknown;
  explanation?: string;
  explanation_ta?: string;
  /** Same shapes as fp_items.answer. Honoured only on a key render. */
  answer?: unknown;
}

/**
 * Apply one override on top of the master row. Rules (reviewer findings,
 * PR #3276 round 2):
 *   • `options` rewrites the English list only; `options_ta` the Tamil list
 *     only. An untouched language is kept as loaded.
 *   • If an English rewrite changes the option COUNT, an untouched Tamil list
 *     can no longer be lettered against it and is dropped with a warning —
 *     the same rule normaliseTamilOptions applies to a half-translated row.
 *   • On a key render, `answer` replaces the key; without it, an `options`
 *     rewrite keeps the key ONLY if the new list still carries that key —
 *     otherwise the key is nulled (prints "—") and logged, never left pointing
 *     at whatever now sits under the old letter.
 *   • On a paper render (answers stripped) `answer` is ignored, so an
 *     override can never put an answer into the question paper.
 */
export function applyOverride(item: PaperItem, o: QuestionOverride | undefined, includeAnswers: boolean): PaperItem {
  if (!o) return item;
  const next: PaperItem = { ...item };
  if (typeof o.stem === 'string') next.stemEn = o.stem;
  if (typeof o.stem_ta === 'string') next.stemTa = o.stem_ta;
  if (typeof o.explanation === 'string') next.explanationEn = o.explanation;
  if (typeof o.explanation_ta === 'string') next.explanationTa = o.explanation_ta;

  const englishRewritten = o.options !== undefined;
  if (englishRewritten) next.optionsEn = normaliseOptions(o.options);

  if (o.options_ta !== undefined) {
    next.optionsTa = normaliseTamilOptions(o.options_ta, next.optionsEn, item.id);
  } else if (next.optionsTa && next.optionsTa.length !== next.optionsEn.length) {
    console.warn(
      `[onemark/paper] item ${item.id}: override changed the English option count to ${next.optionsEn.length}; the untouched Tamil list (${next.optionsTa.length}) cannot be lettered against it — printing English options only`,
    );
    next.optionsTa = null;
  }

  if (includeAnswers) {
    if (o.answer !== undefined) next.answerKey = normaliseAnswer(o.answer, next.optionsEn);
    if (englishRewritten && next.answerKey && !next.optionsEn.some((op) => op.key.toLowerCase() === next.answerKey)) {
      console.warn(
        `[onemark/paper] item ${item.id}: override rewrote the options without an answer that matches them (key "${next.answerKey}" not in ${next.optionsEn.map((op) => op.key).join(',')}) — key row will print "—"`,
      );
      next.answerKey = null;
    }
  }
  return next;
}

export interface LoadPaperOptions {
  includeAnswers: boolean;
  /** Test seam — production callers leave these undefined. */
  session?: SupabaseClient;
  admin?: SupabaseClient;
}

/** Null when the assessment is not visible to the caller (RLS) or has no items. */
export async function loadPaperModel(assessmentId: string, opts: LoadPaperOptions): Promise<PaperModel | null> {
  const session = opts.session ?? ((await createClient()) as unknown as SupabaseClient);

  const { data: assessment, error: aErr } = await (session as any)
    .from('fp_assessments')
    .select('id, title, kind, config, exam_definition_id, cohort_id, created_by, created_at, exam:exam_definitions(config_key, display_name)')
    .eq('id', assessmentId)
    .maybeSingle();
  if (aErr) throw new Error(aErr.message);
  if (!assessment) return null;

  const admin = opts.admin ?? (createServiceRoleClient() as unknown as SupabaseClient);

  const { data: rows, error: iErr } = await (admin as any)
    .from('fp_assessment_items')
    .select(
      'position, item:fp_items(id, stem, stem_ta, options, options_ta, answer, explanation, explanation_ta, option_layout, tags, bloom_level, topic:cdc_exam_syllabus_topics(display_name, config_key))',
    )
    .eq('assessment_id', assessmentId)
    // position then item_id: fp_assessment_items.position is `integer NOT NULL
    // DEFAULT 1` with no uniqueness, and the paper and its key are two
    // separate requests — on a tie an unspecified row order would let the key
    // disagree with the sheet. (Reviewer finding, PR #3276 round 2.)
    .order('position', { ascending: true })
    .order('item_id', { ascending: true });
  if (iErr) throw new Error(iErr.message);
  if (!rows || rows.length === 0) return null;

  const config = (assessment.config ?? {}) as Record<string, unknown>;
  const overrides = (config.question_overrides ?? {}) as Record<string, QuestionOverride>;
  const examKey: string | null = assessment.exam?.config_key ?? null;

  let facilitatorName: string | null = null;
  if (assessment.created_by) {
    const { data: creator } = await (admin as any)
      .from('profiles')
      .select('full_name')
      .eq('id', assessment.created_by)
      .maybeSingle();
    facilitatorName = creator?.full_name ?? null;
  }

  let studioName: string | null = null;
  if (assessment.cohort_id) {
    const { data: cohort } = await (admin as any)
      .from('fp_cohorts')
      .select('term, school:schools(name)')
      .eq('id', assessment.cohort_id)
      .maybeSingle();
    if (cohort) {
      studioName = [cohort.school?.name, cohort.term].filter(Boolean).join(' · ') || null;
    }
  }

  const items: PaperItem[] = rows
    .filter((r: any) => r.item)
    .map((r: any, idx: number) => {
      const it = r.item;
      const tags: string[] = Array.isArray(it.tags) ? it.tags : [];
      const optionsEn = normaliseOptions(it.options);
      const base: PaperItem = {
        id: it.id,
        position: typeof r.position === 'number' ? r.position : idx + 1,
        stemEn: it.stem ?? '',
        stemTa: it.stem_ta ?? null,
        optionsEn,
        optionsTa: normaliseTamilOptions(it.options_ta, optionsEn, it.id),
        answerKey: opts.includeAnswers ? normaliseAnswer(it.answer, optionsEn) : null,
        explanationEn: opts.includeAnswers ? it.explanation ?? null : null,
        explanationTa: opts.includeAnswers ? it.explanation_ta ?? null : null,
        optionLayout: it.option_layout ?? 'auto',
        tags,
        bloomLevel: it.bloom_level ?? null,
        topicLabel: it.topic?.display_name ?? null,
        topicKey: it.topic?.config_key ?? null,
        directive: directiveForTags(examKey, tags),
      };
      return applyOverride(base, overrides[it.id], opts.includeAnswers);
    });

  const seriesRaw = Number(config.series_count ?? 1);
  const seriesCount = Number.isFinite(seriesRaw) ? Math.min(4, Math.max(1, Math.floor(seriesRaw))) : 1;
  const subject = subjectForExamKey(examKey);

  return {
    assessmentId: assessment.id,
    title: assessment.title ?? 'OneMark paper',
    subject,
    examKey,
    examDisplayName: assessment.exam?.display_name ?? '',
    bilingual: subject !== 'english' && items.some((i) => !!i.stemTa),
    seriesCount,
    facilitatorName,
    studioName,
    generatedAt: new Date().toISOString(),
    items,
  };
}
