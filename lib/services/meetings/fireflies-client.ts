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

export type FirefliesResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: FirefliesFailureReason; message: string };

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
      summary { overview }
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

  const summaryNode = node.summary;
  const summary =
    summaryNode && typeof summaryNode === 'object'
      ? asString((summaryNode as Record<string, unknown>).overview)
      : null;

  return {
    id,
    title: asString(node.title),
    calendarId: asString(node.calendar_id),
    transcriptUrl: asString(node.transcript_url),
    // Fireflies exposes both; either is "the recording" for our purposes.
    recordingUrl: asString(node.video_url) ?? asString(node.audio_url),
    summary,
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
