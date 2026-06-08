// lib/services/admission/ig-dm-service.ts
//
// Thin client-side fetch wrapper around the existing IG DM API routes at
// /api/social/instagram/dm/*. The /admission/inbox/instagram page goes
// through these helpers so the conversation hook and message hook share
// one set of types and one error-shape contract.
//
// Why this file (vs the page calling fetch() directly): the messenger inbox
// shipped its fetch inline because Messenger needed no institution scoping
// (the API resolves it from the session). The IG DM API REQUIRES an
// explicit institution_id query param (see app/api/social/instagram/dm/
// conversations/route.ts), so callers need a tiny helper to avoid mistakes
// in how the param is encoded.

export interface IgDmConversationRow {
  id: string;
  institution_id: string;
  ig_account_id: string;
  ig_user_id: string;
  lead_id: string | null;
  last_inbound_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface IgDmMessageRow {
  id: string;
  conversation_id: string;
  direction: 'in' | 'out';
  text: string | null;
  media: unknown;
  mid: string | null;
  sent_at: string;
  created_at: string;
}

export interface IgDmConversationsResponse {
  conversations: IgDmConversationRow[];
  count: number;
  limit: number;
  offset: number;
}

export interface IgDmMessagesResponse {
  conversation: IgDmConversationRow;
  messages: IgDmMessageRow[];
  count: number;
  limit: number;
  offset: number;
  canReply: boolean;
}

interface ApiOk<T> {
  success: true;
  data: T;
}

interface ApiErr {
  success: false;
  error: string;
  message?: string;
  details?: unknown;
}

type ApiResult<T> = ApiOk<T> | ApiErr;

async function readJson<T>(res: Response): Promise<ApiResult<T>> {
  try {
    return (await res.json()) as ApiResult<T>;
  } catch {
    return { success: false, error: `HTTP ${res.status}` };
  }
}

export async function fetchIgDmConversations(params: {
  institutionId: string;
  hasLead?: 'true' | 'false';
  limit?: number;
  offset?: number;
}): Promise<IgDmConversationsResponse> {
  const sp = new URLSearchParams();
  sp.set('institution_id', params.institutionId);
  if (params.hasLead) sp.set('has_lead', params.hasLead);
  if (params.limit != null) sp.set('limit', String(params.limit));
  if (params.offset != null) sp.set('offset', String(params.offset));

  const res = await fetch(`/api/social/instagram/dm/conversations?${sp.toString()}`);
  const body = await readJson<IgDmConversationsResponse>(res);
  if (!body.success) {
    throw new Error(body.error || 'Failed to load IG DM conversations');
  }
  return body.data;
}

export async function fetchIgDmMessages(params: {
  conversationId: string;
  limit?: number;
  offset?: number;
}): Promise<IgDmMessagesResponse> {
  const sp = new URLSearchParams();
  if (params.limit != null) sp.set('limit', String(params.limit));
  if (params.offset != null) sp.set('offset', String(params.offset));

  const qs = sp.toString();
  const url =
    `/api/social/instagram/dm/conversations/${encodeURIComponent(params.conversationId)}/messages` +
    (qs ? `?${qs}` : '');

  const res = await fetch(url);
  const body = await readJson<IgDmMessagesResponse>(res);
  if (!body.success) {
    throw new Error(body.error || 'Failed to load IG DM messages');
  }
  return body.data;
}

export interface IgDmReplyOk {
  message_id: string;
  recipient_id: string;
}

export interface IgDmReplyWindowError {
  kind: 'outside_window';
  message: string;
  lastInboundAt: string | null;
  hoursElapsed: number | null;
}

/**
 * Sends an outbound reply. Returns `{ kind: 'outside_window', ... }` instead
 * of throwing when the 24-hour messaging window has expired, so the inbox
 * can render a clear notice rather than a generic error. All other failure
 * modes throw.
 */
export async function sendIgDmReply(params: {
  conversationId: string;
  text: string;
}): Promise<IgDmReplyOk | IgDmReplyWindowError> {
  const res = await fetch(
    `/api/social/instagram/dm/conversations/${encodeURIComponent(params.conversationId)}/reply`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: params.text }),
    }
  );

  if (res.status === 422) {
    const body = await readJson<unknown>(res);
    // Nested narrowing (not compound `&&`) so TS reliably narrows `body` to ApiErr
    // before we touch `body.error`, `body.details`, `body.message`. Strict-mode
    // discriminated-union narrowing can drop across `&&` boundaries in some
    // configs (exactOptionalPropertyTypes etc.); this shape is robust.
    if (!body.success) {
      if (body.error === 'outside_messaging_window') {
        const details = (body.details ?? {}) as {
          last_inbound_at?: string | null;
          hours_elapsed?: number | null;
        };
        return {
          kind: 'outside_window',
          message: body.message ?? 'Messaging window expired.',
          lastInboundAt: details.last_inbound_at ?? null,
          hoursElapsed: details.hours_elapsed ?? null,
        };
      }
    }
  }

  const body = await readJson<IgDmReplyOk>(res);
  if (!body.success) {
    throw new Error(body.error || 'Reply failed');
  }
  return body.data;
}
