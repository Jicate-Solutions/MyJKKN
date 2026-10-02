// lib/services/meetings/fireflies-client.ts
//
// The Fireflies GraphQL API, and NOTHING ELSE.
//
// ── WHY THIS FILE EXISTS IN THIS SHAPE ──────────────────────────────────────
// Meeting notes could have been read out of a mailbox — Fireflies emails a
// recap after every call, and a Gmail or Microsoft Graph scope would have
// picked those up with less code. That was rejected on purpose (Director's
// decision, 2026-09-14): a mail scope wide enough to find the recaps is a mail
// scope wide enough to read everything else in the inbox, and MyJKKN is not
// going to hold that. This client talks to Fireflies' own API with a key that
// can read transcripts and can do nothing else.
//
// If you are about to add `gmail`, `mail.read`, `Mail.Read`, an IMAP client or
// a Graph scope to make something here work: stop. That is not a smaller
// version of this decision, it is the thing the decision refused.
//
// ── CONFIGURATION ───────────────────────────────────────────────────────────
//   FIREFLIES_API_KEY   a Fireflies API key (Fireflies → Settings → Developer)
//
// It is deliberately absent everywhere today, and an absent key is a normal
// state, not a fault: every entry point returns
// { ok: false, reason: 'not_connected' } with a sentence a human can act on.
// It does NOT throw (a cron that throws pages somebody at 3am over a feature
// nobody has switched on yet) and it does NOT return an empty list (which reads
// as "there were no meetings" and is a lie).
//
// `.env.example` is NOT updated, because this repository has no such file and
// `.gitignore` line 55 (`.env*`) means one could not be committed if it did.
// The variable is documented here, in the PR, and in the ingest route.

const FIREFLIES_GRAPHQL_ENDPOINT = 'https://api.fireflies.ai/graphql';

/** How long we will wait on Fireflies before giving up on one request. */
const REQUEST_TIMEOUT_MS = 20_000;

/** One transcript as this codebase cares about it. */
export interface FirefliesTranscript {
  /** Fireflies' own id. The idempotency key — meeting_notes.provider_ref. */
  id: string;
  title: string | null;
  /** The calendar event id, when Fireflies recorded one. THE match key. */
  calendarId: string | null;
  transcriptUrl: string | null;
  recordingUrl: string | null;
  summary: string | null;
  /** Fireflies' one-paragraph version of the same meeting. */
  shortSummary: string | null;
  /**
   * The follow-ups Fireflies extracted, as it returns them: a markdown-ish
   * block with a bold speaker name and that speaker's actions beneath it.
   * Parsed by the caller, not here — this module's job is to fetch faithfully.
   */
  actionItemsRaw: string | null;
  /** ISO 8601, or null when the payload carried no usable date. */
  occurredAt: string | null;
  durationMinutes: number | null;
  participants: Array<{ email: string; displayName: string | null }>;
  /** The payload as received, stored verbatim in meeting_notes.raw. */
  raw: unknown;
}

export type FirefliesFailureReason =
  /** No FIREFLIES_API_KEY. Not an error — nobody has connected it yet. */
  | 'not_connected'
  /** Fireflies answered, and said no. */
  | 'rejected'
  /** Network, timeout, or Fireflies did not answer. */
  | 'unreachable'
  /** Fireflies answered with something this client cannot read. */
  | 'unreadable';

/**
 * The arms carry each other's fields as `?: undefined` on purpose.
 *
 * Without them TypeScript does not narrow this union through a `!result.ok`
 * guard, and every `result.reason` / `result.message` on the failure path is a
 * TS2339 — which is exactly what the PR-scoped TypeCheck gate reported (five
 * errors across the ingest route and the unmatched screen).
 *
 * Worth knowing WHY that was not caught earlier: `next.config.ts` sets
 * `typescript.ignoreBuildErrors: true`, so the production build compiled this
 * file happily. The type gate exists precisely because of that mask — a green
 * build is not evidence the types are sound in this repo.
 */
export type FirefliesResult<T> =
  | { ok: true; data: T; reason?: undefined; message?: undefined; scope?: undefined; errorCode?: undefined }
  | {
      ok: false;
      data?: undefined;
      reason: FirefliesFailureReason;
      message: string;
      /**
       * Set by fetchFirefliesTranscriptSentences only (absent elsewhere):
       *   'transcript' — the failure is about THIS one transcript: Fireflies
       *                  said it does not exist or this key may not read it
       *                  (see FIREFLIES_PER_TRANSCRIPT_CODES), or it came back
       *                  without a readable sentence list.
       *   'account'    — the key or the account cannot be used right now, so
       *                  the next request would fail the same way: no key,
       *                  HTTP 401 / 429, or a GraphQL code in
       *                  FIREFLIES_ACCOUNT_STOP_CODES (auth, rate limit, an
       *                  inactive or unpaid account).
       *   'request'    — THIS request failed and it proves nothing about the
       *                  transcript or the account: a network error, the 20 s
       *                  timeout, a 5xx or other non-2xx answer, a body that
       *                  is not JSON or has no data object, and any other or
       *                  unknown GraphQL code (request_timeout,
       *                  invariant_violation, a validation error, no code).
       * A caller must treat an absent scope as 'account'.
       */
      scope?: 'transcript' | 'account' | 'request';
      /** Fireflies' own code from the first GraphQL `errors` entry
       *  (extensions.code, else code), when it answered with one. */
      errorCode?: string | null;
    };

/** True when a key is present. Cheap; safe to call from a route guard. */
export function isFirefliesConfigured(): boolean {
  return Boolean((process.env.FIREFLIES_API_KEY ?? '').trim());
}

/**
 * The one field set this client asks for.
 *
 * UNVERIFIED AGAINST THE LIVE API. Nobody has connected a key yet, so these
 * field names come from Fireflies' published schema and have not been exercised
 * against a real response. They are read leniently below — a field Fireflies
 * does not return lands as null rather than throwing — and a schema rejection
 * comes back as `reason: 'rejected'` with Fireflies' own message, which is the
 * signal to correct this string. Verify on first connection before trusting any
 * ingested row.
 */
const TRANSCRIPTS_QUERY = `
  query MyJkknTranscripts($limit: Int, $skip: Int) {
    transcripts(limit: $limit, skip: $skip) {
      id
      title
      calendar_id
      transcript_url
      audio_url
      video_url
      duration
      dateString
      summary { overview short_summary action_items }
      meeting_attendees { email displayName }
    }
  }
`;

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * Fireflies reports duration in minutes (a float). Anything unreadable becomes
 * null rather than 0 — "we do not know how long it ran" and "it ran for no time
 * at all" are different facts and the column must not conflate them.
 */
function asDurationMinutes(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

function asIsoDate(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normaliseTranscript(node: Record<string, unknown>): FirefliesTranscript | null {
  const id = asString(node.id);
  // No id, no idempotency key. Such a row would be re-inserted on every run, so
  // it is dropped rather than stored under a made-up reference.
  if (!id) return null;

  const attendees = Array.isArray(node.meeting_attendees) ? node.meeting_attendees : [];
  const participants: FirefliesTranscript['participants'] = [];
  const seen = new Set<string>();

  for (const entry of attendees) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const email = asString(row.email)?.toLowerCase();
    // The column CHECKs `email = lower(email)` and rejects blanks, so an
    // attendee with no address is dropped here rather than failing the insert.
    if (!email || seen.has(email)) continue;
    seen.add(email);
    participants.push({ email, displayName: asString(row.displayName) });
  }

  const summaryNode =
    node.summary && typeof node.summary === 'object'
      ? (node.summary as Record<string, unknown>)
      : null;
  const summary = summaryNode ? asString(summaryNode.overview) : null;
  const shortSummary = summaryNode ? asString(summaryNode.short_summary) : null;
  // `action_items` arrives as one string, not a list. Fireflies returns an
  // empty string for a meeting with no follow-ups, which asString turns into
  // null — the right reading: "none" and "we never asked" must not look alike.
  const actionItemsRaw = summaryNode ? asString(summaryNode.action_items) : null;

  return {
    id,
    title: asString(node.title),
    calendarId: asString(node.calendar_id),
    transcriptUrl: asString(node.transcript_url),
    // Fireflies exposes both; either is "the recording" for our purposes.
    recordingUrl: asString(node.video_url) ?? asString(node.audio_url),
    summary,
    shortSummary,
    actionItemsRaw,
    occurredAt: asIsoDate(node.dateString),
    durationMinutes: asDurationMinutes(node.duration),
    participants,
    raw: node,
  };
}

/**
 * Pull the most recent transcripts the key can see.
 *
 * Returns a RESULT, never a thrown error, for every outcome a caller can
 * sensibly act on — including the un-configured one.
 */
export async function fetchRecentFirefliesTranscripts(options?: {
  limit?: number;
  skip?: number;
}): Promise<FirefliesResult<FirefliesTranscript[]>> {
  const apiKey = (process.env.FIREFLIES_API_KEY ?? '').trim();

  if (!apiKey) {
    return {
      ok: false,
      reason: 'not_connected',
      message:
        'Fireflies is not connected yet. Add a FIREFLIES_API_KEY (Fireflies → Settings → Developer) and meeting notes will start arriving.',
    };
  }

  // Clamped: a caller asking for 10,000 gets 50, and the ceiling lives here
  // rather than in every caller.
  const limit = Math.min(Math.max(options?.limit ?? 25, 1), 50);
  const skip = Math.max(options?.skip ?? 0, 0);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(FIREFLIES_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: TRANSCRIPTS_QUERY,
        variables: { limit, skip },
      }),
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return {
      ok: false,
      reason: 'unreachable',
      message: aborted
        ? `Fireflies did not answer within ${REQUEST_TIMEOUT_MS / 1000}s.`
        : `Could not reach Fireflies: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    // 401/403 is the common one and means the key is wrong or revoked — say so
    // rather than reporting a generic failure the operator cannot act on.
    const hint =
      response.status === 401 || response.status === 403
        ? ' The FIREFLIES_API_KEY was refused — check it has not been revoked.'
        : '';
    return {
      ok: false,
      reason: 'rejected',
      message: `Fireflies answered ${response.status}.${hint}`,
    };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, reason: 'unreadable', message: 'Fireflies returned a body that is not JSON.' };
  }

  if (!payload || typeof payload !== 'object') {
    return { ok: false, reason: 'unreadable', message: 'Fireflies returned an empty body.' };
  }

  const body = payload as { data?: unknown; errors?: unknown };

  // GraphQL reports failure inside a 200. A response carrying errors is a
  // failure even when `data` holds a partial list — storing half a sync as
  // though it were the whole one is how a note silently goes missing.
  if (Array.isArray(body.errors) && body.errors.length > 0) {
    const first = body.errors[0] as { message?: unknown };
    return {
      ok: false,
      reason: 'rejected',
      message: asString(first?.message) ?? 'Fireflies rejected the query.',
    };
  }

  const data = body.data as { transcripts?: unknown } | undefined;
  if (!data || !Array.isArray(data.transcripts)) {
    return {
      ok: false,
      reason: 'unreadable',
      message: 'Fireflies returned no transcripts field — the query may no longer match their schema.',
    };
  }

  const transcripts: FirefliesTranscript[] = [];
  for (const node of data.transcripts) {
    if (!node || typeof node !== 'object') continue;
    const normalised = normaliseTranscript(node as Record<string, unknown>);
    if (normalised) transcripts.push(normalised);
  }

  return { ok: true, data: transcripts };
}

/** One spoken line of a transcript, as the note-drafter reads it. */
export interface FirefliesSentence {
  speakerName: string | null;
  text: string;
}

/**
 * Fireflies error codes that are about ONE transcript rather than the account:
 * the transcript is gone (object_not_found) or this key may not read it
 * (forbidden, not_in_team). The codes, and where they sit in a response (both
 * errors[].code and errors[].extensions.code), are from Fireflies' published
 * error list (docs.fireflies.ai/miscellaneous/error-codes, read 2026-09-29).
 *
 * A per-transcript code is FINAL for that note. The codes that are about the
 * key or the account are FIREFLIES_ACCOUNT_STOP_CODES below; every OTHER code
 * — request_timeout, invariant_violation, invalid_arguments, a GraphQL
 * validation error, a code that is not in the published list — and an error
 * entry with no code at all is about this one request only (scope 'request').
 */
export const FIREFLIES_PER_TRANSCRIPT_CODES = ['object_not_found', 'forbidden', 'not_in_team'] as const;
export type FirefliesPerTranscriptCode = (typeof FIREFLIES_PER_TRANSCRIPT_CODES)[number];

export function isFirefliesPerTranscriptCode(code: unknown): code is FirefliesPerTranscriptCode {
  return typeof code === 'string' && (FIREFLIES_PER_TRANSCRIPT_CODES as readonly string[]).includes(code);
}

/**
 * Fireflies error codes about the KEY or the ACCOUNT, so the next request
 * would fail the same way and a run should stop: auth_failed (the key),
 * too_many_requests (the rate limit), account_cancelled ("your account is
 * inactive") and paid_required (the plan). The last two are from the same
 * published list (docs.fireflies.ai/miscellaneous/error-codes, read
 * 2026-09-29); neither can be about one transcript.
 */
export const FIREFLIES_ACCOUNT_STOP_CODES = [
  'auth_failed',
  'too_many_requests',
  'account_cancelled',
  'paid_required',
] as const;

export function isFirefliesAccountStopCode(code: unknown): boolean {
  return typeof code === 'string' && (FIREFLIES_ACCOUNT_STOP_CODES as readonly string[]).includes(code);
}

/** errors[].extensions.code, else errors[].code; null when neither is a string. */
function graphqlErrorCode(entry: unknown): string | null {
  if (!entry || typeof entry !== 'object') return null;
  const e = entry as { code?: unknown; extensions?: { code?: unknown } | null };
  return asString(e.extensions?.code) ?? asString(e.code);
}

/**
 * The spoken lines of ONE transcript — the input the AI note-drafter needs
 * when Fireflies returned no summary (app/api/cron/meeting-note-drafts).
 *
 * A SEPARATE query on purpose. TRANSCRIPTS_QUERY above is untouched: a field
 * Fireflies rejects there fails the whole ingest, while a field rejected here
 * only makes the drafter skip each note for that run (a validation error is
 * neither a per-transcript nor an account code, so it is request-scoped) and
 * never touches the ingest.
 *
 * `transcript(id:)`, `sentences`, `speaker_name` and `text` match Fireflies'
 * published schema (docs.fireflies.ai, the transcript query); no live call has
 * been made. A rejection comes back as `reason: 'rejected'` with Fireflies'
 * own message and code — that is the signal to fix this string.
 */
const TRANSCRIPT_SENTENCES_QUERY = `
  query MyJkknTranscriptSentences($id: String!) {
    transcript(id: $id) {
      sentences { speaker_name text }
    }
  }
`;

export async function fetchFirefliesTranscriptSentences(
  id: string,
): Promise<FirefliesResult<FirefliesSentence[]>> {
  const apiKey = (process.env.FIREFLIES_API_KEY ?? '').trim();
  if (!apiKey) {
    return {
      ok: false,
      reason: 'not_connected',
      scope: 'account',
      message: 'Fireflies is not connected yet. Add a FIREFLIES_API_KEY to read transcripts.',
    };
  }
  const transcriptId = asString(id);
  if (!transcriptId) {
    return { ok: false, reason: 'unreadable', scope: 'transcript', message: 'No Fireflies transcript id was given.' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(FIREFLIES_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: TRANSCRIPT_SENTENCES_QUERY, variables: { id: transcriptId } }),
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    // This request only: a very long meeting can time out on its own while
    // every other transcript answers, so it must not stop the run.
    return {
      ok: false,
      reason: 'unreachable',
      scope: 'request',
      message: aborted
        ? `Fireflies did not answer within ${REQUEST_TIMEOUT_MS / 1000}s.`
        : `Could not reach Fireflies: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    clearTimeout(timer);
  }

  // The key (401) and the rate limit (429) are about the whole account,
  // whatever the body says.
  if (response.status === 401 || response.status === 429) {
    return { ok: false, reason: 'rejected', scope: 'account', message: `Fireflies answered ${response.status}.` };
  }

  // The body is read BEFORE judging the HTTP status: Fireflies' published
  // error list gives object_not_found as 404 and forbidden / not_in_team as
  // 403, so a per-transcript code may arrive on a non-2xx response.
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    // A gateway or maintenance page, not a GraphQL answer — this request only.
    return {
      ok: false,
      reason: response.ok ? 'unreadable' : 'rejected',
      scope: 'request',
      message: response.ok
        ? 'Fireflies returned a body that is not JSON.'
        : `Fireflies answered ${response.status} with a body that is not JSON.`,
    };
  }

  const body = (payload && typeof payload === 'object' ? payload : {}) as { data?: unknown; errors?: unknown };
  if (Array.isArray(body.errors) && body.errors.length > 0) {
    const codes = body.errors.map(graphqlErrorCode);
    // Account-wide when ANY entry carries an account code (auth, rate limit,
    // inactive or unpaid account). Otherwise per-transcript ONLY when every
    // entry carries a per-transcript code. Anything else — another code, an
    // unknown code, no code — is about this one request.
    const account = codes.some((c) => isFirefliesAccountStopCode(c));
    const perTranscript = !account && codes.every((c) => isFirefliesPerTranscriptCode(c));
    const first = body.errors[0] as { message?: unknown };
    const stopCode = codes.find((c) => isFirefliesAccountStopCode(c));
    return {
      ok: false,
      reason: 'rejected',
      scope: account ? 'account' : perTranscript ? 'transcript' : 'request',
      errorCode: stopCode ?? codes[0],
      message: asString(first?.message) ?? 'Fireflies rejected the sentences query.',
    };
  }

  if (!response.ok) {
    // A 5xx (or any other non-2xx that is not 401 / 429) with no GraphQL
    // code: this request only.
    return { ok: false, reason: 'rejected', scope: 'request', message: `Fireflies answered ${response.status}.` };
  }

  if (!body.data || typeof body.data !== 'object') {
    // JSON, but not a GraphQL answer (no `data` object) — this request only.
    return {
      ok: false,
      reason: 'unreadable',
      scope: 'request',
      message: 'Fireflies answered without a data object.',
    };
  }

  const transcript = (body.data as { transcript?: unknown }).transcript as
    | { sentences?: unknown }
    | null
    | undefined;
  if (!transcript || !Array.isArray(transcript.sentences)) {
    // A real answer about THIS transcript that holds no sentence list: the
    // note is retried later, and the rest of the batch still gets its turn.
    return {
      ok: false,
      reason: 'unreadable',
      scope: 'transcript',
      message: 'Fireflies returned no sentences for this transcript.',
    };
  }

  const sentences: FirefliesSentence[] = [];
  for (const entry of transcript.sentences) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const text = asString(row.text);
    if (!text) continue;
    sentences.push({ speakerName: asString(row.speaker_name), text });
  }
  // `{ ok: true, data: [] }` means ONE thing only: the transcript came back
  // and its sentence list is EMPTY — the drafter stamps that note for good.
  // Lines that are there but none of them readable is not that fact (a field
  // returning null reads the same way), so it is reported as unreadable and
  // the caller retries rather than giving the note up.
  if (sentences.length === 0 && transcript.sentences.length > 0) {
    return {
      ok: false,
      reason: 'unreadable',
      scope: 'transcript',
      message: 'Fireflies returned sentences for this transcript, but none of them had readable text.',
    };
  }
  return { ok: true, data: sentences };
}
