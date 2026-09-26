// lib/services/integrations/google-read/readers.ts
//
// SERVER-ONLY. The four readers. Each takes an access token that was minted
// from the CALLER's own grant (connection.ts) — they have no idea whose token
// it is and no way to ask for anybody else's. Read-only Google endpoints only:
// nothing here can send, change, move or delete a message or a file.
//
// Transport: native fetch, same as google-calendar-service.ts (no googleapis
// SDK — the surface stays small and auditable, and tests can stub fetch).

import { DEFAULT_RESULTS, GOOGLE_FETCH_TIMEOUT_MS, MAX_RESULTS, MAX_TEXT_CHARS } from './constants';

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const DRIVE = 'https://www.googleapis.com/drive/v3';

const GOOGLE_DOC = 'application/vnd.google-apps.document';
const GOOGLE_SHEET = 'application/vnd.google-apps.spreadsheet';

type FetchLike = typeof fetch;

/** Google answered, but not with success. `reason` is Google's own code. */
export class GoogleApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly reason: string,
  ) {
    super(`Google API ${status}${reason ? ` (${reason})` : ''}`);
    this.name = 'GoogleApiError';
  }
}

// A hung Google request gives up after GOOGLE_FETCH_TIMEOUT_MS; the abort
// throws, and the endpoint turns it into ok:false "Google did not answer".
function googleGet(url: string, accessToken: string, fetchImpl: FetchLike): Promise<Response> {
  return fetchImpl(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(GOOGLE_FETCH_TIMEOUT_MS),
  });
}

async function getJson<T>(url: string, accessToken: string, fetchImpl: FetchLike): Promise<T> {
  const res = await googleGet(url, accessToken, fetchImpl);
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as T;
}

async function getText(url: string, accessToken: string, fetchImpl: FetchLike): Promise<string> {
  const res = await googleGet(url, accessToken, fetchImpl);
  if (!res.ok) throw await toApiError(res);
  return res.text();
}

async function toApiError(res: Response): Promise<GoogleApiError> {
  let reason = '';
  try {
    const body = (await res.json()) as {
      error?: { errors?: Array<{ reason?: string }>; status?: string };
    };
    reason = body.error?.errors?.[0]?.reason ?? body.error?.status ?? '';
  } catch {
    /* body was not JSON */
  }
  return new GoogleApiError(res.status, reason);
}

// ── text helpers (exported for tests) ────────────────────────────────────────

export function clampLimit(limit: unknown, fallback: number): number {
  const n = typeof limit === 'number' && Number.isFinite(limit) ? Math.floor(limit) : fallback;
  return Math.min(MAX_RESULTS, Math.max(1, n));
}

/** Cut to at most `max` characters and say whether anything was cut. */
export function trimText(text: string, max: number = MAX_TEXT_CHARS): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return { text: text.slice(0, max), truncated: true };
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (whole, code: string) => {
    const lower = code.toLowerCase();
    if (lower in ENTITIES) return ENTITIES[lower];
    if (lower.startsWith('#x')) {
      const cp = parseInt(lower.slice(2), 16);
      return Number.isFinite(cp) && cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : whole;
    }
    if (lower.startsWith('#')) {
      const cp = parseInt(lower.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : whole;
    }
    return whole;
  });
}

/** Mail HTML → readable plain text. Not a renderer; good enough to read. */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|table|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(text)
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

// ── Gmail ────────────────────────────────────────────────────────────────────

interface GmailHeader { name?: string; value?: string }
interface GmailPart {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string; attachmentId?: string };
  parts?: GmailPart[];
}
interface GmailMessage {
  id: string;
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
}

function header(part: GmailPart | undefined, name: string): string {
  const h = part?.headers?.find((x) => (x.name ?? '').toLowerCase() === name.toLowerCase());
  return h?.value ?? '';
}

function dateOf(msg: GmailMessage): string {
  const raw = header(msg.payload, 'Date');
  if (raw) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const ms = Number(msg.internalDate);
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : raw;
}

/** Every inline (non-attachment) body part of one mime type, in order. */
function collectBodies(part: GmailPart | undefined, mimeType: string, out: string[]): void {
  if (!part) return;
  if (part.filename) return; // an attachment, not the message
  if (part.mimeType === mimeType && part.body?.data) out.push(decodeBase64Url(part.body.data));
  for (const child of part.parts ?? []) collectBodies(child, mimeType, out);
}

export function extractMailText(payload: GmailPart | undefined): string {
  const plain: string[] = [];
  collectBodies(payload, 'text/plain', plain);
  if (plain.length) return plain.join('\n\n').replace(/\r\n/g, '\n').trim();
  const html: string[] = [];
  collectBodies(payload, 'text/html', html);
  return html.map(htmlToText).join('\n\n').trim();
}

export interface MailHit {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
}

export async function searchMyMail(
  accessToken: string,
  query: string,
  limit: number,
  fetchImpl: FetchLike = fetch,
): Promise<MailHit[]> {
  const params = new URLSearchParams({ maxResults: String(clampLimit(limit, DEFAULT_RESULTS)) });
  if (query.trim()) params.set('q', query.trim());
  const list = await getJson<{ messages?: Array<{ id: string }> }>(
    `${GMAIL}/messages?${params.toString()}`,
    accessToken,
    fetchImpl,
  );
  const ids = (list.messages ?? []).slice(0, MAX_RESULTS).map((m) => m.id);

  const meta = new URLSearchParams({ format: 'metadata' });
  for (const h of ['From', 'Subject', 'Date']) meta.append('metadataHeaders', h);

  // One GET per hit. A message deleted between the list and its GET answers
  // 404: drop THAT hit and keep the rest. Any other failure still fails the
  // search, so a real Google problem is never reported as "nothing found".
  const fetched = await Promise.all(
    ids.map((id) =>
      getJson<GmailMessage>(
        `${GMAIL}/messages/${encodeURIComponent(id)}?${meta.toString()}`,
        accessToken,
        fetchImpl,
      ).catch((err: unknown) => {
        if (err instanceof GoogleApiError && err.status === 404) return null;
        throw err;
      }),
    ),
  );
  const messages = fetched.filter((m): m is GmailMessage => m !== null);
  return messages.map((m) => ({
    id: m.id,
    from: header(m.payload, 'From'),
    subject: header(m.payload, 'Subject'),
    date: dateOf(m),
    snippet: decodeEntities(m.snippet ?? ''),
  }));
}

export interface MailMessage {
  id: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  text: string;
  truncated: boolean;
}

export async function readMyMail(
  accessToken: string,
  id: string,
  fetchImpl: FetchLike = fetch,
): Promise<MailMessage> {
  const msg = await getJson<GmailMessage>(
    `${GMAIL}/messages/${encodeURIComponent(id)}?format=full`,
    accessToken,
    fetchImpl,
  );
  const { text, truncated } = trimText(extractMailText(msg.payload));
  return {
    id: msg.id,
    from: header(msg.payload, 'From'),
    to: header(msg.payload, 'To'),
    subject: header(msg.payload, 'Subject'),
    date: dateOf(msg),
    text,
    truncated,
  };
}

// ── Drive ────────────────────────────────────────────────────────────────────

interface DriveFile {
  id: string;
  name?: string;
  mimeType?: string;
  modifiedTime?: string;
  webViewLink?: string;
}

const FRIENDLY_TYPES: Record<string, string> = {
  [GOOGLE_DOC]: 'Google Doc',
  [GOOGLE_SHEET]: 'Google Sheet',
  'application/vnd.google-apps.presentation': 'Google Slides',
  'application/vnd.google-apps.form': 'Google Form',
  'application/vnd.google-apps.folder': 'Folder',
  'application/pdf': 'PDF',
};

export function friendlyType(mimeType: string | undefined): string {
  if (!mimeType) return 'File';
  return FRIENDLY_TYPES[mimeType] ?? mimeType;
}

/** A Drive query literal: backslash and quote escaped, per the Drive docs. */
export function driveLiteral(s: string): string {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

export function buildDriveQuery(query: string): string {
  const words = query.trim();
  if (!words) return 'trashed = false';
  const lit = driveLiteral(words);
  return `(name contains ${lit} or fullText contains ${lit}) and trashed = false`;
}

export interface DriveHit {
  id: string;
  name: string;
  type: string;
  modified: string;
  link: string;
}

export interface DriveSearchResult {
  files: DriveHit[];
  /** Google's incompleteSearch: some shared drives could not be searched. */
  incomplete: boolean;
}

export async function searchMyDrive(
  accessToken: string,
  query: string,
  limit: number,
  fetchImpl: FetchLike = fetch,
): Promise<DriveSearchResult> {
  const params = new URLSearchParams({
    q: buildDriveQuery(query),
    pageSize: String(clampLimit(limit, DEFAULT_RESULTS)),
    fields: 'incompleteSearch,files(id,name,mimeType,modifiedTime,webViewLink)',
    // corpora=allDrives = My Drive AND every shared drive the person is a
    // member of. The default corpus ('user') covers only files the person
    // created, opened or was shared on directly, so shared-drive files would
    // be silently missing. allDrives requires the two flags below.
    corpora: 'allDrives',
    includeItemsFromAllDrives: 'true',
    supportsAllDrives: 'true',
    spaces: 'drive',
  });
  // Drive refuses orderBy on a fullText query (results come by relevance);
  // with no words, newest first is the useful order.
  if (!query.trim()) params.set('orderBy', 'modifiedTime desc');
  const json = await getJson<{ files?: DriveFile[]; incompleteSearch?: boolean }>(
    `${DRIVE}/files?${params.toString()}`,
    accessToken,
    fetchImpl,
  );
  return {
    files: (json.files ?? []).slice(0, MAX_RESULTS).map((f) => ({
      id: f.id,
      name: f.name ?? '',
      type: friendlyType(f.mimeType),
      modified: f.modifiedTime ?? '',
      link: f.webViewLink ?? '',
    })),
    incomplete: json.incompleteSearch === true,
  };
}

export interface DriveFileText {
  id: string;
  name: string;
  type: string;
  modified: string;
  link: string;
  /** text = Google Doc, csv = Google Sheet (first sheet), none = name + link only. */
  format: 'text' | 'csv' | 'none';
  text: string;
  truncated: boolean;
}

export async function readMyDriveFile(
  accessToken: string,
  id: string,
  fetchImpl: FetchLike = fetch,
): Promise<DriveFileText> {
  const meta = await getJson<DriveFile>(
    `${DRIVE}/files/${encodeURIComponent(id)}?${new URLSearchParams({
      fields: 'id,name,mimeType,modifiedTime,webViewLink',
      supportsAllDrives: 'true',
    }).toString()}`,
    accessToken,
    fetchImpl,
  );
  const base = {
    id: meta.id,
    name: meta.name ?? '',
    type: friendlyType(meta.mimeType),
    modified: meta.modifiedTime ?? '',
    link: meta.webViewLink ?? '',
  };

  const exportAs =
    meta.mimeType === GOOGLE_DOC ? 'text/plain' : meta.mimeType === GOOGLE_SHEET ? 'text/csv' : null;

  if (!exportAs) {
    return {
      ...base,
      format: 'none',
      text: `"${base.name}" is a ${base.type}. Only Google Docs and Google Sheets can be read; open it here: ${base.link}`,
      truncated: false,
    };
  }

  const raw = await getText(
    `${DRIVE}/files/${encodeURIComponent(id)}/export?${new URLSearchParams({ mimeType: exportAs }).toString()}`,
    accessToken,
    fetchImpl,
  );
  // Docs export with a byte-order mark; drop it so it does not count as a char.
  const { text, truncated } = trimText(raw.replace(/^﻿/, ''));
  return { ...base, format: exportAs === 'text/csv' ? 'csv' : 'text', text, truncated };
}
