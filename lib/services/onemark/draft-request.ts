// lib/services/onemark/draft-request.ts
// ============================================================================
// OneMark — the CLIENT half of the AI drafting door (Wave 3, Lane G).
//
// Director ruling 2026-09-06 10:0x IST: "Where is the AI button on the UI for
// senior learners" — there was none. POST /api/foundation/onemark/draft was
// deployed with no caller anywhere in the app. This module is the caller's
// brain: pure functions, no React, no Supabase, an injected fetch, so every
// sentence the panel shows can be pinned by a test.
//
// WHAT THE ROUTE ACTUALLY WANTS (read live on production 2026-09-07, not from
// spec text). ai_job_types.onemark.item_draft carries
//   input_schema = [{ key: 'prompt', type: 'textarea', required: true }]
// since migration 20260918150000, and the route validates the REQUEST BODY
// against those required keys before it looks at anything else. So a body
// that carries only the six domain fields answers 400 "Missing: prompt".
// buildRequestBody therefore sends BOTH: the six fields the route's own shape
// checks read, and a `prompt` string that satisfies the schema gate. The route
// discards our prompt and composes its own through buildDraftPayload — ours
// exists to get past the gate, and reads as a plain sentence so an operator
// looking at ai_jobs.payload can tell what was asked for.
//
// THREE ANSWERS THE PANEL MUST NOT MISREAD:
//   - fn_ai_enqueue refuses a spent daily cap with {ok:false, error:'daily
//     limit reached', cap, used}. The route has no branch for that string, so
//     it arrives as a 502 — a cap, wearing a server fault's clothes.
//   - 503 "contract pending" means nothing was queued and nothing was spent.
//   - 429 is the in-flight ceiling (max_inflight = 3), not a cap.
//
// COST (ruling #12). The job type sits on lane 'max' — the ₹0 seat lane. The
// ₹5,000/month figure on the row governs the PAID inline operator path
// (?mode=generate_now), never this door: a request from this panel is queued
// on the free lane whatever the month's spend looks like, which is exactly
// what ruling #12 asks for. The route needs no change; the panel says so.
//
// DECISION 7 is absolute here: nothing in this lane writes is_active. A
// drafting request is not an approval.
// ============================================================================

export const DRAFT_MAX_COUNT = 20;
export const DRAFT_MIN_COUNT = 1;
export const DRAFT_ROUTE = '/api/foundation/onemark/draft';
export const DRAFT_STATUS_ROUTE = '/api/ai-jobs/status';
/** vercel.json: "9,39 * * * *" on /api/cron/onemark-item-drafts. */
export const COLLECT_MINUTES = [9, 39] as const;

export const BLOOM_LEVELS = ['K1', 'K2', 'K3', 'K4', 'K5', 'K6'] as const;
export type BloomLevel = (typeof BLOOM_LEVELS)[number];

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export interface DraftRequestInput {
  exam_definition_id: string;
  /** Human label, for the prompt sentence only. */
  exam_label: string;
  topic_id: string | null;
  topic_label: string | null;
  tag_keys: string[];
  count: number;
  bloom_level: BloomLevel | null;
}

/** The columns of ai_job_types an authenticated reader may see (the table's
 *  RLS shows enabled rows to `authenticated`). */
export interface DraftJobTypeRow {
  job_type: string;
  title: string | null;
  lane: string | null;
  enabled: boolean;
  daily_cap_per_user: number | null;
  monthly_spend_cap_inr: number | null;
}

export interface DraftCaps {
  live: boolean;
  dailyCap: number | null;
  usedToday: number;
  remainingToday: number | null;
  blocked: boolean;
  resetsAt: string;
  freeLane: boolean;
  monthlyCapInr: number | null;
}

export type RequestOutcomeKind =
  | 'queued'
  | 'cap_reached'
  | 'already_running'
  | 'contract_pending'
  | 'forbidden'
  | 'signed_out'
  | 'invalid'
  | 'failed';

export interface RequestOutcome {
  ok: boolean;
  kind: RequestOutcomeKind;
  message: string;
  jobId: string | null;
}

export interface FiledRejection {
  index: number | null;
  why: string;
  stem_preview: string | null;
}

export interface FiledRecord {
  inserted: number;
  itemIds: string[];
  rejected: FiledRejection[];
  shortfallReason: string | null;
  error: string | null;
  filedAt: string | null;
}

export type JobPhase =
  | 'waiting'
  | 'running'
  | 'drafted'
  | 'filed'
  | 'errored'
  | 'canceled'
  | 'unknown';

export interface JobView {
  phase: JobPhase;
  terminal: boolean;
  headline: string;
  detail: string;
  inserted: number | null;
  rejected: FiledRejection[];
  shortfallReason: string | null;
}

export interface OwnJobRow {
  id: string;
  status: string;
  requested_at: string;
  completed_at?: string | null;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

// ---------------------------------------------------------------------------
// The request body
// ---------------------------------------------------------------------------

/** The sentence that rides in `prompt`. The route ignores it; the schema gate
 *  does not, and an operator reading ai_jobs.payload deserves a readable line. */
function promptSentence(input: DraftRequestInput): string {
  const where = input.topic_label
    ? `the unit "${input.topic_label}"`
    : 'no single unit — draw on the whole subject';
  const level = input.bloom_level ?? 'K1';
  return [
    `Draft ${input.count} OneMark MCQs for ${input.exam_label}.`,
    `Scope: ${where}.`,
    `Category tags: ${input.tag_keys.join(', ')}.`,
    `JABT level: ${level}.`,
    'Every drafted question arrives unapproved and switched off until a subject Senior Learner ticks it.',
  ].join(' ');
}

export function buildRequestBody(input: DraftRequestInput): Record<string, unknown> {
  return {
    exam_definition_id: input.exam_definition_id,
    topic_id: input.topic_id ?? null,
    tag_keys: [...new Set(input.tag_keys)],
    count: input.count,
    bloom_level: input.bloom_level,
    // Required by the live input_schema — see the header. Without it the route
    // answers 400 "Missing: prompt" before any domain check runs.
    prompt: promptSentence(input),
  };
}

/** What the panel refuses before the click. Returns the first plain-English
 *  reason, or null when the request is sendable. */
export function validateRequest(input: DraftRequestInput): string | null {
  if (!input.exam_definition_id) return 'Choose a subject first.';
  if (!Array.isArray(input.tag_keys) || input.tag_keys.length === 0) {
    return 'Pick at least one category tag.';
  }
  if (
    !Number.isInteger(input.count) ||
    input.count < DRAFT_MIN_COUNT ||
    input.count > DRAFT_MAX_COUNT
  ) {
    return `Ask for between ${DRAFT_MIN_COUNT} and ${DRAFT_MAX_COUNT} questions.`;
  }
  if (!input.bloom_level) return 'Choose a JABT level (K1–K6).';
  return null;
}

// ---------------------------------------------------------------------------
// Reading the route's answer
// ---------------------------------------------------------------------------

function text(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export function mapRequestOutcome(
  status: number,
  body: unknown,
  dailyCap: number | null = null,
): RequestOutcome {
  const b = (body ?? {}) as Record<string, unknown>;
  const err = text(b.error);
  const detail = text(b.detail);

  if (status === 202 && b.ok === true) {
    return {
      ok: true,
      kind: 'queued',
      message:
        'Queued on the free lane, at no cost. It usually runs within 30 minutes; drafts appear in the queue below after the next collect pass.',
      jobId: typeof b.job_id === 'string' ? b.job_id : null,
    };
  }

  // fn_ai_enqueue's daily-cap refusal has no branch in the route, so it lands
  // here as a 502 carrying the raw enqueue text. It is a cap, not a fault.
  if (/daily limit reached/i.test(err)) {
    return {
      ok: false,
      kind: 'cap_reached',
      message: dailyCap
        ? `You have used all ${dailyCap} of today's requests. The count resets at midnight, India time.`
        : "You have used all of today's requests. The count resets at midnight, India time.",
      jobId: null,
    };
  }

  if (status === 401) {
    return {
      ok: false,
      kind: 'signed_out',
      message: 'Your session has ended. Sign in again and retry.',
      jobId: null,
    };
  }
  if (status === 403) {
    return {
      ok: false,
      kind: 'forbidden',
      message:
        'Only a subject Senior Learner who manages the question bank may ask for drafts.',
      jobId: null,
    };
  }
  if (status === 429) {
    return {
      ok: false,
      kind: 'already_running',
      message:
        err || 'A drafting request of yours is still running. Wait for it to finish, then ask again.',
      jobId: null,
    };
  }
  if (status === 503) {
    return {
      ok: false,
      kind: 'contract_pending',
      message:
        detail ||
        'AI drafting is not switched on yet. Nothing was queued and nothing was spent.',
      jobId: null,
    };
  }
  if (status === 400) {
    return { ok: false, kind: 'invalid', message: err || 'The request was refused.', jobId: null };
  }
  return {
    ok: false,
    kind: 'failed',
    message: err || 'The drafting request could not be queued. Nothing was spent.',
    jobId: null,
  };
}

export async function submitDraftRequest(
  input: DraftRequestInput,
  dailyCap: number | null,
  fetchImpl: FetchLike,
): Promise<RequestOutcome> {
  try {
    const response = await fetchImpl(DRAFT_ROUTE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildRequestBody(input)),
    });
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return mapRequestOutcome(response.status, body, dailyCap);
  } catch {
    return {
      ok: false,
      kind: 'failed',
      message: 'The request never left this device — check the connection and try again.',
      jobId: null,
    };
  }
}

// ---------------------------------------------------------------------------
// Caps, computed for display BEFORE the click
// ---------------------------------------------------------------------------

/** Midnight India time, as fn_ai_enqueue counts the day
 *  ((requested_at AT TIME ZONE 'Asia/Kolkata')::date). */
export function istDayStart(now: Date): Date {
  const shifted = now.getTime() + IST_OFFSET_MS;
  return new Date(Math.floor(shifted / DAY_MS) * DAY_MS - IST_OFFSET_MS);
}

export function istNextMidnight(now: Date): Date {
  return new Date(istDayStart(now).getTime() + DAY_MS);
}

export function computeCaps(
  row: DraftJobTypeRow | null,
  usedToday: number,
  now: Date,
): DraftCaps {
  const resetsAt = istNextMidnight(now).toISOString();
  if (!row || !row.enabled) {
    return {
      live: false,
      dailyCap: null,
      usedToday,
      remainingToday: null,
      blocked: true,
      resetsAt,
      freeLane: false,
      monthlyCapInr: null,
    };
  }
  const dailyCap = typeof row.daily_cap_per_user === 'number' ? row.daily_cap_per_user : null;
  const remainingToday = dailyCap === null ? null : Math.max(0, dailyCap - usedToday);
  return {
    live: true,
    dailyCap,
    usedToday,
    remainingToday,
    blocked: remainingToday === 0,
    resetsAt,
    // lane 'max' is the ₹0 seat lane; the monthly figure governs the paid
    // operator path, never this door (ruling #12).
    freeLane: row.lane === 'max',
    monthlyCapInr:
      typeof row.monthly_spend_cap_inr === 'number' ? row.monthly_spend_cap_inr : null,
  };
}

export function describeRemaining(caps: DraftCaps): string | null {
  if (!caps.live) return null;
  if (caps.dailyCap === null || caps.remainingToday === null) return 'No daily limit.';
  if (caps.remainingToday === 0) {
    return 'None left today — the count resets at midnight, India time.';
  }
  return `${caps.remainingToday} of ${caps.dailyCap} left today`;
}

export function describeLane(caps: DraftCaps): string {
  if (!caps.live) return 'AI drafting is not switched on yet.';
  if (caps.freeLane) {
    return 'Runs on the free lane — queued at no cost, whatever the monthly ceiling shows.';
  }
  return 'Runs on a paid lane; the monthly ceiling applies.';
}

// ---------------------------------------------------------------------------
// What the poll says
// ---------------------------------------------------------------------------

function collectSentence(): string {
  return `Drafts appear in the queue below after the collect pass, which runs at ${COLLECT_MINUTES[0]} and ${COLLECT_MINUTES[1]} minutes past every hour — not the moment the model finishes.`;
}

/** The collect pass records {inserted, item_ids, rejected[], shortfall_reason,
 *  error, filed_at} back onto ai_jobs.result.onemark_filed. */
export function readFiled(result: unknown): FiledRecord | null {
  if (!result || typeof result !== 'object') return null;
  const raw = (result as Record<string, unknown>).onemark_filed;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const f = raw as Record<string, unknown>;
  const rejected = Array.isArray(f.rejected)
    ? (f.rejected as unknown[]).map((r) => {
        const o = (r ?? {}) as Record<string, unknown>;
        return {
          index: typeof o.index === 'number' ? o.index : null,
          why: text(o.why) || 'rejected by the draft contract',
          stem_preview: typeof o.stem_preview === 'string' ? o.stem_preview : null,
        };
      })
    : [];
  return {
    inserted: typeof f.inserted === 'number' ? f.inserted : 0,
    itemIds: Array.isArray(f.item_ids) ? (f.item_ids as unknown[]).map(String) : [],
    rejected,
    shortfallReason: typeof f.shortfall_reason === 'string' ? f.shortfall_reason : null,
    error: typeof f.error === 'string' ? f.error : null,
    filedAt: typeof f.filed_at === 'string' ? f.filed_at : null,
  };
}

export function describeJob(
  status: string,
  result: unknown,
  error: string | null,
): JobView {
  const base = {
    inserted: null as number | null,
    rejected: [] as FiledRejection[],
    shortfallReason: null as string | null,
  };

  if (status === 'pending' || status === 'claimed') {
    return {
      ...base,
      phase: 'waiting',
      terminal: false,
      headline: 'Waiting for a free seat',
      detail: collectSentence(),
    };
  }
  if (status === 'running') {
    return {
      ...base,
      phase: 'running',
      terminal: false,
      headline: 'Writing the questions',
      detail: collectSentence(),
    };
  }
  if (status === 'canceled') {
    return {
      ...base,
      phase: 'canceled',
      terminal: true,
      headline: 'Cancelled',
      detail: 'This request was cancelled. Nothing was added to the queue.',
    };
  }
  if (status === 'error') {
    return {
      ...base,
      phase: 'errored',
      terminal: true,
      headline: 'The run did not finish',
      detail: error || 'The lane reported a failure. Nothing was added to the queue.',
    };
  }
  if (status === 'done') {
    const filed = readFiled(result);
    if (!filed) {
      return {
        ...base,
        phase: 'drafted',
        terminal: false,
        headline: 'Written, not yet filed',
        detail: collectSentence(),
      };
    }
    if (filed.error) {
      return {
        phase: 'errored',
        terminal: true,
        headline: 'Nothing could be filed',
        detail: filed.error,
        inserted: filed.inserted,
        rejected: filed.rejected,
        shortfallReason: filed.shortfallReason,
      };
    }
    const headline =
      `${filed.inserted} added to the queue below` +
      (filed.rejected.length ? `, ${filed.rejected.length} rejected` : '');
    return {
      phase: 'filed',
      terminal: true,
      headline,
      detail:
        'Each one arrives switched off and unapproved — a drafting request is not an approval.',
      inserted: filed.inserted,
      rejected: filed.rejected,
      shortfallReason: filed.shortfallReason,
    };
  }
  return {
    ...base,
    phase: 'unknown',
    terminal: false,
    headline: 'Still checking',
    detail: collectSentence(),
  };
}

// ---------------------------------------------------------------------------
// Queue position — honestly, the caller's OWN position
// ---------------------------------------------------------------------------
//
// ai_jobs RLS is `requested_by = auth.uid()`: a person can see their own rows
// and no others. So an estate-wide "you are 7th in line" is not readable from
// the browser and must not be invented. What IS true and useful: how many of
// this person's own unfinished requests sit ahead of this one.

export function isOpen(status: string): boolean {
  return status === 'pending' || status === 'claimed' || status === 'running';
}

export function ownQueuePosition(rows: OwnJobRow[], jobId: string): number | null {
  const open = rows
    .filter((r) => isOpen(r.status))
    .sort((a, b) => a.requested_at.localeCompare(b.requested_at));
  const at = open.findIndex((r) => r.id === jobId);
  return at === -1 ? null : at + 1;
}
