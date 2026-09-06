'use server';

// OneMark review queue — Approve, server-side.
//
// THIS is the gate between an AI-drafted / ingested question and a learner.
// The card's disabled button is a courtesy; nothing the browser sends is
// trusted here:
//
//   1. The caller must be signed in and hold foundation.items.manage —
//      checked through user_has_permission() (SECURITY DEFINER, multi-role,
//      super-admin bypass), the same predicate the fp_items_write RLS policy
//      uses. A denial is an explicit result, never a silent redirect
//      (CLAUDE.md #27).
//   2. The draft must satisfy approvalBlockers(): a JABT level, a correct
//      option that names a filled option, the board's four options, and (for
//      Physics) a Tamil stem. Decision 7 lets ONE Senior Learner's tick flip
//      is_active; it does not let a half-read draft through.
//   3. Tags must be keys of onemark_item_tags for this subject; a unit, when
//      set, must be on the exam's unit list.
//
// The write runs on the SESSION client — RLS (fp_items_write, the same
// items.manage predicate) is a second wall under the explicit check above.
// No service-role here: the reviewer may see the answer key, so nothing
// needs to run above RLS.
//
// PostgREST re-applies request filters to an UPDATE's RETURNING projection
// (memory: feedback_postgrest_reapplies_filters_to_update_returning). The
// previous client-side approve filtered on is_active=false while WRITING
// is_active=true, which updates the row out of its own response — the write
// commits and the approver sees an error. So: read the row first, refuse if
// it is already live, then UPDATE by id ONLY and select the columns named in
// the filter. Two approvers racing on the same draft both succeed; the later
// stamp wins updated_by — harmless (decision 7: one tick is enough).

import { createClient } from '@/lib/supabase/server';
import { OneMarkExamKeys } from '@/types/onemark';
import { approvalBlockers, BLOOM_LEVELS, OPTION_KEYS } from '../_lib/approve-rules';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LAYOUTS = ['auto', 'inline_4', 'inline_2x2', 'stacked'] as const;

export interface ApproveDraftInput {
  id: string;
  patch: {
    stem: string;
    stem_ta: string | null;
    options: Array<{ key: string; text: string }>;
    options_ta: Array<{ key: string; text: string }> | null;
    answer: { correct: string | null; pending?: boolean };
    explanation: string | null;
    explanation_ta: string | null;
    topic_id: string | null;
    tags: string[];
    bloom_level: string | null;
    option_layout: string;
  };
}

export type ApproveDraftResult =
  | { ok: true; id: string }
  | { ok: false; code: 'unauthenticated' | 'forbidden' | 'invalid' | 'not_a_draft' | 'failed'; error: string };

function cleanOptions(list: unknown): Array<{ key: string; text: string }> | null {
  if (!Array.isArray(list)) return null;
  const seen = new Set<string>();
  const out: Array<{ key: string; text: string }> = [];
  for (const o of list) {
    if (!o || typeof o !== 'object') continue;
    const key = String((o as any).key ?? '').toUpperCase();
    const text = String((o as any).text ?? '').trim();
    if (!(OPTION_KEYS as readonly string[]).includes(key) || !text || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, text });
  }
  return out;
}

export async function approveDraft(input: ApproveDraftInput): Promise<ApproveDraftResult> {
  try {
    if (!input || typeof input !== 'object' || typeof input.id !== 'string' || !UUID_RE.test(input.id)) {
      return { ok: false, code: 'invalid', error: 'A draft id is required.' };
    }
    const patch = input.patch;
    if (!patch || typeof patch !== 'object') {
      return { ok: false, code: 'invalid', error: 'The edited draft is missing.' };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { ok: false, code: 'unauthenticated', error: 'Sign in to approve a draft.' };
    }

    // 1. Permission — server-side, the same key the page and the RLS policy use.
    const { data: allowed, error: permError } = await (supabase as any).rpc('user_has_permission', {
      permission_name: 'foundation.items.manage',
    });
    if (permError || allowed !== true) {
      return {
        ok: false,
        code: 'forbidden',
        error: 'Only a subject Senior Learner who manages the question bank can approve a draft (foundation.items.manage).',
      };
    }

    // 2. Shape — nothing here trusts the card.
    const options = cleanOptions(patch.options);
    const optionsTa = patch.options_ta == null ? null : cleanOptions(patch.options_ta);
    const stem = String(patch.stem ?? '').trim();
    const stemTa = patch.stem_ta == null ? null : String(patch.stem_ta).trim() || null;
    const correct = patch.answer?.correct ? String(patch.answer.correct).toUpperCase() : null;
    const bloom = patch.bloom_level == null ? null : String(patch.bloom_level);
    const layout = String(patch.option_layout ?? 'auto');
    const tags = Array.isArray(patch.tags)
      ? Array.from(new Set(patch.tags.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim())))
      : [];
    const topicId = patch.topic_id == null || patch.topic_id === '' ? null : String(patch.topic_id);

    if (!options) return { ok: false, code: 'invalid', error: 'Options must be a list.' };
    if (!(LAYOUTS as readonly string[]).includes(layout)) {
      return { ok: false, code: 'invalid', error: `Option layout must be one of ${LAYOUTS.join(', ')}.` };
    }
    if (bloom !== null && !(BLOOM_LEVELS as readonly string[]).includes(bloom)) {
      return { ok: false, code: 'invalid', error: `JABT level must be one of ${BLOOM_LEVELS.join(', ')}.` };
    }
    if (topicId !== null && !UUID_RE.test(topicId)) {
      return { ok: false, code: 'invalid', error: 'Unit must be a unit id or empty.' };
    }

    // 3. The row must exist, be a draft, and be one of the two OneMark subjects.
    const { data: row, error: rowError } = await (supabase as any)
      .from('fp_items')
      .select('id, is_active, exam_definition_id, exam:exam_definitions!inner(config_key)')
      .eq('id', input.id)
      .maybeSingle();
    if (rowError) return { ok: false, code: 'failed', error: rowError.message };
    if (!row) return { ok: false, code: 'not_a_draft', error: 'This draft no longer exists.' };
    if (row.is_active === true) {
      return { ok: false, code: 'not_a_draft', error: 'This draft was already approved by someone else.' };
    }
    const examKey: string = row.exam?.config_key ?? '';
    if (!(Object.values(OneMarkExamKeys) as string[]).includes(examKey)) {
      return { ok: false, code: 'invalid', error: 'This item is not on a OneMark subject exam.' };
    }

    // 4. The approval rules — the reason this action exists.
    const blockers = approvalBlockers(
      { stem, stem_ta: stemTa, options, answer: { correct, pending: patch.answer?.pending }, bloom_level: bloom },
      examKey,
    );
    if (blockers.length) {
      return { ok: false, code: 'invalid', error: `To approve, add ${blockers.join(', ')}.` };
    }

    // 5. Tags and unit must be real for this subject.
    if (tags.length) {
      const { data: tagRows, error: tagError } = await (supabase as any)
        .from('onemark_item_tags')
        .select('key, subject_exam_definition_id')
        .in('key', tags)
        .eq('is_active', true);
      if (tagError) return { ok: false, code: 'failed', error: tagError.message };
      const valid = new Set(
        (tagRows ?? [])
          .filter((t: any) => t.subject_exam_definition_id === null || t.subject_exam_definition_id === row.exam_definition_id)
          .map((t: any) => t.key as string),
      );
      const bad = tags.filter((t) => !valid.has(t));
      if (bad.length) {
        return { ok: false, code: 'invalid', error: `Unknown or off-subject tag(s): ${bad.join(', ')}.` };
      }
    }
    if (topicId) {
      const { data: mapRow, error: mapError } = await (supabase as any)
        .from('exam_topic_map')
        .select('topic_id')
        .eq('exam_definition_id', row.exam_definition_id)
        .eq('topic_id', topicId)
        .maybeSingle();
      if (mapError) return { ok: false, code: 'failed', error: mapError.message };
      if (!mapRow) return { ok: false, code: 'invalid', error: 'That unit is not on this subject’s unit list.' };
    }

    // 6. Flip it. By id only — never filter on the column being written.
    const { data: updated, error: updateError } = await (supabase as any)
      .from('fp_items')
      .update({
        stem,
        stem_ta: stemTa,
        options,
        options_ta: optionsTa && optionsTa.length ? optionsTa : null,
        answer: { correct },
        explanation: patch.explanation == null ? null : String(patch.explanation).trim() || null,
        explanation_ta: patch.explanation_ta == null ? null : String(patch.explanation_ta).trim() || null,
        topic_id: topicId,
        tags,
        bloom_level: bloom,
        option_layout: layout,
        is_active: true,
        updated_by: user.id,
      })
      .eq('id', input.id)
      .select('id, is_active');
    if (updateError) return { ok: false, code: 'failed', error: updateError.message };
    if (!updated || updated.length !== 1 || updated[0].is_active !== true) {
      // RLS filtered the row (no write grant) — the permission check above
      // should have caught this; report it rather than pretend.
      return { ok: false, code: 'forbidden', error: 'The bank refused the write. Nothing was approved.' };
    }
    return { ok: true, id: updated[0].id };
  } catch (err: any) {
    return { ok: false, code: 'failed', error: err?.message ?? 'Could not approve the draft.' };
  }
}
