// lib/services/integrations/google-read/endpoint.ts
//
// SERVER-ONLY. The one handler behind the four assistant tools
// (app/api/ai-tools/google/*). Each route file is a single line naming its tool.
//
// Order of checks, and what the caller hears:
//   1. Who is it? (Bearer access token, or the cookie session)  → 401
//   2. Is the switch on? (ai.google_read.enabled)               → "not switched on yet"
//   3. May they use the assistant? (ai_query.view triad)         → 403
//   4. Is the input sane?                                        → 400
//   5. Have THEY connected Google, and allowed this scope?       → plain sentence
//   6. Ask Google, as them.                                      → the result
//
// "Plain sentence" answers (switch off, not connected, reconnect, box unticked,
// no such message) come back as HTTP 200 with ok:false, a fixed `code` and a
// `message` the assistant can repeat to the person word for word. They are
// states of the person's setup, not failures of the request.
//
// Every call that got past step 1 writes one audit row: who, which tool, when,
// the outcome code. Never the query, never the content, never an id.
//
// Every successful answer opens with `untrusted_content: true` and a `note`
// (UNTRUSTED_NOTE): the mail and file text inside was written by somebody else
// and is data, never instructions.

import { NextResponse } from 'next/server';
import { canUseAssistant, resolveGoogleReadCaller } from './auth';
import { getOwnAccessToken, isGoogleReadEnabled, logGoogleRead } from './connection';
import {
  DEFAULT_RESULTS,
  DRIVE_READONLY_SCOPE,
  GMAIL_READONLY_SCOPE,
  MAX_QUERY_CHARS,
  UNTRUSTED_NOTE,
  type GoogleReadTool,
} from './constants';
import {
  GoogleApiError,
  clampLimit,
  readMyDriveFile,
  readMyMail,
  searchMyDrive,
  searchMyMail,
} from './readers';

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export interface GoogleReadToolSpec<T> {
  tool: GoogleReadTool;
  needs: 'mail' | 'drive';
  parse(input: Record<string, unknown>): Parsed<T>;
  run(accessToken: string, value: T): Promise<Record<string, unknown>>;
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;

const WHERE_TO_CONNECT =
  'They can connect it in MyJKKN under Meetings > My Availability > "Let the assistant read my Gmail and Drive". If they cannot open that page, their role does not include it yet, and their MyJKKN administrator can help.';

export const PLAIN = {
  disabled:
    'Reading Gmail and Drive is not switched on yet in MyJKKN. Nothing was read.',
  not_connected: `This person has not connected their Google account to the assistant, so their mail and Drive cannot be read. ${WHERE_TO_CONNECT}`,
  reconnect_needed: `This person's Google connection has stopped working (it was removed or their password changed), so nothing could be read. They need to connect it again. ${WHERE_TO_CONNECT}`,
  missing_scope_mail: `When this person connected Google they did not allow mail reading, so their mail cannot be read. They can connect again and tick the Gmail box. ${WHERE_TO_CONNECT}`,
  missing_scope_drive: `When this person connected Google they did not allow Drive reading, so their files cannot be read. They can connect again and tick the Drive box. ${WHERE_TO_CONNECT}`,
  not_found: 'Nothing with that id was found in this person\'s own mail or Drive.',
  google_error: 'Google did not answer the request just now. Nothing was read; try again in a minute.',
} as const;

function json(status: number, body: Record<string, unknown>): NextResponse {
  return NextResponse.json(body, { status });
}

function parseSearch(input: Record<string, unknown>): Parsed<{ query: string; limit: number }> {
  const query = input.query ?? '';
  if (typeof query !== 'string') return { ok: false, error: 'query must be text.' };
  if (query.length > MAX_QUERY_CHARS) {
    return { ok: false, error: `query must be at most ${MAX_QUERY_CHARS} characters.` };
  }
  if (input.limit !== undefined && (typeof input.limit !== 'number' || !Number.isFinite(input.limit))) {
    return { ok: false, error: 'limit must be a number from 1 to 10.' };
  }
  return { ok: true, value: { query, limit: clampLimit(input.limit, DEFAULT_RESULTS) } };
}

function parseId(input: Record<string, unknown>): Parsed<{ id: string }> {
  const id = input.id;
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    return { ok: false, error: 'id must be an id returned by the matching search tool.' };
  }
  return { ok: true, value: { id } };
}

export const MAIL_SEARCH: GoogleReadToolSpec<{ query: string; limit: number }> = {
  tool: 'google_mail_search',
  needs: 'mail',
  parse: parseSearch,
  run: async (token, v) => ({ messages: await searchMyMail(token, v.query, v.limit) }),
};

export const MAIL_READ: GoogleReadToolSpec<{ id: string }> = {
  tool: 'google_mail_read',
  needs: 'mail',
  parse: parseId,
  run: async (token, v) => ({ message: await readMyMail(token, v.id) }),
};

export const DRIVE_SEARCH: GoogleReadToolSpec<{ query: string; limit: number }> = {
  tool: 'google_drive_search',
  needs: 'drive',
  parse: parseSearch,
  run: async (token, v) => {
    const found = await searchMyDrive(token, v.query, v.limit);
    // incomplete_search = Google could not search every shared drive this time.
    return { files: found.files, incomplete_search: found.incomplete };
  },
};

export const DRIVE_READ: GoogleReadToolSpec<{ id: string }> = {
  tool: 'google_drive_read',
  needs: 'drive',
  parse: parseId,
  run: async (token, v) => ({ file: await readMyDriveFile(token, v.id) }),
};

export async function handleGoogleReadTool<T>(
  request: Request,
  spec: GoogleReadToolSpec<T>,
): Promise<NextResponse> {
  // 1. who
  const caller = await resolveGoogleReadCaller(request);
  if (!caller) {
    return json(401, {
      ok: false,
      code: 'not_signed_in',
      message: 'Sign in first: send the person\'s own MyJKKN access token as "Authorization: Bearer <token>", or call from a signed-in browser.',
    });
  }
  const { supabase, userId } = caller;
  const done = async (outcome: string, status: number, body: Record<string, unknown>) => {
    await logGoogleRead(userId, spec.tool, outcome);
    return json(status, body);
  };

  // 2. switch
  if (!(await isGoogleReadEnabled(supabase))) {
    return done('disabled', 200, { ok: false, code: 'disabled', message: PLAIN.disabled });
  }

  // 3. may they use the assistant
  if (!(await canUseAssistant(supabase))) {
    return done('forbidden', 403, {
      ok: false,
      code: 'forbidden',
      message: 'This person does not have access to the AI Assistant (ai_query.view).',
    });
  }

  // 4. input
  let input: Record<string, unknown> = {};
  try {
    const raw = await request.json();
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) input = raw as Record<string, unknown>;
  } catch {
    return done('bad_input', 400, { ok: false, code: 'bad_input', message: 'The body must be JSON.' });
  }
  const parsed = spec.parse(input);
  if (parsed.ok === false) {
    return done('bad_input', 400, { ok: false, code: 'bad_input', message: parsed.error });
  }

  // 5. their own connection, and the scope this tool needs — the access token
  //    is minted carrying ONLY that one read scope.
  const requiredScope = spec.needs === 'mail' ? GMAIL_READONLY_SCOPE : DRIVE_READONLY_SCOPE;
  const access = await getOwnAccessToken(supabase, userId, requiredScope);
  if (access.status === 'not_connected') {
    return done('not_connected', 200, { ok: false, code: 'not_connected', message: PLAIN.not_connected });
  }
  if (access.status === 'reconnect_needed') {
    return done('reconnect_needed', 200, {
      ok: false,
      code: 'reconnect_needed',
      message: PLAIN.reconnect_needed,
    });
  }
  if (access.status === 'missing_scope') {
    return done('missing_scope', 200, {
      ok: false,
      code: 'missing_scope',
      message: spec.needs === 'mail' ? PLAIN.missing_scope_mail : PLAIN.missing_scope_drive,
    });
  }
  if (access.status !== 'ok') {
    return done('google_error', 502, { ok: false, code: 'google_error', message: PLAIN.google_error });
  }

  // 6. ask Google, as them
  try {
    const result = await spec.run(access.accessToken, parsed.value);
    // The fixed marker and note come FIRST, before any text somebody else wrote.
    return done('ok', 200, {
      ok: true,
      untrusted_content: true,
      note: UNTRUSTED_NOTE[spec.needs],
      ...result,
    });
  } catch (err) {
    // "Nothing with that id" is an answer only a READ can give. Gmail answers
    // 400 "Invalid id value" for an id that is not a message id, which on a
    // read means the same as 404. A search never maps to not_found: a message
    // deleted mid-search is dropped inside searchMyMail, not reported here.
    const isReadTool = spec.tool === 'google_mail_read' || spec.tool === 'google_drive_read';
    if (isReadTool && err instanceof GoogleApiError && (err.status === 404 || err.status === 400)) {
      return done('not_found', 200, { ok: false, code: 'not_found', message: PLAIN.not_found });
    }
    console.error(`[google-read] ${spec.tool} failed:`, (err as Error).message);
    return done('google_error', 502, { ok: false, code: 'google_error', message: PLAIN.google_error });
  }
}
