/**
 * Rewrites for the college apps' bug-reporter SDK — served from proxy.ts.
 *
 * Route budget: every dynamic route file (`[id]`) costs two of Vercel's 2048
 * routes per deployment and main sits at the 2000 gate
 * (scripts/ci/check-route-budget.sh). A middleware rewrite costs none. So the
 * SDK's dynamic URLs, which must stay exactly as the central reporter has
 * them, are answered by static route files:
 *
 *   /api/v1/public/bug-reports/<id>           → /api/v1/public/bug-reports/item?id=<id>
 *   /api/v1/public/bug-reports/<id>/messages  → /api/v1/public/bug-reports/item-messages?id=<id>
 *   /api/v1/public/leaderboard/<applicationId> → /api/v1/public/leaderboard
 *
 * The caller keeps the query string (reporter_email, include_messages, period).
 * `me`, `item` and `item-messages` are real static routes beside the bug id, so
 * they are never treated as an id.
 */

const BUG_REPORTS = '/api/v1/public/bug-reports/';
const LEADERBOARD = '/api/v1/public/leaderboard/';
const RESERVED = new Set(['me', 'item', 'item-messages']);

export const SIBLING_INTAKE_ITEM_PATH = '/api/v1/public/bug-reports/item';
export const SIBLING_INTAKE_ITEM_MESSAGES_PATH = '/api/v1/public/bug-reports/item-messages';
export const SIBLING_INTAKE_LEADERBOARD_PATH = '/api/v1/public/leaderboard';

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** The internal path (and bug id, when there is one) for `pathname`, or null. */
export function resolveSiblingIntakeRewrite(
  pathname: string
): { pathname: string; id?: string } | null {
  if (pathname.startsWith(BUG_REPORTS)) {
    const parts = pathname.slice(BUG_REPORTS.length).split('/');
    const [id, sub] = parts;
    if (!id || RESERVED.has(id)) return null;
    if (parts.length === 1) return { pathname: SIBLING_INTAKE_ITEM_PATH, id: decodeSegment(id) };
    if (parts.length === 2 && sub === 'messages') {
      return { pathname: SIBLING_INTAKE_ITEM_MESSAGES_PATH, id: decodeSegment(id) };
    }
    return null;
  }
  if (pathname.startsWith(LEADERBOARD)) {
    const rest = pathname.slice(LEADERBOARD.length);
    if (rest && !rest.includes('/')) return { pathname: SIBLING_INTAKE_LEADERBOARD_PATH };
  }
  return null;
}
