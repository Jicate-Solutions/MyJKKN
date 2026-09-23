/**
 * AskAssistantRules — the pure rules behind the "Ask" button that sits on
 * every MyJKKN page, and the page note the AI receives from it.
 *
 * Pure: no React, no browser APIs. Imported by the button (client), by
 * useAIQuery (client) and by app/api/ai-query/route.ts (server), so the note
 * is WRITTEN in one place and READ BACK (stripped) with the same format.
 */

/** Where a question was asked from. Sent only by the Ask panel. */
export interface AskPageContext {
  /** The pathname, e.g. "/billing/receipts". */
  path: string;
  /** A human page name, e.g. "Receipts". */
  title?: string;
}

/** The marker the note starts with. The drain sees it; the person never does. */
const NOTE_LEAD = '\n\n(Asked from the ';

const MAX_PATH = 200;
const MAX_TITLE = 80;

/** Remove control characters and line breaks, collapse spaces, trim. */
function clean(raw: string, max: number): string {
  return raw
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/[()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * Narrow an untrusted request field to a safe page context, or null.
 * A path must be an in-app absolute path ("/..."), never a full URL.
 */
export function sanitizePageContext(raw: unknown): AskPageContext | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.path !== 'string') return null;
  const path = clean(r.path, MAX_PATH);
  if (!path.startsWith('/') || path.startsWith('//')) return null;
  const title = typeof r.title === 'string' ? clean(r.title, MAX_TITLE) : '';
  return title ? { path, title } : { path };
}

/**
 * The message the AI receives: what the person typed, plus one short note
 * naming the page they asked from. No context → the message unchanged.
 */
export function withPageNote(message: string, ctx: AskPageContext | null): string {
  if (!ctx) return message;
  const name = ctx.title && ctx.title.length > 0 ? ctx.title : ctx.path;
  return `${message}${NOTE_LEAD}${name} page, ${ctx.path})`;
}

/**
 * Undo withPageNote for display: the person's own bubble shows only what they
 * typed, including when a past conversation is reopened from history.
 */
export function stripPageNote(message: string): string {
  const at = message.lastIndexOf(NOTE_LEAD);
  if (at < 0 || !message.endsWith(')')) return message;
  return message.slice(0, at);
}

/**
 * Whether the floating Ask button shows. It needs the ai_query.view
 * permission (decided by the caller, super admins included), and it hides on
 * the assistant's own page, where the full assistant is already on screen.
 */
export function shouldShowAskButton(pathname: string | null | undefined, canUseAssistant: boolean): boolean {
  if (!canUseAssistant) return false;
  const p = pathname ?? '';
  if (p === '/ai-query' || p.startsWith('/ai-query/')) return false;
  return true;
}

/**
 * A readable page name from breadcrumb labels (Home first). An id segment
 * reads as "Details", which alone names nothing, so it borrows its parent.
 */
export function pageTitleFromCrumbs(labels: string[]): string {
  const rest = labels.slice(1);
  if (rest.length === 0) return 'Home';
  const last = rest[rest.length - 1];
  if (last === 'Details' && rest.length > 1) return `${rest[rest.length - 2]} details`;
  return last;
}
