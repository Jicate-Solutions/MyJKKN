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
      return { key: String(r.key ?? String.fromCharCode(97 + i)), text: String(r.text ?? '') };
    }
    return { key: String.fromCharCode(97 + i), text: String(o ?? '') };
  });
}

/** fp_items.answer: scalar "b", `{correct: "b"}` or `["b"]` (fp_rpcs.sql contract). */
export function normaliseAnswer(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string') return raw.toLowerCase();
  if (Array.isArray(raw)) return raw.length ? String(raw[0]).toLowerCase() : null;
  if (typeof raw === 'object' && 'correct' in (raw as Record<string, unknown>)) {
    return normaliseAnswer((raw as Record<string, unknown>).correct);
  }
  return null;
}

interface QuestionOverride {
  stem?: string;
  stem_ta?: string;
  options?: unknown;
  options_ta?: unknown;
  explanation?: string;
  explanation_ta?: string;
}

function applyOverride(item: PaperItem, o: QuestionOverride | undefined): PaperItem {
  if (!o) return item;
  return {
    ...item,
    stemEn: typeof o.stem === 'string' ? o.stem : item.stemEn,
    stemTa: typeof o.stem_ta === 'string' ? o.stem_ta : item.stemTa,
    optionsEn: o.options !== undefined ? normaliseOptions(o.options) : item.optionsEn,
    optionsTa: o.options_ta !== undefined ? normaliseOptions(o.options_ta) : item.optionsTa,
    explanationEn: typeof o.explanation === 'string' ? o.explanation : item.explanationEn,
    explanationTa: typeof o.explanation_ta === 'string' ? o.explanation_ta : item.explanationTa,
  };
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
    .order('position', { ascending: true });
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
      const base: PaperItem = {
        id: it.id,
        position: typeof r.position === 'number' ? r.position : idx + 1,
        stemEn: it.stem ?? '',
        stemTa: it.stem_ta ?? null,
        optionsEn: normaliseOptions(it.options),
        optionsTa: it.options_ta ? normaliseOptions(it.options_ta) : null,
        answerKey: opts.includeAnswers ? normaliseAnswer(it.answer) : null,
        explanationEn: opts.includeAnswers ? it.explanation ?? null : null,
        explanationTa: opts.includeAnswers ? it.explanation_ta ?? null : null,
        optionLayout: it.option_layout ?? 'auto',
        tags,
        bloomLevel: it.bloom_level ?? null,
        topicLabel: it.topic?.display_name ?? null,
        topicKey: it.topic?.config_key ?? null,
        directive: directiveForTags(examKey, tags),
      };
      return applyOverride(base, overrides[it.id]);
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
