// lib/services/onemark/attempt-server.ts
//
// OneMark learner modes — the pieces the three attempt routes share.
// SERVER ONLY (imports @/lib/supabase/server). Never import from a client file.
//
// Rulings of record: specs/onemark-decisions-2026-09-02.md.
// Schema: migration 20260917111500 + types/onemark.ts.
//
// TWO CLIENTS, ON PURPOSE (the rule from app/api/foundation/practice/route.ts)
//   identity  -> SESSION client. fp_students carries `profile_id = auth.uid()`
//                in its RLS, so the caller can only ever resolve THEMSELF.
//   content   -> SERVICE-ROLE client. fp_items carries the answer key and is
//                operator-gated under RLS; a learner cannot read it. Every read
//                of it here goes through `projectItemForLearner`, which is an
//                ALLOW-LIST — `answer`, `explanation` and `explanation_ta` are
//                never in it. Correctness comes back from Lane S's
//                fn_onemark_record_response, and the explanation is released
//                only AFTER a response has been recorded.

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  OneMarkExamKeys,
  OneMarkPolicyDefaults,
  OneMarkPolicyKeys,
  type OneMarkAttemptMode,
  type OneMarkOptionLayout,
} from '@/types/onemark';

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ONEMARK_MODES: OneMarkAttemptMode[] = [
  'practice',
  'timed',
  'live',
  'vault_review',
];

/** Seconds of slack after a clock runs out before a late answer is refused —
 *  covers a slow network on the final tap, not a second attempt. */
export const DEADLINE_GRACE_MS = 15_000;

/** Cap on ids a caller can hand to finalize as "left blank". One sitting is
 *  ~15 questions; this can never exceed one sitting's worth. */
export const MAX_SKIPPED_IDS = 50;

/** Mirrors fn_fp_recompute_weakness's fallback for the same policy key. */
export const DEFAULT_FLAG_THRESHOLD = 2;

/** The two Class-12 subject rows OneMark serves (Wave 1 seeds). */
export const ONEMARK_EXAM_KEYS: string[] = [
  OneMarkExamKeys.PHYSICS,
  OneMarkExamKeys.ENGLISH,
];

export interface OwnLearner {
  id: string;
  full_name: string;
  grade: string | null;
  status: string;
  parental_consent_at: string | null;
}

/** What a learner is allowed to see of an item BEFORE answering it. */
export interface LearnerItem {
  id: string;
  stem: string;
  stemTa: string | null;
  options: unknown[];
  optionsTa: unknown[] | null;
  optionLayout: OneMarkOptionLayout;
  qType: string | null;
  topicId: string | null;
}

/** Columns the service-role client may read of fp_items for a learner-facing
 *  draw. `answer`, `explanation`, `explanation_ta` are deliberately absent, and
 *  the projection function below is the second fence. */
export const LEARNER_ITEM_COLUMNS =
  'id, stem, stem_ta, options, options_ta, option_layout, q_type, topic_id, exam_definition_id, is_active';

export function projectItemForLearner(row: any): LearnerItem {
  return {
    id: row.id,
    stem: row.stem,
    stemTa: row.stem_ta ?? null,
    options: Array.isArray(row.options) ? row.options : [],
    optionsTa: Array.isArray(row.options_ta) ? row.options_ta : null,
    optionLayout: (row.option_layout ?? 'auto') as OneMarkOptionLayout,
    qType: row.q_type ?? null,
    topicId: row.topic_id ?? null,
  };
}

/** Unwrap {"correct": X} to X; leave a bare value alone. Mirrors the RPCs. */
export function normaliseAnswer(answer: any): any {
  if (
    answer !== null &&
    typeof answer === 'object' &&
    !Array.isArray(answer) &&
    'correct' in answer
  ) {
    return answer.correct;
  }
  return answer;
}

/** Fisher-Yates, returning a new array. */
export function shuffle<T>(input: T[]): T[] {
  const out = [...input];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A single shape rather than a discriminated union: with strictNullChecks
 *  off, the `!caller.ok` branch never narrows, so the failure fields are
 *  plain optionals and the routes read them with a fallback. */
export interface ResolvedCaller {
  ok: boolean;
  /** 401 when `ok` is false. */
  status: 401 | 200;
  error: string | null;
  userId: string | null;
  learner: OwnLearner | null;
  supabase: any;
}

/** Who is calling, and which fp_students row is THEIRS. RLS on fp_students
 *  (`profile_id = auth.uid()`) is the boundary; this code just reads through it.
 *  `learner: null` means signed in but not enrolled — an honest empty state,
 *  not an error. */
export async function resolveCaller(): Promise<ResolvedCaller> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, status: 401, error: 'Unauthorized', userId: null, learner: null, supabase };
  }
  const { data: row } = await (supabase as any)
    .from('fp_students')
    .select('id, full_name, grade, status, parental_consent_at')
    .eq('profile_id', user.id)
    .maybeSingle();
  const learner: OwnLearner | null =
    row && row.status === 'active' ? (row as OwnLearner) : null;
  return { ok: true, status: 200, error: null, userId: user.id, learner, supabase };
}

/** Same gate fn_fp_record_attempt applies, applied before an attempt row is
 *  opened so a blocked learner is told at the start, not at the last tap. */
export async function parentalConsentBlocks(
  admin: any,
  learner: OwnLearner,
): Promise<boolean> {
  const { data: required } = await admin.rpc('fn_get_policy_bool', {
    p_key: 'foundation.require_parental_consent',
    p_default: false,
    p_scope_id: null,
  });
  return required === true && !learner.parental_consent_at;
}

export async function readPolicyInt(
  admin: any,
  key: string,
  fallback: number,
): Promise<number> {
  const { data } = await admin.rpc('fn_get_policy_int', {
    p_key: key,
    p_default: fallback,
  });
  return typeof data === 'number' && data > 0 ? data : fallback;
}

export async function timedMinutes(admin: any): Promise<number> {
  return readPolicyInt(
    admin,
    OneMarkPolicyKeys.TIMED_DEFAULT_MINUTES,
    OneMarkPolicyDefaults[OneMarkPolicyKeys.TIMED_DEFAULT_MINUTES],
  );
}

export async function sittingQuestionCount(admin: any): Promise<number> {
  return readPolicyInt(
    admin,
    OneMarkPolicyKeys.PAPER_QUESTION_COUNT,
    OneMarkPolicyDefaults[OneMarkPolicyKeys.PAPER_QUESTION_COUNT],
  );
}

export interface AttemptRow {
  id: string;
  student_id: string;
  assessment_id: string;
  mode: OneMarkAttemptMode | null;
  status: string;
  started_at: string;
  submitted_at: string | null;
  score: number | null;
  session_id: string | null;
}

export const ATTEMPT_COLUMNS =
  'id, student_id, assessment_id, mode, status, started_at, submitted_at, score, session_id';

/** When the clock on an attempt runs out, in epoch ms — or null when it has
 *  no clock (practice, vault review). Live sittings end at the earlier of
 *  their own duration and the paper's close time. */
export function deadlineFor(
  attempt: Pick<AttemptRow, 'mode' | 'started_at'>,
  opts: { timedMinutes: number; assessmentConfig?: any },
): number | null {
  const started = new Date(attempt.started_at).getTime();
  if (attempt.mode === 'timed') {
    return started + opts.timedMinutes * 60_000;
  }
  if (attempt.mode === 'live') {
    const cfg = opts.assessmentConfig ?? {};
    const duration = Number(cfg.duration_min);
    const byDuration =
      Number.isFinite(duration) && duration > 0
        ? started + duration * 60_000
        : null;
    const closeAt = cfg.close_at ? new Date(cfg.close_at).getTime() : null;
    const candidates = [byDuration, closeAt].filter(
      (v): v is number => typeof v === 'number' && Number.isFinite(v),
    );
    return candidates.length ? Math.min(...candidates) : null;
  }
  return null;
}

export function admin() {
  return createServiceRoleClient() as any;
}
