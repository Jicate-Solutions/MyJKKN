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
// checks read, and a `prompt` string that satisfies the schema gate.
//
// THE PROMPT WE SEND IS THROWN AWAY, AND THAT IS THE POINT. The route reads
// the body's `prompt` ONLY to pass its own required-keys check (route.ts:110-122)
// and then rebuilds the payload from scratch — draft-contract.ts:99
// `buildDraftPayload` returns `{ _ctx: ctx, prompt: JSON.stringify(ctx) }`, so
// OUR sentence never reaches ai_jobs.payload and is persisted nowhere. Do not
// justify it as something an operator reads; it exists to unlock the gate.
// The live risk stays recorded: if anyone later makes the route honour the
// caller's prompt, this sentence silently becomes the drafting instruction.
//
// THREE ANSWERS THE PANEL MUST NOT MISREAD:
//   - fn_ai_enqueue refuses a spent daily cap with {ok:false, error:'daily
//     limit reached', cap, used}. The route has no branch for that string, so
//     it arrives as a 502 — a cap, wearing a server fault's clothes.
//   - 503 "contract pending" means nothing was queued and nothing was spent.
//   - 429 is the in-flight ceiling (max_inflight = 3), not a cap.
//
// COST. Ruling #12 of 2026-09-06 — `specs/onemark-wave3-2026-09-06.md`,
// section "## Rulings of 2026-09-06", row 12, published to main by PR #3343:
// "Monthly AI drafting cap reached -> Route 'draft now' to the ₹0 Max lane
// (enqueue for the scheduled collect pass; tell the Senior Learner 'queued,
// runs within 30 minutes at no cost') rather than blocking." The job type
// already sits on lane 'max', so this door satisfies the ruling with no route
// change. The MECHANISM behind it is stated on main at draft-collect.ts:33-36:
// monthly_spend_cap_inr is enforced on the PAID path by resolveChatModel; the
// ₹0 lane spends nothing.
//
// THE ONE HEDGE THE RULING DOES NOT COVER: the same queued job can later be
// accelerated by an operator through the paid inline path
// (`/api/cron/onemark-item-drafts?mode=generate_now`, which runs it "through
// the estate's paid chat client"). So the honest sentence is "queued at no
// cost on the free lane" — a claim about how it is QUEUED, not a promise about
// the request's whole life.
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
  /** A read of the contract row or of today's own requests FAILED. Distinct
   *  from `live:false`, which is a fact about the estate. When this is true the
   *  panel knows nothing: it must not claim a full allowance (which would let a
   *  spent day be discovered by a refusal — the exact thing Lane G item 3
   *  forbids) and it must not claim the feature is switched off. Blocked, and
   *  says why. */
  readFailed: boolean;
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
  /** What a person reads. Plain words only. */
  message: string;
  jobId: string | null;
  /** The route's own words, when they differ from `message`. For the console
   *  and for a bug report — never rendered. */
  detail?: string | null;
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
  | 'signed out'
  | 'not found'
  | 'unreadable'
  | 'unknown';

/** Sentinel statuses readJob() puts in place of an HTTP failure, so the poll
 *  can tell "the job is still working" apart from "we cannot read the job".
 *  /api/ai-jobs/status answers 401 when the session dies and 404 when
 *  fn_ai_job_status returns not_found; both used to become "Still checking"
 *  and a 10-second loop with no exit. */
export const JOB_SIGNED_OUT = 'client:signed_out';
export const JOB_NOT_FOUND = 'client:not_found';

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

/** The sentence that rides in `prompt`. It exists for ONE reason: the route's
 *  required-keys check (route.ts:110-122) rejects a body without it. The route
 *  then discards it and rebuilds the payload with buildDraftPayload, so this
 *  text is persisted nowhere and no operator ever reads it. It is written as a
 *  plain human summary rather than as model instructions precisely because it
 *  must never be mistaken for the drafting brief. */
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

/** Lane G item 1: "Plain words, not job-queue words." The route's 400 bodies
 *  are internal contract text — "Missing: prompt" names a field the person
 *  never filled in and cannot see, "bloom_level must be one of K1, K2, …"
 *  names a column. validateRequest stops most of these before the click; this
 *  maps the ones that can still get through. The raw string is kept on the
 *  outcome's `detail` for the console, never on the screen. */
export function plainInvalidReason(err: string): string {
  const e = err.toLowerCase();
  if (/missing:/.test(e)) {
    return 'Something the drafting service needs was not sent. Reload the page and try once more.';
  }
  if (/exam_definition_id|must be a uuid/.test(e)) {
    return 'That subject could not be recognised. Pick it again from the list.';
  }
  if (/topic_id/.test(e)) {
    return 'That unit does not belong to the chosen subject. Pick the unit again.';
  }
  if (/bloom_level/.test(e)) {
    return 'Choose a JABT level between K1 and K6.';
  }
  if (/tag/.test(e)) {
    return 'One of the chosen category tags does not belong to this subject. Pick the tags again.';
  }
  if (/count/.test(e)) {
    return `Ask for between ${DRAFT_MIN_COUNT} and ${DRAFT_MAX_COUNT} questions.`;
  }
  return 'The request was refused. Check the choices above and try again.';
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
      // Ruling #12's own words ("queued, runs within 30 minutes at no cost"),
      // hedged to the lane: an operator accelerating this job through the paid
      // inline path would spend, so we promise how it was QUEUED, not its life.
      message:
        'Queued at no cost on the free lane. It usually runs within 30 minutes; drafts appear in the queue below after the next collect pass.',
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
    return {
      ok: false,
      kind: 'invalid',
      message: plainInvalidReason(err),
      jobId: null,
      detail: err || null,
    };
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
  /** True when a read threw, or when today's row fetch saturated its limit so
   *  the used count cannot be trusted. */
  readFailed = false,
): DraftCaps {
  const resetsAt = istNextMidnight(now).toISOString();
  if (readFailed) {
    return {
      live: false,
      dailyCap: null,
      usedToday,
      remainingToday: null,
      blocked: true,
      resetsAt,
      freeLane: false,
      monthlyCapInr: null,
      readFailed: true,
    };
  }
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
      readFailed: false,
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
    // lane 'max' is the ₹0 seat lane. The monthly figure on the row governs the
    // paid inline operator path, not the queueing this door does — ruling #12,
    // specs/onemark-wave3-2026-09-06.md "## Rulings of 2026-09-06" row 12.
    freeLane: row.lane === 'max',
    monthlyCapInr:
      typeof row.monthly_spend_cap_inr === 'number' ? row.monthly_spend_cap_inr : null,
    readFailed: false,
  };
}

export function describeRemaining(caps: DraftCaps): string | null {
  if (caps.readFailed) return 'Daily count unknown';
  if (!caps.live) return null;
  if (caps.dailyCap === null || caps.remainingToday === null) return 'No daily limit.';
  if (caps.remainingToday === 0) {
    return 'None left today — the count resets at midnight, India time.';
  }
  return `${caps.remainingToday} of ${caps.dailyCap} left today`;
}

export function describeLane(caps: DraftCaps): string {
  if (caps.readFailed) {
    return 'Could not read the AI settings just now.';
  }
  if (!caps.live) return 'AI drafting is not switched on yet.';
  if (caps.freeLane) {
    // Hedged deliberately: "queued at no cost" is a claim about the lane this
    // request is placed on, not a promise for its whole life — an operator can
    // still accelerate the same job through the paid inline path.
    return 'Runs on the free lane — queued at no cost, whatever the monthly ceiling shows.';
  }
  return 'Runs on a paid lane; the monthly ceiling applies.';
}

/** Lane G item 3 names TWO caps and asks for both to be visible before the
 *  click. This is the second one — the estate-wide monthly ceiling that sits on
 *  the same `ai_job_types` row. Returns null when there is no figure to show. */
export function describeMonthlyCap(caps: DraftCaps): string | null {
  if (caps.readFailed || !caps.live || caps.monthlyCapInr === null) return null;
  const amount = `₹${caps.monthlyCapInr.toLocaleString('en-IN')}`;
  if (caps.freeLane) {
    return `${amount} a month is the estate's AI ceiling. It applies to the paid path, not to requests queued from here.`;
  }
  return `${amount} a month is the estate's AI ceiling, and this lane spends against it.`;
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
  // A dead session and a vanished job are ENDINGS, not waiting. Leaving them
  // non-terminal is what made the panel poll for as long as the tab was open
  // while showing "Still checking" — a state it could never leave.
  if (status === JOB_SIGNED_OUT) {
    return {
      ...base,
      phase: 'signed out',
      terminal: true,
      headline: 'Your session has ended',
      detail:
        'Sign in again to see how this request finished. The request itself is unaffected — it stays queued and will still be filed.',
    };
  }
  if (status === JOB_NOT_FOUND) {
    return {
      ...base,
      phase: 'not found',
      terminal: true,
      headline: 'This request could not be found',
      detail:
        'It may have been cleared from the queue. Nothing was added below by it; ask again if you still need the questions.',
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

/** What the panel shows once the status read has failed its retries — a 500,
 *  a proxy blip, anything that is not a 401 or a 404. Terminal by construction:
 *  the poll has given up, so the screen must say so rather than spin. */
export function unreadableJobView(): JobView {
  return {
    phase: 'unreadable',
    terminal: true,
    inserted: null,
    rejected: [],
    shortfallReason: null,
    headline: 'Could not read this request',
    detail:
      'The request was queued and is unaffected — only this progress check failed. Reload the page to look again; drafts still arrive in the queue below after the collect pass.',
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
