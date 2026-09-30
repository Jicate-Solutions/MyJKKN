// lib/grievance/track-conversation.ts
// ============================================================================
// The tracking page's conversation with an anonymous filer (Director rulings
// 5 and 6, 30 Sep 2026): a handler's questions, her nameless answers, and her
// 1-5 star rating once the complaint is resolved.
//
// Every call goes to a token-checked SECURITY DEFINER function from migration
// 20270624093700 (fn_grievance_track_conversation / _answer / _rate), granted
// to signed-in callers only. The page never reads grievance_anonymous_messages
// or grievance_tickets directly: the filer has no row-level access to either,
// by design, because she is not named on the ticket.
//
// Pure helpers over an injected rpc so the rules are testable without a
// database; the client component supplies the browser client.
// ============================================================================

export interface TrackMessage {
  id: string;
  direction: 'question' | 'answer';
  body: string;
  created_at: string;
}

export interface TrackConversation {
  messages: TrackMessage[];
  canAnswer: boolean;
  canRate: boolean;
  rating: number | null;
  feedback: string | null;
}

export type ConversationLoad =
  | { kind: 'ok'; conversation: TrackConversation }
  /** No complaint matches the code (or no session). */
  | { kind: 'none' }
  /** The functions are not in the database yet — say nothing about a failure. */
  | { kind: 'not-ready' }
  | { kind: 'error' };

export type TrackRpc = (
  fn: string,
  args: Record<string, unknown>
) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;

/** PostgREST / Postgres codes for "that function is not there". */
const MISSING_FUNCTION_CODES = new Set(['PGRST202', '42883']);

export const ANSWER_MAX_LENGTH = 2000;
export const RATING_NOTE_MAX_LENGTH = 1000;

/**
 * Reads the conversation. Anything the function returns that is not the
 * expected shape is dropped rather than rendered — in particular, only the four
 * message fields are kept, so an author id can never reach the page even if
 * the function were ever widened.
 */
export async function loadConversation(rpc: TrackRpc, token: string): Promise<ConversationLoad> {
  let res: { data: unknown; error: { message: string; code?: string } | null };
  try {
    res = await rpc('fn_grievance_track_conversation', { p_token: token });
  } catch {
    return { kind: 'error' };
  }
  if (res.error) {
    return MISSING_FUNCTION_CODES.has(res.error.code ?? '') ? { kind: 'not-ready' } : { kind: 'error' };
  }
  if (!res.data || typeof res.data !== 'object') return { kind: 'none' };

  const d = res.data as Record<string, unknown>;
  const messages: TrackMessage[] = (Array.isArray(d.messages) ? d.messages : [])
    .filter((m): m is Record<string, unknown> => Boolean(m) && typeof m === 'object')
    .filter((m) => m.direction === 'question' || m.direction === 'answer')
    .map((m) => ({
      id: String(m.id ?? ''),
      direction: m.direction as 'question' | 'answer',
      body: typeof m.body === 'string' ? m.body : '',
      created_at: typeof m.created_at === 'string' ? m.created_at : '',
    }));

  const rating = typeof d.satisfaction_rating === 'number' ? d.satisfaction_rating : null;
  return {
    kind: 'ok',
    conversation: {
      messages,
      canAnswer: d.can_answer === true,
      canRate: d.can_rate === true,
      rating: rating !== null && rating >= 1 && rating <= 5 ? rating : null,
      feedback: typeof d.satisfaction_feedback === 'string' ? d.satisfaction_feedback : null,
    },
  };
}

// `error?: never` so the union narrows on `ok` even with strictNullChecks off (tsconfig.json).
export type SendResult = { ok: true; error?: never } | { ok: false; error: string };

const GENERIC_SEND_FAILURE = "We couldn't send that just now. Try again in a minute.";

async function send(rpc: TrackRpc, fn: string, args: Record<string, unknown>): Promise<SendResult> {
  try {
    const { data, error } = await rpc(fn, args);
    if (error) return { ok: false, error: GENERIC_SEND_FAILURE };
    const d = (data ?? {}) as Record<string, unknown>;
    if (d.success === true) return { ok: true };
    return { ok: false, error: typeof d.error === 'string' && d.error ? d.error : GENERIC_SEND_FAILURE };
  } catch {
    return { ok: false, error: GENERIC_SEND_FAILURE };
  }
}

/** Checked here first so a person gets the sentence without a round trip. */
export function validateAnswer(body: string): string | null {
  const n = Array.from(body.trim()).length;
  if (n === 0) return 'Please write your answer first.';
  if (n > ANSWER_MAX_LENGTH) return `Please keep your answer to ${ANSWER_MAX_LENGTH} characters or fewer.`;
  return null;
}

export function validateRating(rating: number | null, note: string): string | null {
  if (rating === null || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return 'Please choose from 1 to 5 stars.';
  }
  if (Array.from(note.trim()).length > RATING_NOTE_MAX_LENGTH) {
    return `Please keep the note to ${RATING_NOTE_MAX_LENGTH} characters or fewer.`;
  }
  return null;
}

export async function sendAnswer(rpc: TrackRpc, token: string, body: string): Promise<SendResult> {
  const invalid = validateAnswer(body);
  if (invalid) return { ok: false, error: invalid };
  return send(rpc, 'fn_grievance_track_answer', { p_token: token, p_body: body.trim() });
}

export async function sendRating(
  rpc: TrackRpc,
  token: string,
  rating: number | null,
  note: string
): Promise<SendResult> {
  const invalid = validateRating(rating, note);
  if (invalid) return { ok: false, error: invalid };
  const trimmed = note.trim();
  return send(rpc, 'fn_grievance_track_rate', {
    p_token: token,
    p_rating: rating,
    p_note: trimmed ? trimmed : null,
  });
}
