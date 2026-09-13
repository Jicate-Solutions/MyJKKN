// lib/services/events/organiser-message-compose.ts
//
// The compose-side idempotency rule, in a module with NO imports so both the
// browser board and the server service can use it. (organiser-message-service.ts
// pulls in the notification fanout and must never reach the client bundle.)
//
// ---------------------------------------------------------------------------
// Why the token is bound to the CONTENT, not to the attempt
// ---------------------------------------------------------------------------
// `client_token` is what the UNIQUE (event_id, client_token) constraint on
// event_registrant_messages collapses a repeat submit onto, and what the fanout
// idempotency key is ultimately derived from. It therefore has to survive the
// one path a human actually repeats: a send that LOOKED like it failed.
//
// Minting a fresh token after a failure destroys the guard exactly where the
// risk lives. A request that times out client-side may well have committed
// server-side; the organiser sees an error, presses send again, and with a new
// token that retry claims a new ledger row, gets a new fanout key, and delivers
// the same announcement to the same learners a second time.
//
// So: the same subject and body always carry the same token, however many times
// they are retried. Editing either is a different message and earns a new
// token. A confirmed send clears the binding, so the next message is genuinely
// the next one.

/**
 * How far a recorded send actually got, as the history is allowed to state it.
 *
 *   delivered   — the fanout reported recipients, or a notification exists.
 *   unconfirmed — the row was claimed and the ledger never heard back.
 *
 * The third state a reader expects — "failed, nothing was delivered" —
 * deliberately does not exist, because we cannot claim it. A row sits at
 * notification_id NULL / delivered_count 0 when the fanout threw, AND when the
 * fanout fully succeeded and only the write-back afterwards failed. Those are
 * indistinguishable from here, and one of them means every registrant already
 * has the message. Printing "nothing was delivered" over that second case is
 * the exact falsehood that pushes an organiser into a duplicate blast.
 *
 * Lives in this import-free module, next to composeKey and for the same
 * reason: the board must render the same verdict the server records, and
 * organiser-message-service.ts imports the notification fanout so it can never
 * reach the client bundle. One definition, not two that drift.
 */
export function deliveryState(row: {
  notification_id: string | null;
  delivered_count: number;
}): 'delivered' | 'unconfirmed' {
  return !row.notification_id && (row.delivered_count ?? 0) === 0 ? 'unconfirmed' : 'delivered';
}

/**
 * Identity of one composed message. Insensitive to surrounding whitespace.
 *
 * JSON-encoded rather than concatenated with a separator: the encoding is
 * injective, so subject "a" + body "bc" cannot collide with subject "ab" +
 * body "c", and it needs no exotic delimiter byte to achieve that. (The
 * obvious NUL separator is worse than it looks — it makes this source file
 * binary to git.)
 */
export function composeKey(subject: string, body: string): string {
  return JSON.stringify([subject.trim(), body.trim()]);
}

/** A token bound to the content it was minted for. */
export interface ComposeToken {
  key: string;
  token: string;
}

/**
 * The token this compose should be sent with, given whatever binding is already
 * held. Pure, so the rule above is pinned by a test rather than by a comment.
 *
 * @param held  The current binding, or null after a confirmed send.
 * @param key   composeKey() of what is about to be sent.
 * @param mint  UUID generator (injected so tests are deterministic).
 */
export function tokenForCompose(
  held: ComposeToken | null,
  key: string,
  mint: () => string
): ComposeToken {
  if (held && held.key === key) return held;
  return { key, token: mint() };
}

/**
 * A v4 UUID for a fresh compose. `crypto.randomUUID` exists in every browser
 * this app supports; the fallback keeps a non-secure context (and jsdom) from
 * throwing. The server validates the shape either way.
 */
export function mintComposeToken(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (ch) => {
    const n = Number(ch);
    return (n ^ (Math.floor(Math.random() * 256) & (15 >> (n / 4)))).toString(16);
  });
}
