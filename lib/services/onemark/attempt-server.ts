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

import { createHmac, timingSafeEqual } from 'node:crypto';
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

/** The permission the whole lane is gated on — checked server-side in
 *  resolveCaller as well as on the page, so a role whose key was revoked
 *  loses the API too, not only the button. */
export const ONEMARK_TAKE_PERMISSION = 'foundation.practice.take';

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

/** Shuffle a question's options ONCE, by key, and apply the same order to the
 *  Tamil array — so a learner who set the switch to தமிழ் still gets Tamil
 *  options on a shuffled live paper (decision 5 / PRD §1.2). Keys travel with
 *  their text in both languages, so the answer key still matches. An
 *  `optionsTa` entry with no matching key is dropped rather than mis-paired. */
export function shuffleOptionsTogether(q: LearnerItem): LearnerItem {
  const en = q.options.filter(
    (o: any): o is { key: string } => o && typeof o === 'object' && typeof o.key === 'string',
  );
  if (en.length !== q.options.length) {
    // Options without keys cannot be paired across languages; leave the
    // question as it came rather than guess.
    return q;
  }
  const order = shuffle(en.map((o: any) => o.key as string));
  const enByKey = new Map(en.map((o: any) => [o.key as string, o]));
  const taByKey = new Map<string, unknown>();
  for (const o of q.optionsTa ?? []) {
    if (o && typeof o === 'object' && typeof (o as any).key === 'string') {
      taByKey.set((o as any).key, o);
    }
  }
  const optionsTa = q.optionsTa
    ? order.map((k) => taByKey.get(k)).filter((o): o is unknown => o !== undefined)
    : null;
  return {
    ...q,
    options: order.map((k) => enByKey.get(k)!),
    optionsTa: optionsTa && optionsTa.length === order.length ? optionsTa : null,
  };
}

/** A single shape rather than a discriminated union: with strictNullChecks
 *  off, the `!caller.ok` branch never narrows, so the failure fields are
 *  plain optionals and the routes read them with a fallback. */
export interface ResolvedCaller {
  ok: boolean;
  /** 401 (not signed in) or 403 (no foundation.practice.take) when `ok` is false. */
  status: 401 | 403 | 200;
  error: string | null;
  userId: string | null;
  learner: OwnLearner | null;
  supabase: any;
}

/** Who is calling, and which fp_students row is THEIRS. RLS on fp_students
 *  (`profile_id = auth.uid()`) is the boundary; this code just reads through it.
 *  `learner: null` means signed in but not enrolled — an honest empty state,
 *  not an error.
 *
 *  The permission gate runs here too (same single-argument overload the
 *  facilitate route uses: it resolves against auth.uid() internally, so there
 *  is no caller-supplied id to forge, and it carries the super-admin bypass).
 *
 *  fp_students has no UNIQUE on profile_id, so a profile enrolled at two
 *  schools has two rows; the ACTIVE one is the learner, never "not enrolled". */
export async function resolveCaller(): Promise<ResolvedCaller> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, status: 401, error: 'Unauthorized', userId: null, learner: null, supabase };
  }
  const { data: allowed } = await (supabase as any).rpc('user_has_permission', {
    permission_name: ONEMARK_TAKE_PERMISSION,
  });
  if (allowed !== true) {
    return {
      ok: false,
      status: 403,
      error: 'You do not have access to OneMark practice.',
      userId: user.id,
      learner: null,
      supabase,
    };
  }
  const { data: rows } = await (supabase as any)
    .from('fp_students')
    .select('id, full_name, grade, status, parental_consent_at')
    .eq('profile_id', user.id)
    .order('created_at', { ascending: true });
  const list: any[] = Array.isArray(rows) ? rows : rows ? [rows] : [];
  const active = list.find((r) => r && r.status === 'active');
  const learner: OwnLearner | null = active ? (active as OwnLearner) : null;
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

// ---------------------------------------------------------------------------
// The served set — which questions THIS sitting actually showed.
// ---------------------------------------------------------------------------
// fp_attempts has no column for the draw, so for practice / timed / vault
// review the set is bound to the attempt with a signed token instead: the
// attempts route mints it when it draws, the browser hands it back, and the
// respond / finalize routes accept an item id only if it is inside it. Without
// this a caller could name any active id of the subject as a "blank" — a
// costless skip (decision 18) — and read its answer key at review, walking
// the bank fifteen ids per sitting. A LIVE paper needs no token: its set is
// fp_assessment_items.
//
// Token = base64url(JSON {a: attemptId, i: sorted item ids}) + '.' +
//         HMAC-SHA256(payload, secret). Opaque to the browser; verified with
//         a constant-time compare; never carries an answer.
//
// Secret: the same convention as lib/auth/preview-session.ts —
// SUPABASE_JWT_SECRET, else JWT_SECRET (present in production) — with the
// service-role key as the last resort so a dev box with neither still signs
// (it never leaves the server either way).

function servedSecret(): string {
  const s =
    process.env.SUPABASE_JWT_SECRET ||
    process.env.JWT_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) {
    throw new Error(
      'OneMark served-set signing secret missing — set SUPABASE_JWT_SECRET or JWT_SECRET in env',
    );
  }
  return s;
}

function hmacHex(payload: string): string {
  return createHmac('sha256', servedSecret()).update(payload).digest('hex');
}

/** Mint the token binding `itemIds` to `attemptId`. */
export function signServedSet(attemptId: string, itemIds: string[]): string {
  const ids = [...new Set(itemIds)].sort();
  const payload = Buffer.from(JSON.stringify({ a: attemptId, i: ids }), 'utf8').toString(
    'base64url',
  );
  return `${payload}.${hmacHex(payload)}`;
}

/** The served ids for `attemptId`, or null when the token is missing, malformed,
 *  tampered with, or minted for another attempt. */
export function verifyServedSet(attemptId: string, token: unknown): Set<string> | null {
  if (typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  // The hex signature is ASCII, so a signature with any multi-byte character
  // can never match; the guard must compare BYTE lengths, because
  // timingSafeEqual throws (RangeError) on unequal byte lengths and a
  // 64-char multi-byte string has the same STRING length as a real one.
  const sigBuf = Buffer.from(sig, 'utf8');
  const expectedBuf = Buffer.from(hmacHex(payload), 'utf8');
  if (sigBuf.length !== expectedBuf.length) return null;
  try {
    if (!timingSafeEqual(sigBuf, expectedBuf)) return null;
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!parsed || parsed.a !== attemptId || !Array.isArray(parsed.i)) return null;
    const ids = parsed.i.filter((v: unknown): v is string => typeof v === 'string');
    return new Set(ids);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Closing a sitting — shared by the finalize route and the live-paper
// auto-close in the attempts route.
// ---------------------------------------------------------------------------

export const RPC_MISSING = /could not find the function|does not exist/i;
/** Lane S's fn_onemark_finalize_attempt / fn_onemark_record_response refuse a
 *  closed attempt with "attempt … is submitted, not in_progress (single
 *  submission, decision 19)". Older phrasings kept so a reworded RPC still
 *  reads as "already closed" rather than as a failure. */
export const ALREADY_SUBMITTED =
  /not in_progress|already (been )?submitted|already finali[sz]ed/i;

/** The items of a LIVE paper this attempt has no response for yet. The paper
 *  is a fixed list (fp_assessment_items), so the server knows exactly what was
 *  served and never needs the caller to name the blanks. */
export async function liveBlankItemIds(
  adminClient: any,
  attempt: Pick<AttemptRow, 'id' | 'assessment_id'>,
): Promise<string[]> {
  const [{ data: onPaper }, { data: existing }] = await Promise.all([
    adminClient
      .from('fp_assessment_items')
      .select('item_id, position')
      .eq('assessment_id', attempt.assessment_id)
      .order('position', { ascending: true }),
    adminClient.from('fp_responses').select('item_id').eq('attempt_id', attempt.id),
  ]);
  const done = new Set((existing ?? []).map((r: any) => r.item_id));
  return (onPaper ?? [])
    .map((r: any) => r.item_id as string)
    .filter((id: string) => typeof id === 'string' && !done.has(id));
}

export interface CloseOutcome {
  /** null = closed now, or was already closed (see alreadySubmitted). */
  error: { status: 503 | 400; message: string } | null;
  alreadySubmitted: boolean;
}

function closeError(message: string, verb: 'Submitting' | 'Answering'): CloseOutcome['error'] {
  return RPC_MISSING.test(message)
    ? {
        status: 503,
        message: `${verb} is not switched on yet. Please tell whoever runs the programme at your school.`,
      }
    : { status: 400, message: 'The sitting could not be closed. Please try again.' };
}

/** Record the blanks as SKIPS (decision 18: not wrong, never in the vault),
 *  then submit through Lane S's RPC. Both calls go through the SESSION client
 *  so the RPCs' own write gate runs as the caller. A second submission is
 *  reported, not failed (decision 19). */
export async function closeSitting(
  sessionClient: any,
  attemptId: string,
  blankItemIds: string[],
): Promise<CloseOutcome> {
  for (const itemId of blankItemIds) {
    const { error: skipError } = await sessionClient.rpc('fn_onemark_record_response', {
      p_attempt_id: attemptId,
      p_item_id: itemId,
      p_chosen: null,
      p_skipped: true,
      p_time_ms: null,
    });
    if (skipError) {
      const msg = skipError.message ?? '';
      if (ALREADY_SUBMITTED.test(msg)) return { error: null, alreadySubmitted: true };
      return { error: closeError(msg, 'Submitting'), alreadySubmitted: false };
    }
  }
  const { error: finalError } = await sessionClient.rpc('fn_onemark_finalize_attempt', {
    p_attempt_id: attemptId,
  });
  if (finalError) {
    const msg = finalError.message ?? '';
    if (ALREADY_SUBMITTED.test(msg)) return { error: null, alreadySubmitted: true };
    return { error: closeError(msg, 'Submitting'), alreadySubmitted: false };
  }
  return { error: null, alreadySubmitted: false };
}
