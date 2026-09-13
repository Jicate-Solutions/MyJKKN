// app/api/whatsapp-bridge/_lib/bridge-auth.ts
//
// Shared authentication for the bridge-facing endpoints.
//
// The on-campus WhatsApp bridge is a Go process on a Windows machine behind NAT.
// It has no MyJKKN user account and cannot hold a Supabase session, so it
// authenticates with one shared secret in the `x-bridge-secret` header.
//
// TWO invariants live here, and they are the point of this file:
//
//   1. A bridge route accepts ONLY the secret. It never reads a user session,
//      so a signed-in member of staff cannot claim the queue, forge a delivery
//      receipt, or post a message that appears to have come from a parent.
//
//   2. A user route accepts ONLY a session. `rejectsBridgeSecret` makes that
//      explicit rather than implicit: presenting the shared secret to a
//      user-facing endpoint is refused outright instead of being ignored. A
//      secret that leaks (it lives in a config file on a Windows box in a staff
//      room) must not become a way to read the staff screens.
//
// The secret is never logged and never returned in a response body.

import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

/**
 * Largest raw JSON envelope any bridge endpoint will read, in BYTES.
 *
 * ⚠️ This is a transport guard, NOT the message-length rule. The two were once
 * the same number (4096) and that was a real defect: WhatsApp's 4096 limit is
 * counted in CHARACTERS, and a Tamil character is three bytes in UTF-8, so a
 * parent writing in Tamil was refused at roughly 1,300 characters — well inside
 * what WhatsApp itself allows, and invisible to the person who wrote it.
 * JKKN's families write in Tamil, so this cap is now set generously enough that
 * no script is disadvantaged by its own encoding. Message length is enforced
 * separately, in characters, by MAX_MESSAGE_CHARS.
 */
export const MAX_ENVELOPE_BYTES = 64 * 1024;

/**
 * Longest message body, in CHARACTERS, that WhatsApp itself will carry.
 *
 * Counted with the spread form (`[...str].length`) rather than `String.length`,
 * so an astral character — an emoji, or a rarer Indic sign outside the BMP —
 * counts once instead of twice. `String.length` counts UTF-16 code units, which
 * would make an emoji-heavy message look twice as long as it is.
 */
export const MAX_MESSAGE_CHARS = 4096;

/** Character count as WhatsApp counts it: one per code point, not per code unit. */
export function messageCharLength(value: string): number {
  return [...value].length;
}

/** Largest batch a single pending poll may claim. */
export const MAX_PENDING_LIMIT = 50;

/** Default batch size when the poll does not ask for one. */
export const DEFAULT_PENDING_LIMIT = 20;

/**
 * Constant-time secret comparison.
 *
 * timingSafeEqual throws when the two buffers differ in length, so length is
 * compared first. That leaks the secret's length, which is not meaningfully
 * exploitable; a byte-wise early return would leak the secret itself.
 */
function matchesSecret(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Authenticate a bridge-facing request.
 *
 * Returns the response to send back when the caller is NOT the bridge, and null
 * when it is. A null-means-authenticated shape rather than a discriminated
 * union on purpose: this repo compiles with `strictNullChecks: false`
 * (tsconfig.json, "TEMPORARY: Relaxed for Next.js 16 migration"), under which a
 * `{ ok: true } | { ok: false; response }` union does NOT narrow on `!auth.ok`
 * — every caller would then need a cast, and a cast in an authentication path
 * is exactly where a mistake stops being visible.
 *
 * Returns 503 — not 401 — when WHATSAPP_BRIDGE_SECRET is unset on the server.
 * An unset secret is a deployment fault on our side, and answering 401 would
 * send an operator hunting for a wrong value on the Windows box. It must never
 * fall through to success: an empty expected secret would otherwise make every
 * caller with an empty header a valid bridge.
 */
export function authenticateBridge(request: Request): NextResponse | null {
  const expected = process.env.WHATSAPP_BRIDGE_SECRET;

  if (!expected) {
    return NextResponse.json(
      { error: 'Bridge endpoint is not configured on this deployment' },
      { status: 503 }
    );
  }

  if (!matchesSecret(request.headers.get('x-bridge-secret'), expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}

/**
 * Refuse a user-facing request that presents the bridge secret.
 *
 * Returns a 401 response to send back, or null when the request is clean. The
 * header's VALUE is never compared — presenting it at all is the refusal, so
 * this cannot become a second place the secret is checked and therefore cannot
 * become a second place it is accepted.
 */
export function rejectsBridgeSecret(request: Request): NextResponse | null {
  if (request.headers.get('x-bridge-secret') === null) return null;
  return NextResponse.json(
    { error: 'This endpoint requires a signed-in user, not the bridge secret' },
    { status: 401 }
  );
}

export interface BodyReadResult<T> {
  /** The response to send back, or null when the body parsed cleanly. */
  response: NextResponse | null;
  /** The parsed body, or null when `response` is set. */
  body: T | null;
}

/**
 * Read and parse a JSON object body, refusing anything over MAX_ENVELOPE_BYTES.
 *
 * The byte cap is applied to the raw text before JSON.parse, so an absurd
 * payload is discarded without being parsed. It is a transport guard only: the
 * message-length rule is MAX_MESSAGE_CHARS, counted in characters by the route
 * that owns the field, because a byte cap silently punishes Tamil.
 *
 * A body that parses to anything other than a JSON OBJECT — `null`, a bare
 * number, a string, an array — is refused here with 400. Every caller
 * immediately destructures what comes back, and a literal `null` body would
 * otherwise throw inside the route and be answered as a 500: "we are broken"
 * instead of "your request was malformed". So when `response` is null, `body`
 * is guaranteed to be a non-null, non-array object.
 *
 * Same null-means-proceed shape as authenticateBridge, and for the same reason:
 * `strictNullChecks` is off in this repo, so a discriminated union would not
 * narrow at the call site.
 */
export async function readJsonBody<T>(request: Request): Promise<BodyReadResult<T>> {
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return {
      response: NextResponse.json({ error: 'Could not read request body' }, { status: 400 }),
      body: null,
    };
  }

  if (Buffer.byteLength(raw, 'utf8') > MAX_ENVELOPE_BYTES) {
    return {
      response: NextResponse.json(
        { error: `Request body exceeds ${MAX_ENVELOPE_BYTES} bytes` },
        { status: 413 }
      ),
      body: null,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      response: NextResponse.json({ error: 'Body is not valid JSON' }, { status: 400 }),
      body: null,
    };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {
      response: NextResponse.json(
        { error: 'Body must be a JSON object' },
        { status: 400 }
      ),
      body: null,
    };
  }

  return { response: null, body: parsed as T };
}

/** Clamp a caller-supplied `limit` into [1, MAX_PENDING_LIMIT]. */
export function clampLimit(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed)) return DEFAULT_PENDING_LIMIT;
  return Math.min(Math.max(parsed, 1), MAX_PENDING_LIMIT);
}
